-- GSC / GA4 metrics registry (separate from sitemap monitor sites table)
CREATE TABLE metrics_sites (
  id TEXT PRIMARY KEY,
  host TEXT NOT NULL UNIQUE,
  display_name TEXT,
  gsc_site_url TEXT,
  ga4_property TEXT,
  ga4_name TEXT,
  connected INTEGER NOT NULL DEFAULT 1,
  last_sync_at TEXT,
  last_sync_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_metrics_sites_connected ON metrics_sites(connected);

CREATE TABLE metrics_gsc_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metrics_site_id TEXT NOT NULL REFERENCES metrics_sites(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  top_queries_json TEXT,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(metrics_site_id, date)
);

CREATE INDEX idx_metrics_gsc_daily_site_date ON metrics_gsc_daily(metrics_site_id, date DESC);

CREATE TABLE metrics_ga4_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metrics_site_id TEXT NOT NULL REFERENCES metrics_sites(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  sessions INTEGER NOT NULL DEFAULT 0,
  users INTEGER NOT NULL DEFAULT 0,
  pageviews INTEGER NOT NULL DEFAULT 0,
  bounce_rate REAL,
  avg_session_duration REAL,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(metrics_site_id, date)
);

CREATE INDEX idx_metrics_ga4_daily_site_date ON metrics_ga4_daily(metrics_site_id, date DESC);

INSERT INTO metrics_sites (id, host, display_name, gsc_site_url, ga4_property, ga4_name, connected) VALUES
  ('askauraloom', 'askauraloom.com', 'auraloom', 'sc-domain:askauraloom.com', 'properties/551587330', 'auraloom', 1),
  ('mangapoly', 'mangapoly.com', 'manga-translator', 'sc-domain:mangapoly.com', 'properties/557268389', 'manga-translator', 1),
  ('chironpath', 'chironpath.com', 'chironpath', 'sc-domain:chironpath.com', 'properties/553867883', 'chironpath', 1),
  ('rapsona', 'rapsona.online', NULL, NULL, NULL, NULL, 0);
