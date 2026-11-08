export interface Ga4DayTotals {
  sessions: number;
  users: number;
  pageviews: number;
  bounce_rate: number | null;
  avg_session_duration: number | null;
}

interface Ga4MetricValue {
  value?: string;
}

interface Ga4Row {
  dimensionValues?: { value?: string }[];
  metricValues?: Ga4MetricValue[];
}

export async function fetchGa4DayTotals(
  accessToken: string,
  property: string,
  date: string,
): Promise<Ga4DayTotals> {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dateRanges: [{ startDate: date, endDate: date }],
      dimensions: [{ name: "date" }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "screenPageViews" },
        { name: "bounceRate" },
        { name: "averageSessionDuration" },
      ],
      limit: 1,
    }),
  });

  const data = (await res.json()) as {
    rows?: Ga4Row[];
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(data.error?.message || `GA4 runReport failed (${res.status})`);
  }

  const row = data.rows?.[0];
  if (!row?.metricValues?.length) {
    return {
      sessions: 0,
      users: 0,
      pageviews: 0,
      bounce_rate: null,
      avg_session_duration: null,
    };
  }

  const num = (i: number) => {
    const v = row.metricValues?.[i]?.value;
    if (v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    sessions: num(0) ?? 0,
    users: num(1) ?? 0,
    pageviews: num(2) ?? 0,
    bounce_rate: num(3),
    avg_session_duration: num(4),
  };
}
