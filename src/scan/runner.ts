import { extractTdh } from "../lib/html";
import { extractKeywords } from "../lib/keywords";
import { fetchRobots, isAllowed } from "../lib/robots";
import { collectSitemapUrls, detectSitemapUrl } from "../lib/sitemap";
import { daysAgoUtc } from "../lib/time";
import type { SiteRow } from "../lib/types";

const FETCH_NEW_CAP = 40; // TDH fetches per site per scan
const BATCH_INSERT = 50;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  if (aa.byteLength !== bb.byteLength) {
    // still hash both to reduce timing leak on length
    await crypto.subtle.digest("SHA-256", aa);
    await crypto.subtle.digest("SHA-256", bb);
    return false;
  }
  const ha = new Uint8Array(await crypto.subtle.digest("SHA-256", aa));
  const hb = new Uint8Array(await crypto.subtle.digest("SHA-256", bb));
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i]! ^ hb[i]!;
  return diff === 0;
}

export async function verifyAdminToken(
  provided: string | null | undefined,
  expected: string | undefined,
): Promise<boolean> {
  if (!provided || !expected) return false;
  return timingSafeEqual(provided, expected);
}

export async function refreshNew7dCounts(db: D1Database): Promise<void> {
  const since = daysAgoUtc(7);
  await db
    .prepare(
      `UPDATE sites SET new_7d_count = (
         SELECT COUNT(*) FROM discoveries d
         WHERE d.site_id = sites.id AND d.first_seen_at >= ?
       ), updated_at = datetime('now')`,
    )
    .bind(since)
    .run();
}

async function insertUrlBatch(
  db: D1Database,
  siteId: number,
  rows: Array<{ url: string; source: string }>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_INSERT) {
    const chunk = rows.slice(i, i + BATCH_INSERT);
    const stmts = chunk.map((r) =>
      db
        .prepare(
          `INSERT INTO sitemap_urls (site_id, url, source_sitemap, first_seen_at, last_seen_at)
           VALUES (?, ?, ?, datetime('now'), datetime('now'))
           ON CONFLICT(site_id, url) DO UPDATE SET
             last_seen_at = datetime('now'),
             source_sitemap = excluded.source_sitemap`,
        )
        .bind(siteId, r.url, r.source),
    );
    await db.batch(stmts);
  }
}

async function fetchAndStoreTdh(
  db: D1Database,
  discoveryId: number,
  url: string,
  userAgent: string,
  robots: Awaited<ReturnType<typeof fetchRobots>>,
): Promise<void> {
  if (!isAllowed(robots, url)) {
    await db
      .prepare(
        `UPDATE discoveries SET fetch_status = 'skipped', fetch_error = 'blocked by robots.txt' WHERE id = ?`,
      )
      .bind(discoveryId)
      .run();
    return;
  }
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      await db
        .prepare(
          `UPDATE discoveries SET fetch_status = 'fail', fetch_error = ? WHERE id = ?`,
        )
        .bind(`HTTP ${res.status}`, discoveryId)
        .run();
      return;
    }
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("html") && !ct.includes("text/")) {
      await db
        .prepare(
          `UPDATE discoveries SET fetch_status = 'skipped', fetch_error = ? WHERE id = ?`,
        )
        .bind(`non-html content-type: ${ct.slice(0, 80)}`, discoveryId)
        .run();
      return;
    }
    // Cap HTML read
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    const limit = 512 * 1024;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.byteLength;
        if (total >= limit) {
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          break;
        }
      }
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }
    const html = new TextDecoder("utf-8", { fatal: false }).decode(merged);
    const tdh = extractTdh(html);
    await db
      .prepare(
        `UPDATE discoveries SET title = ?, meta_description = ?, h1 = ?, fetch_status = 'ok', fetch_error = NULL WHERE id = ?`,
      )
      .bind(tdh.title, tdh.meta_description, tdh.h1, discoveryId)
      .run();

    const kws = extractKeywords(tdh.title, tdh.meta_description, tdh.h1);
    if (kws.length) {
      await db.batch(
        kws.map((k) =>
          db
            .prepare(
              `INSERT INTO keywords (discovery_id, keyword, weight) VALUES (?, ?, ?)
               ON CONFLICT(discovery_id, keyword) DO UPDATE SET weight = excluded.weight`,
            )
            .bind(discoveryId, k.keyword, k.weight),
        ),
      );
    }
  } catch (e) {
    await db
      .prepare(
        `UPDATE discoveries SET fetch_status = 'fail', fetch_error = ? WHERE id = ?`,
      )
      .bind(e instanceof Error ? e.message.slice(0, 500) : String(e), discoveryId)
      .run();
  }
}

export async function scanSite(
  env: Env,
  site: SiteRow,
  triggerType: "cron" | "manual" | "site",
): Promise<{ urlsFound: number; urlsNew: number; error?: string }> {
  const db = env.DB;
  const userAgent = env.USER_AGENT || "GithubboxSitemapMonitor/1.0 (+https://githubbox.info)";
  const run = await db
    .prepare(
      `INSERT INTO scan_runs (site_id, status, trigger_type) VALUES (?, 'running', ?) RETURNING id`,
    )
    .bind(site.id, triggerType)
    .first<{ id: number }>();
  const runId = run?.id;

  try {
    const origin = `https://${site.domain}`;
    const robots = await fetchRobots(origin, userAgent);
    const sitemapUrl =
      site.sitemap_url ||
      (await detectSitemapUrl(site.domain, null, userAgent, robots.sitemaps));

    if (!sitemapUrl) {
      await db
        .prepare(
          `UPDATE sites SET status = 'no-sitemap', last_error = '未找到 sitemap', last_scan_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(site.id)
        .run();
      if (runId) {
        await db
          .prepare(
            `UPDATE scan_runs SET finished_at = datetime('now'), status = 'fail', error_message = 'no sitemap' WHERE id = ?`,
          )
          .bind(runId)
          .run();
      }
      return { urlsFound: 0, urlsNew: 0, error: "no sitemap" };
    }

    if (!site.sitemap_url) {
      await db
        .prepare(`UPDATE sites SET sitemap_url = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(sitemapUrl, site.id)
        .run();
    }

    const collected = await collectSitemapUrls(sitemapUrl, userAgent);
    if (collected.error && collected.urls.length === 0) {
      await db
        .prepare(
          `UPDATE sites SET status = 'fail', last_error = ?, last_scan_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(collected.error.slice(0, 500), site.id)
        .run();
      if (runId) {
        await db
          .prepare(
            `UPDATE scan_runs SET finished_at = datetime('now'), status = 'fail', error_message = ? WHERE id = ?`,
          )
          .bind(collected.error.slice(0, 500), runId)
          .run();
      }
      return { urlsFound: 0, urlsNew: 0, error: collected.error };
    }

    // Filter by robots for page inventory? Keep inventory complete; only TDH respects robots.
    await insertUrlBatch(db, site.id, collected.urls);

    const urlsFound = collected.urls.length;
    let urlsNew = 0;
    const isBaseline = !site.baseline_done;

    if (isBaseline) {
      await db
        .prepare(
          `UPDATE sites SET baseline_done = 1, status = 'ok', last_error = NULL, last_scan_at = datetime('now'), url_count = ?, updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(urlsFound, site.id)
        .run();
    } else {
      // URLs whose first_seen_at is at/after this scan started (not the whole baseline set)
      const runStarted = runId
        ? (
            await db
              .prepare(`SELECT started_at FROM scan_runs WHERE id = ?`)
              .bind(runId)
              .first<{ started_at: string }>()
          )?.started_at
        : null;
      const since = runStarted || new Date(Date.now() - 60_000).toISOString().replace("T", " ").slice(0, 19);
      const recent = await db
        .prepare(
          `SELECT id, url, source_sitemap FROM sitemap_urls
           WHERE site_id = ? AND first_seen_at >= ?
           ORDER BY id ASC LIMIT 200`,
        )
        .bind(site.id, since)
        .all<{ id: number; url: string; source_sitemap: string | null }>();

      const newRows = recent.results || [];
      urlsNew = newRows.length;

      for (const row of newRows) {
        await db
          .prepare(
            `INSERT INTO discoveries (site_id, url, source_sitemap, fetch_status)
             VALUES (?, ?, ?, 'pending')
             ON CONFLICT(site_id, url) DO NOTHING`,
          )
          .bind(site.id, row.url, row.source_sitemap)
          .run();
      }

      const pending = await db
        .prepare(
          `SELECT id, url FROM discoveries
           WHERE site_id = ? AND fetch_status = 'pending'
           ORDER BY id ASC LIMIT ?`,
        )
        .bind(site.id, FETCH_NEW_CAP)
        .all<{ id: number; url: string }>();

      let i = 0;
      for (const p of pending.results || []) {
        await fetchAndStoreTdh(db, p.id, p.url, userAgent, robots);
        i++;
        if (i < (pending.results || []).length) {
          await sleep(Math.max(robots.crawlDelayMs, 300));
        }
      }

      await db
        .prepare(
          `UPDATE sites SET status = 'ok', last_error = NULL, last_scan_at = datetime('now'), url_count = ?, updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(urlsFound, site.id)
        .run();
    }

    if (runId) {
      await db
        .prepare(
          `UPDATE scan_runs SET finished_at = datetime('now'), status = 'ok', urls_found = ?, urls_new = ? WHERE id = ?`,
        )
        .bind(urlsFound, urlsNew, runId)
        .run();
    }

    console.log(
      JSON.stringify({
        message: "site_scan_done",
        site_id: site.id,
        domain: site.domain,
        urlsFound,
        urlsNew,
        baseline: isBaseline,
      }),
    );

    return { urlsFound, urlsNew };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .prepare(
        `UPDATE sites SET status = 'fail', last_error = ?, last_scan_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(msg.slice(0, 500), site.id)
      .run();
    if (runId) {
      await db
        .prepare(
          `UPDATE scan_runs SET finished_at = datetime('now'), status = 'fail', error_message = ? WHERE id = ?`,
        )
        .bind(msg.slice(0, 500), runId)
        .run();
    }
    console.error(JSON.stringify({ message: "site_scan_fail", site_id: site.id, error: msg }));
    return { urlsFound: 0, urlsNew: 0, error: msg };
  }
}

export async function runAllScans(
  env: Env,
  triggerType: "cron" | "manual",
): Promise<{ sites: number; ok: number; fail: number }> {
  const db = env.DB;
  const globalRun = await db
    .prepare(
      `INSERT INTO scan_runs (site_id, status, trigger_type) VALUES (NULL, 'running', ?) RETURNING id`,
    )
    .bind(triggerType)
    .first<{ id: number }>();

  const sites = await db
    .prepare(`SELECT * FROM sites WHERE enabled = 1 ORDER BY id ASC LIMIT 60`)
    .all<SiteRow>();

  let ok = 0;
  let fail = 0;
  let totalFound = 0;
  let totalNew = 0;

  for (const site of sites.results || []) {
    const result = await scanSite(env, site, triggerType);
    totalFound += result.urlsFound;
    totalNew += result.urlsNew;
    if (result.error) fail++;
    else ok++;
    // polite gap between sites
    await sleep(400);
  }

  await refreshNew7dCounts(db);

  if (globalRun?.id) {
    await db
      .prepare(
        `UPDATE scan_runs SET finished_at = datetime('now'), status = ?, urls_found = ?, urls_new = ?, error_message = ? WHERE id = ?`,
      )
      .bind(
        fail && !ok ? "fail" : "ok",
        totalFound,
        totalNew,
        fail ? `${fail} site(s) failed` : null,
        globalRun.id,
      )
      .run();
  }

  console.log(
    JSON.stringify({
      message: "scan_all_done",
      triggerType,
      sites: (sites.results || []).length,
      ok,
      fail,
      totalFound,
      totalNew,
    }),
  );

  return { sites: (sites.results || []).length, ok, fail };
}
