-- Sites being monitored
CREATE TABLE sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL UNIQUE,
  sitemap_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|ok|fail|no-sitemap
  last_scan_at TEXT,
  last_error TEXT,
  url_count INTEGER NOT NULL DEFAULT 0,
  new_7d_count INTEGER NOT NULL DEFAULT 0,
  baseline_done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sites_enabled ON sites(enabled);
CREATE INDEX idx_sites_status ON sites(status);

-- Multi-select type tags
CREATE TABLE site_tags (
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  tag TEXT NOT NULL, -- blog|ecommerce|saas|news|tools|other
  PRIMARY KEY (site_id, tag)
);

CREATE INDEX idx_site_tags_tag ON site_tags(tag);

-- Full URL inventory from sitemaps
CREATE TABLE sitemap_urls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  source_sitemap TEXT,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(site_id, url)
);

CREATE INDEX idx_sitemap_urls_site ON sitemap_urls(site_id);
CREATE INDEX idx_sitemap_urls_last_seen ON sitemap_urls(site_id, last_seen_at);

-- Newly discovered pages (post-baseline) with TDH
CREATE TABLE discoveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  source_sitemap TEXT,
  title TEXT,
  meta_description TEXT,
  h1 TEXT,
  fetch_status TEXT NOT NULL DEFAULT 'pending', -- pending|ok|fail|skipped
  fetch_error TEXT,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(site_id, url)
);

CREATE INDEX idx_discoveries_site ON discoveries(site_id);
CREATE INDEX idx_discoveries_first_seen ON discoveries(first_seen_at DESC);
CREATE INDEX idx_discoveries_fetch_status ON discoveries(fetch_status);

-- Keywords extracted from TDH
CREATE TABLE keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discovery_id INTEGER NOT NULL REFERENCES discoveries(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 1,
  UNIQUE(discovery_id, keyword)
);

CREATE INDEX idx_keywords_keyword ON keywords(keyword);
CREATE INDEX idx_keywords_discovery ON keywords(discovery_id);

-- Scan run logs
CREATE TABLE scan_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL, -- NULL = global run
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running', -- running|ok|fail
  urls_found INTEGER NOT NULL DEFAULT 0,
  urls_new INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'cron' -- cron|manual|site
);

CREATE INDEX idx_scan_runs_started ON scan_runs(started_at DESC);
CREATE INDEX idx_scan_runs_site ON scan_runs(site_id);
