/** Format UTC SQL datetime as Asia/Shanghai display string. */
export function toShanghai(utcSql: string | null | undefined): string {
  if (!utcSql) return "—";
  const normalized = utcSql.includes("T") ? utcSql : utcSql.replace(" ", "T") + "Z";
  const d = new Date(normalized.endsWith("Z") ? normalized : normalized + "Z");
  if (Number.isNaN(d.getTime())) return utcSql;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function shanghaiTodayBoundsUtc(): { start: string; end: string } {
  // Approximate: Asia/Shanghai is UTC+8 year-round
  const now = new Date();
  const sh = new Date(now.getTime() + 8 * 3600 * 1000);
  const y = sh.getUTCFullYear();
  const m = sh.getUTCMonth();
  const d = sh.getUTCDate();
  const startUtc = new Date(Date.UTC(y, m, d, 0, 0, 0) - 8 * 3600 * 1000);
  const endUtc = new Date(Date.UTC(y, m, d + 1, 0, 0, 0) - 8 * 3600 * 1000);
  return {
    start: startUtc.toISOString().replace("T", " ").slice(0, 19),
    end: endUtc.toISOString().replace("T", " ").slice(0, 19),
  };
}

export function daysAgoUtc(days: number): string {
  const d = new Date(Date.now() - days * 86400 * 1000);
  return d.toISOString().replace("T", " ").slice(0, 19);
}
