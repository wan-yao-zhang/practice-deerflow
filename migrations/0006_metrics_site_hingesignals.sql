-- Add hingesignals.com (GSC siteOwner; GA4 property 545979735 — not 546000661)
INSERT OR IGNORE INTO metrics_sites (id, host, display_name, gsc_site_url, ga4_property, ga4_name, connected)
VALUES (
  'hingesignals',
  'hingesignals.com',
  'hingesignals',
  'sc-domain:hingesignals.com',
  'properties/545979735',
  'hingesignals',
  1
);
