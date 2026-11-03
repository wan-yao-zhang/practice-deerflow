const MAX_SITEMAP_BYTES = 8 * 1024 * 1024;
const MAX_URLS_PER_SITE = 5000;
const MAX_DEPTH = 3;
const COMMON_PATHS = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap-index.xml",
  "/sitemap.xml.gz",
];

export interface SitemapParseResult {
  urls: string[];
  nestedSitemaps: string[];
  isIndex: boolean;
}

export async function detectSitemapUrl(
  domain: string,
  manualUrl: string | null | undefined,
  userAgent: string,
  robotsSitemaps: string[] = [],
): Promise<string | null> {
  if (manualUrl) {
    try {
      const u = new URL(manualUrl);
      if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
    } catch {
      /* fall through */
    }
  }

  const origin = `https://${domain}`;
  const candidates = [
    ...robotsSitemaps,
    ...COMMON_PATHS.map((p) => new URL(p, origin).toString()),
  ];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      const res = await fetch(candidate, {
        method: "GET",
        headers: {
          "User-Agent": userAgent,
          Accept: "application/xml,text/xml,*/*",
        },
        redirect: "follow",
      });
      if (!res.ok) continue;
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const buf = await res.arrayBuffer();
      if (buf.byteLength === 0 || buf.byteLength > MAX_SITEMAP_BYTES) continue;
      const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
      if (
        text.includes("<urlset") ||
        text.includes("<sitemapindex") ||
        text.includes("<url>") ||
        ct.includes("xml")
      ) {
        return candidate;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

export function parseSitemapXml(xml: string, baseUrl: string): SitemapParseResult {
  const urls: string[] = [];
  const nestedSitemaps: string[] = [];
  const isIndex = /<sitemapindex[\s>]/i.test(xml);

  const locRe = /<loc[^>]*>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  const locs: string[] = [];
  while ((m = locRe.exec(xml))) {
    locs.push(decodeXml(m[1].trim()));
  }

  for (const loc of locs) {
    let absolute: string;
    try {
      absolute = new URL(loc, baseUrl).toString();
    } catch {
      continue;
    }
    if (isIndex) nestedSitemaps.push(absolute);
    else urls.push(absolute);
  }

  // Heuristic: if not clearly an index but locs look like sitemap xml files
  if (!isIndex && urls.length === 0 && nestedSitemaps.length === 0) {
    for (const loc of locs) {
      try {
        const absolute = new URL(loc, baseUrl).toString();
        if (/\.xml(\.gz)?(\?|$)/i.test(absolute) || /sitemap/i.test(absolute)) {
          nestedSitemaps.push(absolute);
        } else {
          urls.push(absolute);
        }
      } catch {
        /* skip */
      }
    }
  }

  return {
    urls: [...new Set(urls)],
    nestedSitemaps: [...new Set(nestedSitemaps)],
    isIndex: isIndex || nestedSitemaps.length > 0,
  };
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export async function collectSitemapUrls(
  rootSitemap: string,
  userAgent: string,
  opts?: { maxUrls?: number; maxDepth?: number },
): Promise<{ urls: Array<{ url: string; source: string }>; error?: string }> {
  const maxUrls = opts?.maxUrls ?? MAX_URLS_PER_SITE;
  const maxDepth = opts?.maxDepth ?? MAX_DEPTH;
  const collected: Array<{ url: string; source: string }> = [];
  const seenSitemap = new Set<string>();
  const seenUrl = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: rootSitemap, depth: 0 }];

  while (queue.length > 0 && collected.length < maxUrls) {
    const item = queue.shift()!;
    if (seenSitemap.has(item.url) || item.depth > maxDepth) continue;
    seenSitemap.add(item.url);

    let xml: string;
    try {
      const res = await fetch(item.url, {
        headers: {
          "User-Agent": userAgent,
          Accept: "application/xml,text/xml,*/*",
        },
        redirect: "follow",
      });
      if (!res.ok) {
        if (item.depth === 0) return { urls: [], error: `sitemap HTTP ${res.status}` };
        continue;
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_SITEMAP_BYTES) {
        if (item.depth === 0) return { urls: [], error: "sitemap too large" };
        continue;
      }
      // Skip gzip binary for v1 simplicity unless content looks like xml
      const head = new Uint8Array(buf.slice(0, 2));
      if (head[0] === 0x1f && head[1] === 0x8b) {
        if (item.depth === 0) return { urls: [], error: "gzip sitemap not supported in v1" };
        continue;
      }
      xml = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    } catch (e) {
      if (item.depth === 0) {
        return { urls: [], error: e instanceof Error ? e.message : String(e) };
      }
      continue;
    }

    const parsed = parseSitemapXml(xml, item.url);
    for (const nested of parsed.nestedSitemaps) {
      if (!seenSitemap.has(nested)) queue.push({ url: nested, depth: item.depth + 1 });
    }
    for (const u of parsed.urls) {
      if (seenUrl.has(u)) continue;
      seenUrl.add(u);
      collected.push({ url: u, source: item.url });
      if (collected.length >= maxUrls) break;
    }
  }

  return { urls: collected };
}

export { MAX_URLS_PER_SITE, COMMON_PATHS };
