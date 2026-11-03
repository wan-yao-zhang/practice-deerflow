export interface RobotsRules {
  allow: string[];
  disallow: string[];
  sitemaps: string[];
  crawlDelayMs: number;
}

const DEFAULT: RobotsRules = {
  allow: ["/"],
  disallow: [],
  sitemaps: [],
  crawlDelayMs: 500,
};

export async function fetchRobots(
  origin: string,
  userAgent: string,
): Promise<RobotsRules> {
  try {
    const res = await fetch(new URL("/robots.txt", origin).toString(), {
      headers: { "User-Agent": userAgent, Accept: "text/plain,*/*" },
      redirect: "follow",
      cf: { cacheTtl: 3600, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) return { ...DEFAULT };
    const text = await res.text();
    return parseRobots(text, userAgent);
  } catch {
    return { ...DEFAULT };
  }
}

export function parseRobots(text: string, userAgent: string): RobotsRules {
  const lines = text.split(/\r?\n/);
  const groups: Array<{ agents: string[]; allow: string[]; disallow: string[]; delay?: number }> = [];
  let current: { agents: string[]; allow: string[]; disallow: string[]; delay?: number } | null = null;
  const sitemaps: string[] = [];

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === "user-agent") {
      if (!current || current.allow.length || current.disallow.length || current.delay != null) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (key === "allow" && current) {
      current.allow.push(value);
    } else if (key === "disallow" && current) {
      current.disallow.push(value);
    } else if (key === "crawl-delay" && current) {
      const n = Number(value);
      if (!Number.isNaN(n) && n >= 0) current.delay = Math.min(n * 1000, 5000);
    } else if (key === "sitemap") {
      sitemaps.push(value);
    }
  }

  const ua = userAgent.toLowerCase();
  const match =
    groups.find((g) => g.agents.some((a) => a !== "*" && ua.includes(a))) ||
    groups.find((g) => g.agents.includes("*"));

  if (!match) {
    return { ...DEFAULT, sitemaps };
  }
  return {
    allow: match.allow,
    disallow: match.disallow,
    sitemaps,
    crawlDelayMs: match.delay ?? DEFAULT.crawlDelayMs,
  };
}

function pathMatches(pattern: string, path: string): boolean {
  if (pattern === "") return false;
  if (pattern === "/") return true;
  // Simple prefix match; * treated as wildcard
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  try {
    return new RegExp("^" + escaped).test(path);
  } catch {
    return path.startsWith(pattern);
  }
}

export function isAllowed(rules: RobotsRules, url: string): boolean {
  let path: string;
  try {
    path = new URL(url).pathname || "/";
  } catch {
    return false;
  }
  let bestDisallow = -1;
  let bestAllow = -1;
  for (const d of rules.disallow) {
    if (pathMatches(d, path)) bestDisallow = Math.max(bestDisallow, d.length);
  }
  for (const a of rules.allow) {
    if (pathMatches(a, path)) bestAllow = Math.max(bestAllow, a.length);
  }
  if (bestDisallow < 0) return true;
  return bestAllow >= bestDisallow;
}
