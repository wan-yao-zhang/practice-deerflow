import { escapeHtml } from "../ui/layout";

export function normalizeReference(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) return null;
    const domain = url.hostname.toLowerCase();
    return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain) ? domain : null;
  } catch { return null; }
}

export function referenceLink(domain: string | null | undefined): string {
  const valid = domain && normalizeReference(domain);
  return valid ? `<a href="https://${escapeHtml(valid)}/" target="_blank" rel="noopener">${escapeHtml(valid)}</a>` : '<span class="muted">—</span>';
}

export function referenceLinks(domains: string | null): string {
  return domains ? [...new Set(domains.split(","))].map(referenceLink).join("<br>") : referenceLink(null);
}
