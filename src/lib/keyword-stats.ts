// Aggregate each site's first discovery before counting new sites.
export const KEYWORD_STATS_SQL = `
WITH site_words AS (
 SELECT primary_keyword AS keyword, site_id, MIN(first_seen_at) AS site_first_seen,
        MAX(first_seen_at) AS site_last_seen
 FROM discoveries WHERE primary_keyword IS NOT NULL AND primary_keyword != ''
 GROUP BY primary_keyword, site_id
), words AS (
 SELECT keyword, MIN(site_first_seen) AS first_seen,
        MAX(site_last_seen) AS last_seen, COUNT(*) AS total_sites,
        SUM(CASE WHEN site_first_seen >= ? THEN 1 ELSE 0 END) AS new_sites
 FROM site_words GROUP BY keyword
)
SELECT w.*, (
 SELECT group_concat(s.domain, ', ') FROM site_words sw
 JOIN sites s ON s.id = sw.site_id
 WHERE sw.keyword = w.keyword AND sw.site_first_seen = w.first_seen
 ) AS first_sites, (
 SELECT group_concat(DISTINCT s.reference_domain) FROM site_words sw
 JOIN sites s ON s.id = sw.site_id WHERE sw.keyword = w.keyword
) AS reference_domains FROM words w
`;
