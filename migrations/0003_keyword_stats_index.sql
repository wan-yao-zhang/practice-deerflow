CREATE INDEX idx_discoveries_primary_keyword_site_time
ON discoveries(primary_keyword, site_id, first_seen_at);
