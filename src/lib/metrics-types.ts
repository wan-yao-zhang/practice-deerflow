export interface MetricsSiteRow {
  id: string;
  host: string;
  display_name: string | null;
  gsc_site_url: string | null;
  ga4_property: string | null;
  ga4_name: string | null;
  connected: number;
  last_sync_at: string | null;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface MetricsGscDailyRow {
  id: number;
  metrics_site_id: string;
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  top_queries_json: string | null;
  synced_at: string;
}

export interface MetricsGa4DailyRow {
  id: number;
  metrics_site_id: string;
  date: string;
  sessions: number;
  users: number;
  pageviews: number;
  bounce_rate: number | null;
  avg_session_duration: number | null;
  synced_at: string;
}

export interface GscTopQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}
