function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase()
    .replace(/[-_\u2010-\u2015\s]+/gu, " ").trim();
}

/** Confirm the final URL slug only when Title or H1 contains the whole phrase. */
export function extractPrimaryKeyword(
  url: string, title: string | null, h1: string | null,
): string | null {
  let slug: string;
  try {
    const segment = new URL(url).pathname.split("/").filter(Boolean).pop();
    if (!segment) return null;
    slug = decodeURIComponent(segment).replace(/\.(?:html?|aspx?|php)$/i, "");
  } catch {
    return null;
  }
  const keyword = normalize(slug);
  if (!keyword || !/\p{L}/u.test(keyword)) return null;
  if (/^(?:index|home|default|blog|tools|en|zh|zh cn)$/u.test(keyword)) return null;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const phrase = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u");
  return [title, h1].some(text => text && phrase.test(normalize(text))) ? keyword : null;
}
