import type { GscTopQuery, MetricsGa4DailyRow, MetricsGscDailyRow, MetricsSiteRow } from "../lib/metrics-types";
import { googleMetricsConfigured } from "../lib/google-auth";
import { syncAllMetrics } from "../metrics/sync";
import { verifyAdminToken } from "../scan/runner";
import { toShanghai } from "../lib/time";
import { escapeHtml, layout } from "./layout";
import { Hono } from "hono";

type AppEnv = { Bindings: Env };

function pct(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

function num(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return String(Math.round(n) === n ? n : n.toFixed(1));
}

function fmtDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

const OVERVIEW_WINDOW_DAYS = 7;

interface GscWindowRollup {
  days: number;
  fromDate: string | null;
  toDate: string | null;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
}

interface Ga4WindowRollup {
  days: number;
  fromDate: string | null;
  toDate: string | null;
  sessions: number;
  users: number;
  pageviews: number;
}

/** Last N calendar days in D1 (sync window). GSC CTR = clicks/impressions; rank = impression-weighted avg position. */
async function gscWindowRollup(
  db: D1Database,
  siteId: string,
  windowDays = OVERVIEW_WINDOW_DAYS,
): Promise<GscWindowRollup | null> {
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) AS days,
         MIN(date) AS from_date,
         MAX(date) AS to_date,
         COALESCE(SUM(clicks), 0) AS clicks,
         COALESCE(SUM(impressions), 0) AS impressions,
         COALESCE(SUM(position * impressions), 0) AS pos_weighted
       FROM metrics_gsc_daily
       WHERE metrics_site_id = ?
         AND date >= date('now', ?)`,
    )
    .bind(siteId, `-${windowDays - 1} days`)
    .first<{
      days: number;
      from_date: string | null;
      to_date: string | null;
      clicks: number;
      impressions: number;
      pos_weighted: number;
    }>();

  if (!row || row.days === 0) return null;

  const clicks = row.clicks ?? 0;
  const impressions = row.impressions ?? 0;
  const ctr = impressions > 0 ? clicks / impressions : null;
  const position = impressions > 0 ? row.pos_weighted / impressions : null;

  return {
    days: row.days,
    fromDate: row.from_date,
    toDate: row.to_date,
    clicks,
    impressions,
    ctr,
    position,
  };
}

async function ga4WindowRollup(
  db: D1Database,
  siteId: string,
  windowDays = OVERVIEW_WINDOW_DAYS,
): Promise<Ga4WindowRollup | null> {
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) AS days,
         MIN(date) AS from_date,
         MAX(date) AS to_date,
         COALESCE(SUM(sessions), 0) AS sessions,
         COALESCE(SUM(users), 0) AS users,
         COALESCE(SUM(pageviews), 0) AS pageviews
       FROM metrics_ga4_daily
       WHERE metrics_site_id = ?
         AND date >= date('now', ?)`,
    )
    .bind(siteId, `-${windowDays - 1} days`)
    .first<{
      days: number;
      from_date: string | null;
      to_date: string | null;
      sessions: number;
      users: number;
      pageviews: number;
    }>();

  if (!row || row.days === 0) return null;

  return {
    days: row.days,
    fromDate: row.from_date,
    toDate: row.to_date,
    sessions: row.sessions ?? 0,
    users: row.users ?? 0,
    pageviews: row.pageviews ?? 0,
  };
}

function windowRangeLabel(
  rollup: { days: number; fromDate: string | null; toDate: string | null },
  windowDays: number,
): string {
  if (rollup.fromDate && rollup.toDate) {
    return rollup.fromDate === rollup.toDate
      ? rollup.toDate
      : `${rollup.fromDate} – ${rollup.toDate}`;
  }
  return rollup.days < windowDays ? `近 ${rollup.days} 天（已同步）` : `近 ${windowDays} 天`;
}

function latestTopQueriesFromRows(
  rows: Array<{ g: MetricsGscDailyRow; top: GscTopQuery[] }>,
): { date: string; top: GscTopQuery[] } | null {
  for (const row of rows) {
    if (row.top.length > 0) return { date: row.g.date, top: row.top };
  }
  return null;
}

export const metricsRoutes = new Hono<AppEnv>();

async function metricsSyncHandler(
  c: import("hono").Context<AppEnv>,
): Promise<Response> {
  const body = await c.req.parseBody().catch(() => ({} as Record<string, unknown>));
  const token =
    c.req.header("x-admin-token") ||
    c.req.query("token") ||
    (typeof body.token === "string" ? body.token : null);
  const ok = await verifyAdminToken(token, c.env.ADMIN_TOKEN);
  if (!ok) return c.json({ error: "unauthorized" }, 401);

  const siteId = c.req.query("site_id") || undefined;
  const lookback = Number(c.req.query("lookback_days") || "7");
  const lookbackDays = Number.isFinite(lookback) && lookback > 0 && lookback <= 28 ? lookback : 7;
  const bg = c.req.query("background") === "1";

  const run = () => syncAllMetrics(c.env, { lookbackDays, siteId });

  if (bg) {
    c.executionCtx.waitUntil(run());
    return c.json({ ok: true, started: true, mode: "background" });
  }

  const result = await run();
  return c.json(result);
}

metricsRoutes.post("/sync", (c) => metricsSyncHandler(c));
metricsRoutes.get("/sync", (c) => metricsSyncHandler(c));

metricsRoutes.get("/", async (c) => {
  const db = c.env.DB;
  const sites = await db
    .prepare(`SELECT * FROM metrics_sites ORDER BY host ASC`)
    .all<MetricsSiteRow>();

  const oauthReady = googleMetricsConfigured(c.env);

  const cards = await Promise.all(
    (sites.results || []).map(async (site) => {
      const connected = site.connected === 1;
      const badge = connected
        ? `<span class="status ok">已接入</span>`
        : `<span class="status pending">未接入</span>`;

      if (!connected) {
        return `<div class="card metric-card">
          <h3><a href="/metrics/${escapeHtml(site.id)}">${escapeHtml(site.host)}</a></h3>
          <div class="meta-row">${badge}</div>
          <p class="muted">此站点尚未关联 GSC / GA4，无指标数据。</p>
        </div>`;
      }

      const gsc = await gscWindowRollup(db, site.id);
      const ga4 = await ga4WindowRollup(db, site.id);
      const gscRange = gsc ? windowRangeLabel(gsc, OVERVIEW_WINDOW_DAYS) : null;
      const ga4Range = ga4 ? windowRangeLabel(ga4, OVERVIEW_WINDOW_DAYS) : null;

      return `<div class="card metric-card">
        <h3><a href="/metrics/${escapeHtml(site.id)}">${escapeHtml(site.host)}</a></h3>
        <div class="meta-row">
          ${badge}
          ${site.display_name ? `<span>${escapeHtml(site.display_name)}</span>` : ""}
        </div>
        <div style="margin-top:12px">
          <div class="muted" style="font-size:12px;margin-bottom:6px">
            GSC · 近 7 天合计
            ${gscRange ? `<span>（${escapeHtml(gscRange)}）</span>` : ""}
          </div>
          ${
            gsc
              ? `<div class="metric-strip">
            <div class="metric-kpi clicks">
              <div class="label">点击</div>
              <div class="value">${num(gsc.clicks)}</div>
            </div>
            <div class="metric-kpi impr">
              <div class="label">展示</div>
              <div class="value">${num(gsc.impressions)}</div>
            </div>
            <div class="metric-kpi rank">
              <div class="label">平均排名</div>
              <div class="value">${num(gsc.position)}</div>
            </div>
          </div>
          <p class="muted" style="font-size:12px;margin:8px 0 0">
            CTR ${pct(gsc.ctr)}（点击÷展示）· 排名按展示加权平均
          </p>`
              : `<p class="muted" style="font-size:13px">暂无 GSC 快照，请先同步。</p>`
          }
        </div>
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
          <div class="muted" style="font-size:12px;margin-bottom:6px">
            GA4 · 近 7 天合计
            ${ga4Range ? `<span>（${escapeHtml(ga4Range)}）</span>` : ""}
          </div>
          ${
            ga4
              ? `<div class="muted" style="font-size:13px">
            会话 <strong style="color:var(--text);font-size:16px">${num(ga4.sessions)}</strong>
            · 用户 ${num(ga4.users)} · 浏览量 ${num(ga4.pageviews)}
          </div>`
              : `<p class="muted" style="font-size:13px">暂无 GA4 快照。</p>`
          }
        </div>
        ${site.last_sync_at ? `<p class="muted" style="font-size:12px;margin-top:10px">上次同步：${escapeHtml(toShanghai(site.last_sync_at))}</p>` : ""}
        ${site.last_sync_error ? `<p class="status fail" style="font-size:12px">${escapeHtml(site.last_sync_error)}</p>` : ""}
      </div>`;
    }),
  );

  const body = `
    <div class="card">
      <h2>数据看板</h2>
      <p class="muted">多站点 Google Search Console + GA4 日快照。总览为<strong style="color:var(--text);font-weight:600">近 7 天合计</strong>（避免 GSC 延迟导致「最近日」全 0）。定时任务在每日 sitemap 扫描后拉取近 7 天数据。</p>
      ${
        oauthReady
          ? `<p class="status ok" style="font-size:13px">OAuth 凭据已配置（Worker secrets）。</p>`
          : `<p class="status fail" style="font-size:13px">未配置 GOOGLE_* secrets，同步将跳过。见 README。</p>`
      }
    </div>
    <div class="grid grid-2">${cards.join("")}</div>`;

  return c.html(layout({ title: "数据看板", active: "metrics", body }));
});

metricsRoutes.get("/:siteId", async (c) => {
  const siteId = c.req.param("siteId");
  const db = c.env.DB;
  const site = await db
    .prepare(`SELECT * FROM metrics_sites WHERE id = ?`)
    .bind(siteId)
    .first<MetricsSiteRow>();
  if (!site) return c.notFound();

  if (site.connected !== 1) {
    const body = `
      <div class="card">
        <h2>${escapeHtml(site.host)}</h2>
        <p><span class="status pending">未接入</span></p>
        <p class="muted">rapsona.online 等产品站尚未在本 Google 账号中开通 GSC/GA4，不显示指标。</p>
        <div class="actions"><a class="btn secondary" href="/metrics">返回总览</a></div>
      </div>`;
    return c.html(layout({ title: site.host, active: "metrics", body }));
  }

  const gscRows = await db
    .prepare(
      `SELECT * FROM metrics_gsc_daily WHERE metrics_site_id = ? ORDER BY date DESC LIMIT 30`,
    )
    .bind(siteId)
    .all<MetricsGscDailyRow>();

  const ga4Rows = await db
    .prepare(
      `SELECT * FROM metrics_ga4_daily WHERE metrics_site_id = ? ORDER BY date DESC LIMIT 30`,
    )
    .bind(siteId)
    .all<MetricsGa4DailyRow>();

  const ga4ByDate = new Map((ga4Rows.results || []).map((r) => [r.date, r]));

  const merged = (gscRows.results || []).map((g) => {
    const ga = ga4ByDate.get(g.date);
    let top: GscTopQuery[] = [];
    if (g.top_queries_json) {
      try {
        const parsed = JSON.parse(g.top_queries_json) as GscTopQuery[];
        top = Array.isArray(parsed) ? parsed.filter((q) => q && q.query) : [];
      } catch {
        top = [];
      }
    }
    return { g, ga, top };
  });

  const topSnapshot = latestTopQueriesFromRows(merged);
  const latestTop = topSnapshot?.top ?? [];

  const tableRows =
    merged.length === 0
      ? `<tr><td colspan="9" class="empty">尚无日快照，请触发同步或等待定时任务。</td></tr>`
      : merged
          .map(
            ({ g, ga }) => `<tr>
        <td>${escapeHtml(g.date)}</td>
        <td>${num(g.clicks)}</td>
        <td>${num(g.impressions)}</td>
        <td>${pct(g.ctr)}</td>
        <td>${num(g.position)}</td>
        <td>${ga ? num(ga.sessions) : "—"}</td>
        <td>${ga ? num(ga.users) : "—"}</td>
        <td>${ga ? num(ga.pageviews) : "—"}</td>
        <td>${ga ? fmtDuration(ga.avg_session_duration) : "—"}</td>
      </tr>`,
          )
          .join("");

  const topQueryTable =
    latestTop.length === 0
      ? `<div class="empty">近 30 日内无 Top 查询快照（可能尚未同步或该段无搜索展示）</div>`
      : `<table>
        <thead><tr><th>查询词</th><th>点击</th><th>展示</th><th>CTR</th><th>排名</th></tr></thead>
        <tbody>
          ${latestTop
            .map(
              (q) => `<tr>
            <td>${escapeHtml(q.query)}</td>
            <td>${num(q.clicks)}</td>
            <td>${num(q.impressions)}</td>
            <td>${pct(q.ctr)}</td>
            <td>${num(q.position)}</td>
          </tr>`,
            )
            .join("")}
        </tbody>
      </table>`;

  const body = `
    <div class="card">
      <h2>${escapeHtml(site.host)}</h2>
      <div class="meta-row">
        <span>GSC：<code class="url">${escapeHtml(site.gsc_site_url || "—")}</code></span>
        <span>GA4：<code class="url">${escapeHtml(site.ga4_property || "—")}</code></span>
        ${site.last_sync_at ? `<span>同步：${escapeHtml(toShanghai(site.last_sync_at))}</span>` : ""}
      </div>
      ${site.last_sync_error ? `<p class="status fail">${escapeHtml(site.last_sync_error)}</p>` : ""}
      <div class="actions">
        <a class="btn secondary" href="/metrics">返回总览</a>
      </div>
    </div>

    <div class="card">
      <h2>每日指标</h2>
      <table>
        <thead>
          <tr>
            <th>日期</th><th>GSC 点击</th><th>展示</th><th>CTR</th><th>排名</th>
            <th>GA4 会话</th><th>用户</th><th>浏览量</th><th>均时长</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>

    <div class="card">
      <h2>Top 查询 <span class="muted">${topSnapshot ? escapeHtml(topSnapshot.date) : ""}</span></h2>
      ${topSnapshot ? `<p class="muted" style="font-size:12px;margin:-6px 0 10px">取最近一个有数据的日历日（非「最新日」，避免 GSC 延迟日为空）</p>` : ""}
      ${topQueryTable}
    </div>`;

  return c.html(layout({ title: `${site.host} · 指标`, active: "metrics", body }));
});
