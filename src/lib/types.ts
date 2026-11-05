export type SiteStatus = "pending" | "ok" | "fail" | "no-sitemap";
export type TagKey = "blog" | "ecommerce" | "saas" | "news" | "tools" | "other";

export const TAG_LABELS: Record<TagKey, string> = {
  blog: "博客",
  ecommerce: "电商",
  saas: "SaaS",
  news: "新闻",
  tools: "工具",
  other: "其他",
};

export const ALL_TAGS: TagKey[] = [
  "blog",
  "ecommerce",
  "saas",
  "news",
  "tools",
  "other",
];

export interface SiteRow {
  id: number;
  domain: string;
  sitemap_url: string | null;
  enabled: number;
  status: SiteStatus;
  last_scan_at: string | null;
  last_error: string | null;
  url_count: number;
  new_7d_count: number;
  baseline_done: number;
  created_at: string;
  updated_at: string;
}

export interface DiscoveryRow {
  id: number;
  site_id: number;
  url: string;
  source_sitemap: string | null;
  title: string | null;
  meta_description: string | null;
  h1: string | null;
  primary_keyword: string | null;
  fetch_status: string;
  fetch_error: string | null;
  first_seen_at: string;
  domain?: string;
}

export interface ScanRunRow {
  id: number;
  site_id: number | null;
  started_at: string;
  finished_at: string | null;
  status: string;
  urls_found: number;
  urls_new: number;
  error_message: string | null;
  trigger_type: string;
}

