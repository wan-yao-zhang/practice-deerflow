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

async function latestGscBySite(
  db: D1Database,
  siteId: string,
): Promise<MetricsGscDailyRow | null> {
  return db
    .prepare(
      `SELECT * FROM metrics_gsc_daily WHERE metrics_site_id = ? ORDER BY date DESC LIMIT 1`,
    )
    .bind(siteId)
    .first<MetricsGscDailyRow>();
}

async function latestGa4BySite(
  db: D1Database,
  siteId: string,
): Promise<MetricsGa4DailyRow | null> {
  return db
    .prepare(
      `SELECT * FROM metrics_ga4_daily WHERE metrics_site_id = ? ORDER BY date DESC LIMIT 1`,
    )
    .bind(siteId)
    .first<MetricsGa4DailyRow>();
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

      const gsc = await latestGscBySite(db, site.id);
      const ga4 = await latestGa4BySite(db, site.id);
      const day = gsc?.date || ga4?.date;

      return `<div class="card metric-card">
        <h3><a href="/metrics/${escapeHtml(site.id)}">${escapeHtml(site.host)}</a></h3>
        <div class="meta-row">
          ${badge}
          ${site.display_name ? `<span>${escapeHtml(site.display_name)}</span>` : ""}
          ${day ? `<span>最近日期：${escapeHtml(day)}</span>` : `<span class="muted">暂无快照</span>`}
        </div>
        <div class="grid grid-2" style="margin-top:10px">
          <div>
            <div class="muted" style="font-size:12px">GSC（最近日）</div>
            <div class="metric-big">${gsc ? num(gsc.clicks) : "—"} <span class="muted" style="font-size:14px">点击</span></div>
            <div class="muted" style="font-size:13px">
              展示 ${gsc ? num(gsc.impressions) : "—"} · CTR ${gsc ? pct(gsc.ctr) : "—"} · 排名 ${gsc ? num(gsc.position) : "—"}
            </div>
          </div>
          <div>
            <div class="muted" style="font-size:12px">GA4（最近日）</div>
            <div class="metric-big">${ga4 ? num(ga4.sessions) : "—"} <span class="muted" style="font-size:14px">会话</span></div>
            <div class="muted" style="font-size:13px">
              用户 ${ga4 ? num(ga4.users) : "—"} · 浏览量 ${ga4 ? num(ga4.pageviews) : "—"}
            </div>
          </div>
        </div>
        ${site.last_sync_at ? `<p class="muted" style="font-size:12px;margin-top:10px">上次同步：${escapeHtml(toShanghai(site.last_sync_at))}</p>` : ""}
        ${site.last_sync_error ? `<p class="status fail" style="font-size:12px">${escapeHtml(site.last_sync_error)}</p>` : ""}
      </div>`;
    }),
  );

  const body = `
    <div class="card">
      <h2>数据看板</h2>
      <p class="muted">多站点 Google Search Console + GA4 日快照。定时任务在每日 sitemap 扫描后拉取近 7 天数据。</p>
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
        top = JSON.parse(g.top_queries_json) as GscTopQuery[];
      } catch {
        top = [];
      }
    }
    return { g, ga, top };
  });

  const latestTop = merged[0]?.top ?? [];

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
      ? `<div class="empty">最近一日无 Top 查询数据</div>`
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
      <h2>Top 查询 <span class="muted">${merged[0] ? escapeHtml(merged[0].g.date) : ""}</span></h2>
      ${topQueryTable}
    </div>`;

  return c.html(layout({ title: `${site.host} · 指标`, active: "metrics", body }));
});
