function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .trim();
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

export interface Tdh {
  title: string | null;
  meta_description: string | null;
  h1: string | null;
}

export function extractTdh(html: string): Tdh {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]).slice(0, 500) || null : null;

  let meta_description: string | null = null;
  const metaRe =
    /<meta\b[^>]*\b(?:name|property)\s*=\s*["'](?:description|og:description)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(html))) {
    const tag = m[0];
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i);
    if (content?.[1]) {
      meta_description = decodeEntities(content[1]).slice(0, 1000) || null;
      break;
    }
  }
  // content before name variant
  if (!meta_description) {
    const alt = html.match(
      /<meta\b[^>]*\bcontent\s*=\s*["']([^"']*)["'][^>]*\b(?:name|property)\s*=\s*["'](?:description|og:description)["'][^>]*>/i,
    );
    if (alt?.[1]) meta_description = decodeEntities(alt[1]).slice(0, 1000) || null;
  }

  const h1Match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const h1 = h1Match ? stripTags(h1Match[1]).slice(0, 500) || null : null;

  return { title, meta_description, h1 };
}
