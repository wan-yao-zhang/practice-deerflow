import { referenceLink, referenceLinks } from "../lib/reference";
import { Hono } from "hono";
import { KEYWORD_STATS_SQL } from "../lib/keyword-stats";
import { daysAgoUtc, shanghaiTodayBoundsUtc, toShanghai } from "../lib/time";
import { escapeHtml as e, layout } from "./layout";

export const keywordRoutes = new Hono<{ Bindings: Env }>();

keywordRoutes.get("/", async c => {
  const range = ["today", "7d", "all"].includes(c.req.query("range") || "") ? c.req.query("range")! : "7d";
  const mode = c.req.query("mode") === "active" ? "active" : "new";
  const sort = c.req.query("sort") === "sites" ? "sites" : "recent";
  const since = range === "all" ? "1970-01-01 00:00:00" : range === "today" ? shanghaiTodayBoundsUtc().start : daysAgoUtc(7);
  const q = (c.req.query("q") || "").trim();
  const result = await c.env.DB.prepare(KEYWORD_STATS_SQL + `
    WHERE ${mode === "new" ? "w.first_seen" : "w.last_seen"} >= ?
    AND instr(w.keyword, ?) > 0
    ORDER BY ${sort === "sites" ? "w.new_sites DESC," : ""}
    ${mode === "new" ? "w.first_seen" : "w.last_seen"} DESC, w.keyword ASC LIMIT 200
  `).bind(since, since, q.normalize("NFKC").toLowerCase()).all<{
    reference_domains: string | null; keyword: string; first_seen: string; first_sites: string; new_sites: number; total_sites: number;
  }>();
  const rows = result.results || [];
  const options = (items: string[][], selected: string) => items.map(([v, label]) => `<option value="${v}"${v === selected ? " selected" : ""}>${label}</option>`).join("");
  return c.html(layout({ title: "关键词动态", active: "keywords", body: `
    <div class="card"><h2>关键词动态</h2>
    <p class="muted">仅统计监控范围内已确认的主关键词。时间为监控首次发现时间，并非真实上线时间或全网首发。</p>
    <form class="filters" action="/keywords" method="get">
      <label>口径<select name="mode">${options([["new", "首次出现的词"], ["active", "有新增页面的词"]], mode)}</select></label>
      <label>时间<select name="range">${options([["today", "今天（上海）"], ["7d", "近7天"], ["all", "全部"]], range)}</select></label>
      <label>排序<select name="sort">${options([["recent", "最近发现"], ["sites", "新增站点最多"]], sort)}</select></label>
      <label>关键词<input name="q" value="${e(q)}" placeholder="搜索主关键词" /></label><button>筛选</button>
    </form></div>
    <div class="card"><p class="muted">最多显示200个词；新增站点按该站首次发现该词的时间计数，同站重复发页不重复计数。</p>
    ${rows.length ? `<table><thead><tr><th>关键词</th><th>参考网站</th><th>首次发现</th><th>首次发现站点</th><th>所选时间新增站点</th><th>累计站点</th></tr></thead><tbody>${rows.map(r => `<tr>
      <td><a href="/keywords/detail?keyword=${e(encodeURIComponent(r.keyword))}">${e(r.keyword)}</a></td>
      <td>${referenceLinks(r.reference_domains)}</td><td>${e(toShanghai(r.first_seen))}</td><td>${e(r.first_sites)}</td><td>${r.new_sites}</td><td>${r.total_sites}</td>
    </tr>`).join("")}</tbody></table>` : `<div class="empty">所选条件下暂无已确认关键词</div>`}</div>
  ` }));
});

keywordRoutes.get("/detail", async c => {
  const keyword = (c.req.query("keyword") || "").trim();
  if (!keyword) return c.redirect("/keywords");
  const result = await c.env.DB.prepare(`
    SELECT d.id, d.url, d.title, d.first_seen_at, s.domain, s.reference_domain,
      MIN(d.first_seen_at) OVER (PARTITION BY d.site_id) AS site_first_seen
    FROM discoveries d JOIN sites s ON s.id = d.site_id
    WHERE d.primary_keyword = ? ORDER BY site_first_seen ASC, s.domain ASC, d.first_seen_at ASC, d.id ASC LIMIT 500
  `).bind(keyword).all<{ reference_domain: string | null; id: number; url: string; title: string | null; first_seen_at: string; domain: string; site_first_seen: string }>();
  return c.html(layout({ title: keyword, active: "keywords", body: `
    <div class="card"><h2>${e(keyword)}</h2><p class="muted">按站点首次发现时间排列，最多显示500个对应页面。</p><a href="/keywords">返回关键词动态</a></div>
    <div class="card">${result.results?.length ? `<table><thead><tr><th>站点</th><th>参考网站</th><th>该站首次发现</th><th>对应页面</th><th>页面发现时间</th></tr></thead><tbody>${result.results.map(r => `<tr>
      <td>${e(r.domain)}</td><td>${referenceLink(r.reference_domain)}</td><td>${e(toShanghai(r.site_first_seen))}</td><td><a href="/pages/${r.id}">${e(r.title || r.url)}</a><div class="url">${e(r.url)}</div></td><td>${e(toShanghai(r.first_seen_at))}</td>
    </tr>`).join("")}</tbody></table>` : `<div class="empty">暂无对应页面</div>`}</div>
  ` }));
});
