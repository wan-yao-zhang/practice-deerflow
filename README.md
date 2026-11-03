# Githubbox Sitemap Monitor

Public sitemap monitoring tool. Live at **https://githubbox.info**.

## Features (v1)

- Add sites (domain + optional sitemap URL); auto-detect `/sitemap.xml`, `/sitemap_index.xml`, `/sitemap-index.xml`, and `robots.txt` Sitemap lines
- Daily cron scan + manual admin trigger
- Baseline first scan (no “new” flood); later scans create discoveries
- Fetch Title / meta description / H1 for new URLs; rule-based CJK-friendly keywords
- Chinese UI: feed, sites library, site detail, page detail, scan logs
- Disable/enable/delete sites; multi-select type tags

## Stack

- Cloudflare Worker `githubbox` + Hono SSR HTML (dark theme)
- D1 database `githubbox-sitemap` (`c82225d3-1b97-4c75-8afc-88d6ee71773e`)
- Cron: `0 2 * * *` UTC ≈ **10:00 Asia/Shanghai**
- Custom domain: `githubbox.info`
- Secret: `ADMIN_TOKEN` (Workers secret)

## Local / deploy

```bash
export CLOUDFLARE_ACCOUNT_ID=2841f91d4691f01dde7f0d98efa8f87f
npm install
npx wrangler types
npm run db:migrate:remote   # needs D1 edit token
printf '%s' "$ADMIN_TOKEN" | npx wrangler secret put ADMIN_TOKEN
npm run deploy
```

Note: Account API tokens without Workers Scripts Write must deploy via the Cloudflare dashboard/API. This project’s production deploy used the Cloudflare MCP upload path.

## Manual scan

```bash
curl "https://githubbox.info/api/scan?token=YOUR_ADMIN_TOKEN"
curl "https://githubbox.info/api/scan?token=YOUR_ADMIN_TOKEN&site_id=1"
curl -X POST -H "x-admin-token: YOUR_ADMIN_TOKEN" https://githubbox.info/api/scan
```

UI also has “立即扫描此站” on each site detail page (no token; public write in v1).

## Limits / risks

- Max ~5000 URLs per site; sitemap depth ≤ 3; gzip `.xml.gz` not supported in v1
- TDH fetch capped at 40 new URLs per site per scan
- Public write (anyone can add/delete sites) — no login in v1
- Worker CPU/time: very large sitemap indexes may hit limits; prefer per-site manual scans when needed
- `compatibility_date` set to `2026-10-30` (Cloudflare API rejected `2026-11-04` as “future” at deploy time)
