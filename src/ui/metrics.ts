import type { GscTopQuery, MetricsGa4DailyRow, MetricsGscDailyRow, MetricsSiteRow } from "../lib/metrics-types";
import { googleMetricsConfigured } from "../lib/google-auth";
import { DEFAULT_LOOKBACK_DAYS, syncAllMetrics } from "../metrics/sync";
import { verifyAdminToken } from "../scan/runner";
import { toShanghai } from "../lib/time";
import { escapeHtml, layout } from "./layout";
import {
  POSITION_CHART_COLORS,
  buildChartDates,
  renderClicksSparklineSvg,
  renderPositionChartHtml,
  type PositionChartSeries,
} from "./position-chart";
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

const OVERVIEW_WINDOW_DAYS = DEFAULT_LOOKBACK_DAYS;

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
  avg_session_duration: number | null;
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
         COALESCE(SUM(pageviews), 0) AS pageviews,
         COALESCE(SUM(
           CASE WHEN avg_session_duration IS NOT NULL AND sessions > 0
             THEN avg_session_duration * sessions ELSE 0 END
         ), 0) AS duration_weighted,
         COALESCE(SUM(
           CASE WHEN avg_session_duration IS NOT NULL AND sessions > 0
             THEN sessions ELSE 0 END
         ), 0) AS duration_sessions
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
      duration_weighted: number;
      duration_sessions: number;
    }>();

  if (!row || row.days === 0) return null;

  const durationSessions = row.duration_sessions ?? 0;
  const avg_session_duration =
    durationSessions > 0 ? (row.duration_weighted ?? 0) / durationSessions : null;

  return {
    days: row.days,
    fromDate: row.from_date,
    toDate: row.to_date,
    sessions: row.sessions ?? 0,
    users: row.users ?? 0,
    pageviews: row.pageviews ?? 0,
    avg_session_duration,
  };
}

function latestTopQueriesFromRows(
  rows: Array<{ g: MetricsGscDailyRow; top: GscTopQuery[] }>,
): { date: string; top: GscTopQuery[] } | null {
  for (const row of rows) {
    if (row.top.length > 0) return { date: row.g.date, top: row.top };
  }
  return null;
}

function gscDayHasPosition(impressions: number, position: number): boolean {
  return impressions > 0 && Number.isFinite(position);
}

async function loadPositionChartSeries(
  db: D1Database,
  sites: Array<{ id: string; host: string; connected: number }>,
  windowDays: number,
): Promise<{ dates: string[]; series: PositionChartSeries[] }> {
  const connected = sites.filter((s) => s.connected === 1);
  const dates = buildChartDates(windowDays);
  if (!connected.length) return { dates, series: [] };

  const placeholders = connected.map(() => "?").join(",");
  const rows = await db
    .prepare(
      `SELECT metrics_site_id, date, position, impressions
       FROM metrics_gsc_daily
       WHERE metrics_site_id IN (${placeholders})
         AND date >= date('now', ?)
       ORDER BY date ASC`,
    )
    .bind(...connected.map((s) => s.id), `-${windowDays - 1} days`)
    .all<{
      metrics_site_id: string;
      date: string;
      position: number;
      impressions: number;
    }>();

  const bySite = new Map<string, Map<string, number>>();
  for (const site of connected) bySite.set(site.id, new Map());

  for (const r of rows.results || []) {
    if (!gscDayHasPosition(r.impressions, r.position)) continue;
    const m = bySite.get(r.metrics_site_id);
    if (m) m.set(r.date, r.position);
  }

  const series: PositionChartSeries[] = connected.map((site, i) => ({
    id: site.id,
    label: site.host,
    color: POSITION_CHART_COLORS[i % POSITION_CHART_COLORS.length]!,
    byDate: bySite.get(site.id) ?? new Map(),
  }));

  return { dates, series };
}

async function loadGscClicksBySite(
  db: D1Database,
  sites: Array<{ id: string; connected: number }>,
  windowDays: number,
): Promise<Map<string, Map<string, number>>> {
  const connected = sites.filter((s) => s.connected === 1);
  const out = new Map<string, Map<string, number>>();
  for (const s of connected) out.set(s.id, new Map());
  if (!connected.length) return out;

  const placeholders = connected.map(() => "?").join(",");
  const rows = await db
    .prepare(
      `SELECT metrics_site_id, date, clicks
       FROM metrics_gsc_daily
       WHERE metrics_site_id IN (${placeholders})
         AND date >= date('now', ?)
       ORDER BY date ASC`,
    )
    .bind(...connected.map((s) => s.id), `-${windowDays - 1} days`)
    .all<{ metrics_site_id: string; date: string; clicks: number }>();

  for (const r of rows.results || []) {
    const m = out.get(r.metrics_site_id);
    if (m) m.set(r.date, r.clicks ?? 0);
  }
  return out;
}

function singleSitePositionSeries(
  site: { id: string; host: string },
  gscRows: MetricsGscDailyRow[],
  windowDays: number,
): { dates: string[]; series: PositionChartSeries[] } {
  const dates = buildChartDates(windowDays);
  const byDate = new Map<string, number>();
  for (const r of gscRows) {
    if (gscDayHasPosition(r.impressions, r.position)) byDate.set(r.date, r.position);
  }
  return {
    dates,
    series: [
      {
        id: site.id,
        label: site.host,
        color: POSITION_CHART_COLORS[0]!,
        byDate,
      },
    ],
  };
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
  const lookback = Number(c.req.query("lookback_days") || String(DEFAULT_LOOKBACK_DAYS));
  const lookbackDays =
    Number.isFinite(lookback) && lookback > 0 && lookback <= DEFAULT_LOOKBACK_DAYS
      ? lookback
      : DEFAULT_LOOKBACK_DAYS;
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

  const dash = "—";
  const chartDates = buildChartDates(OVERVIEW_WINDOW_DAYS);
  const clicksBySite = await loadGscClicksBySite(db, sites.results || [], OVERVIEW_WINDOW_DAYS);

  const tableRows = await Promise.all(
    (sites.results || []).map(async (site, siteIndex) => {
      const connected = site.connected === 1;
      const siteCell = `<a href="/metrics/${escapeHtml(site.id)}"><strong>${escapeHtml(site.host)}</strong></a>${
        site.display_name && connected
          ? `<div class="muted" style="font-size:12px">${escapeHtml(site.display_name)}</div>`
          : ""
      }${!connected ? `<div class="muted" style="font-size:12px">未接入</div>` : ""}${
        site.last_sync_error && connected
          ? `<div class="status fail" style="font-size:11px;margin-top:4px">${escapeHtml(site.last_sync_error)}</div>`
          : ""
      }`;

      if (!connected) {
        const cols = [dash, dash, dash, dash, dash, dash, dash, dash];
        return `<tr>
          <td>${siteCell}</td>
          ${cols.map((c) => `<td class="muted">${c}</td>`).join("")}
        </tr>`;
      }

      const gsc = await gscWindowRollup(db, site.id);
      const ga4 = await ga4WindowRollup(db, site.id);
      const sparkColor = POSITION_CHART_COLORS[siteIndex % POSITION_CHART_COLORS.length]!;
      const sparkline = renderClicksSparklineSvg({
        dates: chartDates,
        byDate: clicksBySite.get(site.id) ?? new Map(),
        color: sparkColor,
        ariaLabel: `${site.host} 近 ${OVERVIEW_WINDOW_DAYS} 天 GSC 点击`,
      });

      return `<tr>
        <td>${siteCell}</td>
        <td>${gsc?.position != null ? num(gsc.position) : dash}</td>
        <td>${gsc ? num(gsc.impressions) : dash}</td>
        <td>${gsc ? num(gsc.clicks) : dash}</td>
        <td>${ga4 ? num(ga4.sessions) : dash}</td>
        <td>${ga4 ? num(ga4.users) : dash}</td>
        <td>${ga4 ? num(ga4.pageviews) : dash}</td>
        <td>${ga4?.avg_session_duration != null ? fmtDuration(ga4.avg_session_duration) : dash}</td>
        <td class="sparkline-cell">${sparkline}</td>
      </tr>`;
    }),
  );

  const body = `
    <div class="card">
      <h2>数据看板</h2>
      <p class="muted" style="font-size:13px;margin-bottom:8px">下表为近 ${OVERVIEW_WINDOW_DAYS} 天合计（GSC 排名按展示加权；GA4 均时长按会话加权）。</p>
      ${
        oauthReady
          ? ""
          : `<p class="status fail" style="font-size:13px">未配置 GOOGLE_* secrets，同步将跳过。见 README。</p>`
      }
      <div style="overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th>站点</th>
              <th>排名</th>
              <th>曝光</th>
              <th>点击</th>
              <th>会话</th>
              <th>用户</th>
              <th>浏览量</th>
              <th>均时长</th>
              <th>点击趋势</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows.join("") || `<tr><td colspan="9" class="empty">暂无站点</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
    <div class="card">
      ${renderPositionChartHtml({
        title: "近 28 天平均排名曲线",
        subtitle: "GSC 日均 position；无展示日断线不连。",
        ...(await loadPositionChartSeries(db, sites.results || [], OVERVIEW_WINDOW_DAYS)),
      })}
    </div>`;

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

  const chartData = singleSitePositionSeries(
    site,
    gscRows.results || [],
    30,
  );
  const positionChart = renderPositionChartHtml({
    title: `${site.host} · 平均排名曲线`,
    subtitle: "近 30 天 GSC 日均 position（无展示日断线）。",
    ...chartData,
  });

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
      ${positionChart}
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
