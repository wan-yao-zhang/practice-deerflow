import { keywordRoutes } from "./ui/keywords";
import { extractPrimaryKeyword } from "./lib/primary-keyword";
import { Hono } from "hono";
import { extractKeywords } from "./lib/keywords";
import { detectSitemapUrl } from "./lib/sitemap";
import { fetchRobots } from "./lib/robots";
import { daysAgoUtc, shanghaiTodayBoundsUtc, toShanghai } from "./lib/time";
import { ALL_TAGS, TAG_LABELS, type DiscoveryRow, type SiteRow, type TagKey } from "./lib/types";
import { refreshNew7dCounts, runAllScans, scanSite, verifyAdminToken } from "./scan/runner";
import { escapeHtml, layout } from "./ui/layout";

type AppEnv = { Bindings: Env };

const app = new Hono<AppEnv>();
app.route("/keywords", keywordRoutes);

function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s) && !/^[a-z0-9.-]+$/i.test(s)) return null;
  return s;
}

function statusLabel(s: string): string {
  switch (s) {
    case "ok":
      return "正常";
    case "fail":
      return "失败";
    case "no-sitemap":
      return "无Sitemap";
    case "pending":
      return "待扫描";
    default:
      return s;
  }
}

function parseTags(form: FormData): TagKey[] {
  const out: TagKey[] = [];
  for (const t of ALL_TAGS) {
    if (form.get(`tag_${t}`) === "on" || form.getAll("tags").includes(t)) out.push(t);
  }
  return out;
}

async function getSiteTags(db: D1Database, siteId: number): Promise<string[]> {
  const rows = await db
    .prepare(`SELECT tag FROM site_tags WHERE site_id = ?`)
    .bind(siteId)
    .all<{ tag: string }>();
  return (rows.results || []).map((r) => r.tag);
}

async function setSiteTags(db: D1Database, siteId: number, tags: TagKey[]): Promise<void> {
  await db.prepare(`DELETE FROM site_tags WHERE site_id = ?`).bind(siteId).run();
  if (!tags.length) return;
  await db.batch(
    tags.map((t) =>
      db.prepare(`INSERT INTO site_tags (site_id, tag) VALUES (?, ?)`).bind(siteId, t),
    ),
  );
}

function tagChips(tags: string[]): string {
  if (!tags.length) return `<span class="muted">—</span>`;
  return tags
    .map((t) => `<span class="chip">${escapeHtml(TAG_LABELS[t as TagKey] || t)}</span>`)
    .join("");
}

function flashFromQuery(c: { req: { query: (k: string) => string | undefined } }): string | null {
  return c.req.query("flash") || null;
}

/* -------------------- Home: discoveries feed -------------------- */
app.get("/", async (c) => {
  const db = c.env.DB;
  const range = c.req.query("range") || "7d";
  const siteId = c.req.query("site") || "";
  const type = c.req.query("type") || "";
  const q = (c.req.query("q") || "").trim();

  let since = daysAgoUtc(7);
  if (range === "today") {
    since = shanghaiTodayBoundsUtc().start;
  } else if (range === "all") {
    since = "1970-01-01 00:00:00";
  }

  const params: unknown[] = [since];
  let sql = `
    SELECT d.*, s.domain
    FROM discoveries d
    JOIN sites s ON s.id = d.site_id
    WHERE d.first_seen_at >= ?
  `;
  if (siteId) {
    sql += ` AND d.site_id = ?`;
    params.push(Number(siteId));
  }
  if (type) {
    sql += ` AND EXISTS (SELECT 1 FROM site_tags st WHERE st.site_id = d.site_id AND st.tag = ?)`;
    params.push(type);
  }
  if (q) {
    sql += ` AND (
      d.primary_keyword LIKE ? OR d.title LIKE ? OR d.meta_description LIKE ? OR d.h1 LIKE ? OR d.url LIKE ?
      OR EXISTS (SELECT 1 FROM keywords k WHERE k.discovery_id = d.id AND k.keyword LIKE ?)
    )`;
    const like = `%${q}%`;
    params.push(like, like, like, like, like, like);
  }
  sql += ` ORDER BY d.first_seen_at DESC LIMIT 100`;

  const discoveries = await db
    .prepare(sql)
    .bind(...params)
    .all<DiscoveryRow>();

  const sites = await db
    .prepare(`SELECT id, domain FROM sites ORDER BY domain ASC`)
    .all<{ id: number; domain: string }>();

  const ids = (discoveries.results || []).map((d) => d.id);
  const kwMap = new Map<number, string[]>();
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const kws = await db
      .prepare(
        `SELECT discovery_id, keyword FROM keywords WHERE discovery_id IN (${placeholders}) ORDER BY weight DESC`,
      )
      .bind(...ids)
      .all<{ discovery_id: number; keyword: string }>();
    for (const k of kws.results || []) {
      const arr = kwMap.get(k.discovery_id) || [];
      if (arr.length < 8) arr.push(k.keyword);
      kwMap.set(k.discovery_id, arr);
    }
  }

  const rowsHtml = (discoveries.results || [])
    .map((d) => {
      const kws = (kwMap.get(d.id) || [])
        .map((k) => `<span class="chip">${escapeHtml(k)}</span>`)
        .join("");
      return `<tr>
        <td>
          <a href="/pages/${d.id}"><strong>${escapeHtml(d.title || d.url)}</strong></a>
          <div class="url"><a href="${escapeHtml(d.url)}" target="_blank" rel="noopener">${escapeHtml(d.url)}</a></div>
          <div style="margin-top:6px">${kws || '<span class="muted">无关键词</span>'}</div>
        </td>
        <td>${escapeHtml(d.primary_keyword || extractPrimaryKeyword(d.url, d.title, d.h1) || "—")}</td>
        <td><a href="/sites/${d.site_id}">${escapeHtml(d.domain || "")}</a></td>
        <td>${escapeHtml(toShanghai(d.first_seen_at))}</td>
        <td><span class="status ${escapeHtml(d.fetch_status)}">${escapeHtml(d.fetch_status)}</span></td>
      </tr>`;
    })
    .join("");

  const body = `
    <div class="card">
      <h2>新页面动态</h2>
      <form class="filters" method="get" action="/">
        <label>时间
          <select name="range">
            <option value="today"${range === "today" ? " selected" : ""}>今天（上海）</option>
            <option value="7d"${range === "7d" ? " selected" : ""}>近 7 天</option>
            <option value="all"${range === "all" ? " selected" : ""}>全部</option>
          </select>
        </label>
        <label>站点
          <select name="site">
            <option value="">全部站点</option>
            ${(sites.results || [])
              .map(
                (s) =>
                  `<option value="${s.id}"${String(s.id) === siteId ? " selected" : ""}>${escapeHtml(s.domain)}</option>`,
              )
              .join("")}
          </select>
        </label>
        <label>类型
          <select name="type">
            <option value="">全部类型</option>
            ${ALL_TAGS.map(
              (t) =>
                `<option value="${t}"${type === t ? " selected" : ""}>${TAG_LABELS[t]}</option>`,
            ).join("")}
          </select>
        </label>
        <label>关键词
          <input type="text" name="q" value="${escapeHtml(q)}" placeholder="搜索标题 / 关键词" />
        </label>
        <button type="submit">筛选</button>
      </form>
    </div>
    <div class="card">
      ${(discoveries.results || []).length === 0
        ? `<div class="empty">暂无新页面。首次扫描仅建立基线，不会产生“新页面”；请添加站点并在第二次扫描后查看。</div>`
        : `<table>
            <thead><tr><th>页面</th><th>主关键词</th><th>站点</th><th>首次发现</th><th>抓取</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>`}
    </div>`;

  return c.html(
    layout({ title: "新页面", active: "home", body, flash: flashFromQuery(c) }),
  );
});

/* -------------------- Sites library -------------------- */
app.get("/sites", async (c) => {
  const db = c.env.DB;
  const sites = await db
    .prepare(`SELECT * FROM sites ORDER BY created_at DESC`)
    .all<SiteRow>();

  const tagRows = await db.prepare(`SELECT site_id, tag FROM site_tags`).all<{
    site_id: number;
    tag: string;
  }>();
  const tagsBySite = new Map<number, string[]>();
  for (const r of tagRows.results || []) {
    const arr = tagsBySite.get(r.site_id) || [];
    arr.push(r.tag);
    tagsBySite.set(r.site_id, arr);
  }

  const table =
    (sites.results || []).length === 0
      ? `<div class="empty">还没有站点，请在下方添加。</div>`
      : `<table>
        <thead>
          <tr>
            <th>域名</th><th>类型</th><th>状态</th><th>URL数</th><th>近7天新增</th><th>上次扫描</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${(sites.results || [])
            .map((s) => {
              const tags = tagsBySite.get(s.id) || [];
              return `<tr>
                <td>
                  <a href="/sites/${s.id}"><strong>${escapeHtml(s.domain)}</strong></a>
                  ${s.enabled ? "" : ' <span class="chip">已停用</span>'}
                  <div class="url muted">${escapeHtml(s.sitemap_url || "自动检测")}</div>
                </td>
                <td>${tagChips(tags)}</td>
                <td><span class="status ${escapeHtml(s.status)}">${escapeHtml(statusLabel(s.status))}</span></td>
                <td>${s.url_count}</td>
                <td>${s.new_7d_count}</td>
                <td>${escapeHtml(toShanghai(s.last_scan_at))}</td>
                <td class="actions">
                  <form method="post" action="/sites/${s.id}/toggle" style="display:inline">
                    <button class="secondary" type="submit">${s.enabled ? "停用" : "启用"}</button>
                  </form>
                  <form method="post" action="/sites/${s.id}/delete" style="display:inline" onsubmit="return confirm('确认删除该站点及其数据？')">
                    <button class="danger" type="submit">删除</button>
                  </form>
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>`;

  const body = `
    <div class="card">
      <h2>添加站点</h2>
      <form class="stack" method="post" action="/sites">
        <label>域名（必填）
          <input type="text" name="domain" required placeholder="example.com" />
        </label>
        <label>Sitemap URL（可选，留空则自动检测）
          <input type="url" name="sitemap_url" placeholder="https://example.com/sitemap.xml" />
        </label>
        <div>
          <div class="muted" style="font-size:12px;margin-bottom:6px">类型标签（可多选）</div>
          <div class="checks">
            ${ALL_TAGS.map(
              (t) =>
                `<label><input type="checkbox" name="tag_${t}" /> ${TAG_LABELS[t]}</label>`,
            ).join("")}
          </div>
        </div>
        <div class="actions">
          <button type="submit">添加并检测 Sitemap</button>
        </div>
      </form>
    </div>
    <div class="card">
      <h2>站点库 <span class="muted">(${(sites.results || []).length})</span></h2>
      ${table}
    </div>`;

  return c.html(
    layout({ title: "站点库", active: "sites", body, flash: flashFromQuery(c) }),
  );
});

app.post("/sites", async (c) => {
  const db = c.env.DB;
  const form = await c.req.formData();
  const domain = normalizeDomain(String(form.get("domain") || ""));
  if (!domain) return c.redirect("/sites?flash=" + encodeURIComponent("域名无效"));

  let sitemapUrl = String(form.get("sitemap_url") || "").trim() || null;
  const tags = parseTags(form);
  const userAgent = c.env.USER_AGENT;

  try {
    const robots = await fetchRobots(`https://${domain}`, userAgent);
    const detected = await detectSitemapUrl(domain, sitemapUrl, userAgent, robots.sitemaps);
    sitemapUrl = detected;
  } catch {
    /* keep manual */
  }

  try {
    const inserted = await db
      .prepare(
        `INSERT INTO sites (domain, sitemap_url, status) VALUES (?, ?, ?)
         RETURNING id`,
      )
      .bind(domain, sitemapUrl, sitemapUrl ? "pending" : "no-sitemap")
      .first<{ id: number }>();
    if (inserted?.id) await setSiteTags(db, inserted.id, tags);
    const msg = sitemapUrl
      ? `已添加 ${domain}，检测到 ${sitemapUrl}`
      : `已添加 ${domain}，但未检测到 sitemap（可稍后编辑或手动填写）`;
    return c.redirect("/sites?flash=" + encodeURIComponent(msg));
  } catch (e) {
    const msg = e instanceof Error && e.message.includes("UNIQUE")
      ? "该域名已存在"
      : e instanceof Error
        ? e.message
        : String(e);
    return c.redirect("/sites?flash=" + encodeURIComponent(msg));
  }
});

app.get("/sites/:id", async (c) => {
  const db = c.env.DB;
  const id = Number(c.req.param("id"));
  const site = await db.prepare(`SELECT * FROM sites WHERE id = ?`).bind(id).first<SiteRow>();
  if (!site) return c.notFound();
  const tags = await getSiteTags(db, id);

  const discoveries = await db
    .prepare(
      `SELECT * FROM discoveries WHERE site_id = ? ORDER BY first_seen_at DESC LIMIT 50`,
    )
    .bind(id)
    .all<DiscoveryRow>();

  const daily = await db
    .prepare(
      `SELECT substr(first_seen_at, 1, 10) as day, COUNT(*) as cnt
       FROM discoveries
       WHERE site_id = ? AND first_seen_at >= ?
       GROUP BY day ORDER BY day ASC`,
    )
    .bind(id, daysAgoUtc(7))
    .all<{ day: string; cnt: number }>();

  const runs = await db
    .prepare(
      `SELECT * FROM scan_runs WHERE site_id = ? ORDER BY started_at DESC LIMIT 10`,
    )
    .bind(id)
    .all();

  const body = `
    <div class="card">
      <h2>${escapeHtml(site.domain)}</h2>
      <div class="meta-row">
        <span>状态：<span class="status ${escapeHtml(site.status)}">${escapeHtml(statusLabel(site.status))}</span></span>
        <span>启用：${site.enabled ? "是" : "否"}</span>
        <span>基线：${site.baseline_done ? "已完成" : "未完成（下次扫描建基线）"}</span>
        <span>URL 数：${site.url_count}</span>
        <span>近 7 天新增：${site.new_7d_count}</span>
        <span>上次扫描：${escapeHtml(toShanghai(site.last_scan_at))}</span>
      </div>
      <p class="url">Sitemap：${escapeHtml(site.sitemap_url || "（未设置）")}</p>
      <p>类型：${tagChips(tags)}</p>
      ${site.last_error ? `<p class="status fail">错误：${escapeHtml(site.last_error)}</p>` : ""}
      <div class="actions" style="margin-top:12px">
        <form method="post" action="/sites/${id}/scan"><button type="submit">立即扫描此站</button></form>
        <form method="post" action="/sites/${id}/toggle"><button class="secondary" type="submit">${site.enabled ? "停用" : "启用"}</button></form>
        <a class="btn secondary" href="/sites">返回列表</a>
      </div>
    </div>

    <div class="card">
      <h2>近 7 天每日新增</h2>
      ${(daily.results || []).length === 0
        ? `<div class="empty">暂无数据</div>`
        : `<table><thead><tr><th>日期 (UTC)</th><th>新增</th></tr></thead><tbody>
            ${(daily.results || [])
              .map((d) => `<tr><td>${escapeHtml(d.day)}</td><td>${d.cnt}</td></tr>`)
              .join("")}
          </tbody></table>`}
    </div>

    <div class="card">
      <h2>最近发现</h2>
      ${(discoveries.results || []).length === 0
        ? `<div class="empty">暂无新页面（基线扫描不会产生发现）</div>`
        : `<table><thead><tr><th>页面</th><th>发现时间</th><th>抓取</th></tr></thead><tbody>
            ${(discoveries.results || [])
              .map(
                (d) => `<tr>
                  <td><a href="/pages/${d.id}">${escapeHtml(d.title || d.url)}</a>
                    <div class="url">${escapeHtml(d.url)}</div></td>
                  <td>${escapeHtml(toShanghai(d.first_seen_at))}</td>
                  <td>${escapeHtml(d.fetch_status)}</td>
                </tr>`,
              )
              .join("")}
          </tbody></table>`}
    </div>

    <div class="card">
      <h2>最近扫描</h2>
      <table><thead><tr><th>开始</th><th>状态</th><th>找到</th><th>新增</th><th>触发</th><th>错误</th></tr></thead>
      <tbody>
        ${((runs.results || []) as Array<Record<string, unknown>>)
          .map(
            (r) => `<tr>
              <td>${escapeHtml(toShanghai(String(r.started_at)))}</td>
              <td>${escapeHtml(String(r.status))}</td>
              <td>${r.urls_found}</td>
              <td>${r.urls_new}</td>
              <td>${escapeHtml(String(r.trigger_type))}</td>
              <td class="muted">${escapeHtml(r.error_message ? String(r.error_message) : "—")}</td>
            </tr>`,
          )
          .join("") || `<tr><td colspan="6" class="empty">暂无记录</td></tr>`}
      </tbody></table>
    </div>`;

  return c.html(
    layout({
      title: site.domain,
      active: "sites",
      body,
      flash: flashFromQuery(c),
    }),
  );
});

app.post("/sites/:id/toggle", async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare(
    `UPDATE sites SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END, updated_at = datetime('now') WHERE id = ?`,
  )
    .bind(id)
    .run();
  const back = c.req.header("referer")?.includes(`/sites/${id}`)
    ? `/sites/${id}?flash=${encodeURIComponent("已更新启用状态")}`
    : `/sites?flash=${encodeURIComponent("已更新启用状态")}`;
  return c.redirect(back);
});

app.post("/sites/:id/delete", async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare(`DELETE FROM sites WHERE id = ?`).bind(id).run();
  return c.redirect("/sites?flash=" + encodeURIComponent("站点已删除"));
});

app.post("/sites/:id/scan", async (c) => {
  const id = Number(c.req.param("id"));
  const site = await c.env.DB.prepare(`SELECT * FROM sites WHERE id = ?`).bind(id).first<SiteRow>();
  if (!site) return c.notFound();
  // Run in waitUntil-friendly way: await for UI feedback on single site
  const result = await scanSite(c.env, site, "site");
  await refreshNew7dCounts(c.env.DB);
  const msg = result.error
    ? `扫描结束（有错误）：${result.error}`
    : `扫描完成：找到 ${result.urlsFound} URLs，新增 ${result.urlsNew}`;
  return c.redirect(`/sites/${id}?flash=${encodeURIComponent(msg)}`);
});

/* -------------------- Page detail -------------------- */
app.get("/pages/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB
    .prepare(
      `SELECT d.*, s.domain FROM discoveries d JOIN sites s ON s.id = d.site_id WHERE d.id = ?`,
    )
    .bind(id)
    .first<DiscoveryRow>();
  if (!row) return c.notFound();

  const kws = await c.env.DB
    .prepare(`SELECT keyword, weight FROM keywords WHERE discovery_id = ? ORDER BY weight DESC`)
    .bind(id)
    .all<{ keyword: string; weight: number }>();

  let keywords = kws.results || [];
  if (!keywords.length && (row.title || row.h1 || row.meta_description)) {
    keywords = extractKeywords(row.title, row.meta_description, row.h1);
  }

  const body = `
    <div class="card">
      <h2>${escapeHtml(row.title || "（无标题）")}</h2>
      <div class="meta-row">
        <span>站点：<a href="/sites/${row.site_id}">${escapeHtml(row.domain || "")}</a></span>
        <span>首次发现：${escapeHtml(toShanghai(row.first_seen_at))}</span>
        <span>抓取：${escapeHtml(row.fetch_status)}</span>
      </div>
      <p class="url"><a href="${escapeHtml(row.url)}" target="_blank" rel="noopener">${escapeHtml(row.url)}</a></p>
      ${row.source_sitemap ? `<p class="muted url">来源 Sitemap：${escapeHtml(row.source_sitemap)}</p>` : ""}
      ${row.fetch_error ? `<p class="status fail">${escapeHtml(row.fetch_error)}</p>` : ""}
      <dl class="tdh">
        <dt>主关键词</dt><dd>${escapeHtml(row.primary_keyword || extractPrimaryKeyword(row.url, row.title, row.h1) || "未确认")}</dd>
        <dt>Title</dt><dd>${escapeHtml(row.title || "—")}</dd>
        <dt>Meta Description</dt><dd>${escapeHtml(row.meta_description || "—")}</dd>
        <dt>H1</dt><dd>${escapeHtml(row.h1 || "—")}</dd>
      </dl>
      <div style="margin-top:14px">
        <div class="muted" style="font-size:12px;margin-bottom:6px">关键词</div>
        ${
          keywords.length
            ? keywords.map((k) => `<span class="chip">${escapeHtml(k.keyword)}</span>`).join("")
            : `<span class="muted">无</span>`
        }
      </div>
      <div class="actions" style="margin-top:16px">
        <a class="btn" href="${escapeHtml(row.url)}" target="_blank" rel="noopener">打开原页</a>
        <a class="btn secondary" href="/">返回动态</a>
      </div>
    </div>`;

  return c.html(layout({ title: row.title || "页面详情", active: "home", body }));
});

/* -------------------- Scan runs -------------------- */
app.get("/runs", async (c) => {
  const runs = await c.env.DB
    .prepare(
      `SELECT r.*, s.domain FROM scan_runs r
       LEFT JOIN sites s ON s.id = r.site_id
       ORDER BY r.started_at DESC LIMIT 80`,
    )
    .all();

  const body = `
    <div class="card">
      <h2>扫描日志</h2>
      <p class="muted">定时任务：每天 UTC 02:00（上海时间 10:00）。手动全量扫描需管理员令牌。</p>
      <table>
        <thead><tr><th>开始</th><th>结束</th><th>范围</th><th>状态</th><th>找到</th><th>新增</th><th>触发</th><th>错误</th></tr></thead>
        <tbody>
          ${((runs.results || []) as Array<Record<string, unknown>>)
            .map(
              (r) => `<tr>
                <td>${escapeHtml(toShanghai(String(r.started_at)))}</td>
                <td>${escapeHtml(toShanghai(r.finished_at ? String(r.finished_at) : null))}</td>
                <td>${r.site_id ? escapeHtml(String(r.domain || r.site_id)) : "全部站点"}</td>
                <td>${escapeHtml(String(r.status))}</td>
                <td>${r.urls_found}</td>
                <td>${r.urls_new}</td>
                <td>${escapeHtml(String(r.trigger_type))}</td>
                <td class="muted">${escapeHtml(r.error_message ? String(r.error_message) : "—")}</td>
              </tr>`,
            )
            .join("") || `<tr><td colspan="8" class="empty">暂无日志</td></tr>`}
        </tbody>
      </table>
    </div>`;

  return c.html(
    layout({ title: "扫描日志", active: "runs", body, flash: flashFromQuery(c) }),
  );
});

/* -------------------- Manual scan API -------------------- */
app.post("/api/scan", async (c) => {
  const token =
    c.req.header("x-admin-token") ||
    c.req.query("token") ||
    (await c.req.parseBody().catch(() => ({} as Record<string, unknown>)))["token"];
  const ok = await verifyAdminToken(
    typeof token === "string" ? token : null,
    c.env.ADMIN_TOKEN,
  );
  if (!ok) return c.json({ error: "unauthorized" }, 401);

  const siteId = c.req.query("site_id");
  if (siteId) {
    const site = await c.env.DB
      .prepare(`SELECT * FROM sites WHERE id = ?`)
      .bind(Number(siteId))
      .first<SiteRow>();
    if (!site) return c.json({ error: "site not found" }, 404);
    const result = await scanSite(c.env, site, "manual");
    await refreshNew7dCounts(c.env.DB);
    return c.json({ ok: !result.error, ...result });
  }

  // Full scan may exceed wall time for many sites — kick via waitUntil
  const executionCtx = c.executionCtx;
  const promise = runAllScans(c.env, "manual");
  if (executionCtx?.waitUntil) {
    executionCtx.waitUntil(promise);
    return c.json({ ok: true, started: true, mode: "background" });
  }
  const summary = await promise;
  return c.json({ ok: true, ...summary });
});

app.get("/api/scan", async (c) => {
  // Convenience GET with ?token=
  const token = c.req.query("token");
  const ok = await verifyAdminToken(token, c.env.ADMIN_TOKEN);
  if (!ok) return c.json({ error: "unauthorized" }, 401);
  // Reuse POST logic by redirecting internally
  const siteId = c.req.query("site_id");
  if (siteId) {
    const site = await c.env.DB
      .prepare(`SELECT * FROM sites WHERE id = ?`)
      .bind(Number(siteId))
      .first<SiteRow>();
    if (!site) return c.json({ error: "site not found" }, 404);
    const result = await scanSite(c.env, site, "manual");
    await refreshNew7dCounts(c.env.DB);
    return c.json({ ok: !result.error, ...result });
  }
  const summary = await runAllScans(c.env, "manual");
  return c.json({ ok: true, ...summary });
});

app.get("/api/health", async (c) => {
  const count = await c.env.DB.prepare(`SELECT COUNT(*) as n FROM sites`).first<{ n: number }>();
  return c.json({
    ok: true,
    app: c.env.APP_NAME,
    sites: count?.n ?? 0,
    cron: "0 2 * * * UTC (= 10:00 Asia/Shanghai)",
  });
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log(
      JSON.stringify({ message: "cron_fired", cron: event.cron, scheduledTime: event.scheduledTime }),
    );
    ctx.waitUntil(runAllScans(env, "cron"));
  },
} satisfies ExportedHandler<Env>;

