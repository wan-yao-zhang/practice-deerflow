import type { GscTopQuery } from "./metrics-types";

export interface GscDayTotals {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface GscApiRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

async function gscQuery(
  accessToken: string,
  siteUrl: string,
  body: Record<string, unknown>,
): Promise<GscApiRow[]> {
  const encoded = encodeURIComponent(siteUrl);
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  const data = (await res.json()) as { rows?: GscApiRow[]; error?: { message?: string } };
  if (!res.ok) {
    throw new Error(data.error?.message || `GSC query failed (${res.status})`);
  }
  return data.rows || [];
}

export async function fetchGscDayTotals(
  accessToken: string,
  siteUrl: string,
  date: string,
): Promise<GscDayTotals> {
  const rows = await gscQuery(accessToken, siteUrl, {
    startDate: date,
    endDate: date,
    dimensions: [],
    rowLimit: 1,
  });
  const r = rows[0];
  if (!r) {
    return { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  }
  return {
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  };
}

export async function fetchGscTopQueries(
  accessToken: string,
  siteUrl: string,
  date: string,
  rowLimit = 25,
): Promise<GscTopQuery[]> {
  const rows = await gscQuery(accessToken, siteUrl, {
    startDate: date,
    endDate: date,
    dimensions: ["query"],
    rowLimit,
  });
  return rows
    .filter((r) => r.keys?.[0])
    .map((r) => ({
      query: r.keys![0]!,
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: r.ctr ?? 0,
      position: r.position ?? 0,
    }));
}
