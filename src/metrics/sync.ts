import { getGoogleAccessToken, googleMetricsConfigured } from "../lib/google-auth";
import { fetchGa4DayTotals } from "../lib/google-ga4";
import { fetchGscDayTotals, fetchGscTopQueries } from "../lib/google-gsc";
import type { MetricsSiteRow } from "../lib/metrics-types";

export const DEFAULT_LOOKBACK_DAYS = 28;

function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dateRange(lookbackDays: number): string[] {
  const out: string[] = [];
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  for (let i = 0; i < lookbackDays; i++) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(utcDateString(d));
  }
  return out;
}

async function loadMetricsSites(db: D1Database): Promise<MetricsSiteRow[]> {
  const rows = await db
    .prepare(`SELECT * FROM metrics_sites ORDER BY host ASC`)
    .all<MetricsSiteRow>();
  return rows.results || [];
}

async function syncSiteForDate(
  env: Env,
  accessToken: string,
  site: MetricsSiteRow,
  date: string,
): Promise<void> {
  const db = env.DB;

  if (site.gsc_site_url) {
    const totals = await fetchGscDayTotals(accessToken, site.gsc_site_url, date);
    const topQueries = await fetchGscTopQueries(accessToken, site.gsc_site_url, date);
    await db
      .prepare(
        `INSERT INTO metrics_gsc_daily (metrics_site_id, date, clicks, impressions, ctr, position, top_queries_json, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(metrics_site_id, date) DO UPDATE SET
           clicks = excluded.clicks,
           impressions = excluded.impressions,
           ctr = excluded.ctr,
           position = excluded.position,
           top_queries_json = excluded.top_queries_json,
           synced_at = excluded.synced_at`,
      )
      .bind(
        site.id,
        date,
        totals.clicks,
        totals.impressions,
        totals.ctr,
        totals.position,
        JSON.stringify(topQueries),
      )
      .run();
  }

  if (site.ga4_property) {
    const ga = await fetchGa4DayTotals(accessToken, site.ga4_property, date);
    await db
      .prepare(
        `INSERT INTO metrics_ga4_daily (metrics_site_id, date, sessions, users, pageviews, bounce_rate, avg_session_duration, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(metrics_site_id, date) DO UPDATE SET
           sessions = excluded.sessions,
           users = excluded.users,
           pageviews = excluded.pageviews,
           bounce_rate = excluded.bounce_rate,
           avg_session_duration = excluded.avg_session_duration,
           synced_at = excluded.synced_at`,
      )
      .bind(
        site.id,
        date,
        ga.sessions,
        ga.users,
        ga.pageviews,
        ga.bounce_rate,
        ga.avg_session_duration,
      )
      .run();
  }
}

export interface MetricsSyncResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  sites: Array<{ id: string; host: string; ok: boolean; error?: string; days?: number }>;
  lookbackDays: number;
}

export async function syncAllMetrics(
  env: Env,
  opts?: { lookbackDays?: number; siteId?: string },
): Promise<MetricsSyncResult> {
  const lookbackDays = opts?.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const dates = dateRange(lookbackDays);

  if (!googleMetricsConfigured(env)) {
    return {
      ok: false,
      skipped: true,
      reason: "Google OAuth secrets not configured",
      sites: [],
      lookbackDays,
    };
  }

  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken(env);
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : String(e),
      sites: [],
      lookbackDays,
    };
  }

  let sites = await loadMetricsSites(env.DB);
  if (opts?.siteId) {
    sites = sites.filter((s) => s.id === opts.siteId);
  }

  const siteResults: MetricsSyncResult["sites"] = [];

  for (const site of sites) {
    if (!site.connected) {
      siteResults.push({ id: site.id, host: site.host, ok: true, days: 0 });
      continue;
    }

    let siteOk = true;
    let siteError: string | undefined;
    try {
      for (const date of dates) {
        await syncSiteForDate(env, accessToken, site, date);
      }
      await env.DB.prepare(
        `UPDATE metrics_sites SET last_sync_at = datetime('now'), last_sync_error = NULL, updated_at = datetime('now') WHERE id = ?`,
      )
        .bind(site.id)
        .run();
    } catch (e) {
      siteOk = false;
      siteError = e instanceof Error ? e.message : String(e);
      await env.DB.prepare(
        `UPDATE metrics_sites SET last_sync_error = ?, updated_at = datetime('now') WHERE id = ?`,
      )
        .bind(siteError, site.id)
        .run();
    }
    siteResults.push({
      id: site.id,
      host: site.host,
      ok: siteOk,
      error: siteError,
      days: dates.length,
    });
  }

  return {
    ok: siteResults.every((s) => s.ok),
    sites: siteResults,
    lookbackDays,
  };
}
