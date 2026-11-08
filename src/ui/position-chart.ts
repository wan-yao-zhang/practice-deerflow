/** Inline SVG line chart for GSC daily average position (Worker SSR, no deps). */

export const POSITION_CHART_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#a78bfa",
  "#06b6d4",
  "#f472b6",
  "#e879f9",
  "#94a3b8",
];

function escapeSvgText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

/** Last N calendar days ending yesterday (UTC), ascending. */
export function buildChartDates(windowDays: number): string[] {
  const out: string[] = [];
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export interface PositionChartSeries {
  id: string;
  label: string;
  color: string;
  /** date (YYYY-MM-DD) → average position */
  byDate: Map<string, number>;
}

export function renderPositionChartHtml(opts: {
  title: string;
  subtitle?: string;
  dates: string[];
  series: PositionChartSeries[];
}): string {
  const { title, subtitle, dates, series } = opts;
  const validSeries = series.filter((s) => s.byDate.size > 0);
  if (!dates.length || !validSeries.length) {
    return `<div class="position-chart empty muted" style="padding:20px;text-align:center">暂无排名日快照，同步 GSC 后可查看曲线。</div>`;
  }

  const W = 920;
  const H = 280;
  const padL = 48;
  const padR = 16;
  const padT = 28;
  const padB = 44;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  let yMin = Infinity;
  let yMax = -Infinity;
  for (const s of validSeries) {
    for (const pos of s.byDate.values()) {
      if (!Number.isFinite(pos)) continue;
      yMin = Math.min(yMin, pos);
      yMax = Math.max(yMax, pos);
    }
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    return `<div class="position-chart empty muted" style="padding:20px;text-align:center">暂无有效排名数据。</div>`;
  }
  if (yMin === yMax) {
    yMin = Math.max(1, yMin - 2);
    yMax = yMax + 2;
  } else {
    const pad = (yMax - yMin) * 0.08;
    yMin = Math.max(1, yMin - pad);
    yMax = yMax + pad;
  }

  const xAt = (i: number) =>
    dates.length <= 1 ? padL + plotW / 2 : padL + (i / (dates.length - 1)) * plotW;
  /** Smaller position (better) → lower Y (top of chart). */
  const yAt = (position: number) => padT + ((position - yMin) / (yMax - yMin)) * plotH;

  const yTicks = 4;
  const yTickEls: string[] = [];
  for (let t = 0; t <= yTicks; t++) {
    const pos = yMin + (t / yTicks) * (yMax - yMin);
    const y = yAt(pos);
    yTickEls.push(
      `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + plotW}" y2="${y.toFixed(1)}" stroke="#2f3d52" stroke-width="1" />`,
    );
    yTickEls.push(
      `<text x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#93a4bd" font-size="11">${pos.toFixed(1)}</text>`,
    );
  }

  const xLabelIdx = new Set<number>();
  const step = Math.max(1, Math.ceil(dates.length / 6));
  for (let i = 0; i < dates.length; i += step) xLabelIdx.add(i);
  xLabelIdx.add(dates.length - 1);

  const xLabels = [...xLabelIdx]
    .sort((a, b) => a - b)
    .map(
      (i) =>
        `<text x="${xAt(i).toFixed(1)}" y="${H - 12}" text-anchor="middle" fill="#93a4bd" font-size="10">${escapeSvgText(dates[i]!.slice(5))}</text>`,
    )
    .join("");

  const paths = validSeries
    .map((s) => {
      let d = "";
      let drawing = false;
      for (let i = 0; i < dates.length; i++) {
        const date = dates[i]!;
        const pos = s.byDate.get(date);
        if (pos === undefined || !Number.isFinite(pos)) {
          drawing = false;
          continue;
        }
        const x = xAt(i);
        const y = yAt(pos);
        if (!drawing) {
          d += `M ${x.toFixed(2)} ${y.toFixed(2)}`;
          drawing = true;
        } else {
          d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
        }
      }
      if (!d) return "";
      return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`;
    })
    .filter(Boolean)
    .join("\n");

  const legend = validSeries
    .map(
      (s) =>
        `<span class="position-legend-item"><svg width="20" height="10" aria-hidden="true"><line x1="0" y1="5" x2="20" y2="5" stroke="${s.color}" stroke-width="2" /></svg>${escapeSvgText(s.label)}</span>`,
    )
    .join("");

  return `<div class="position-chart">
  <h3 style="margin:0 0 6px;font-size:15px">${escapeSvgText(title)}</h3>
  ${subtitle ? `<p class="muted" style="font-size:12px;margin:0 0 10px">${escapeSvgText(subtitle)}</p>` : ""}
  <svg viewBox="0 0 ${W} ${H}" width="100%" height="auto" role="img" aria-label="${escapeSvgText(title)}">
    <rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="#0f1419" rx="4" />
    ${yTickEls.join("\n")}
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="#64748b" stroke-width="1" />
    <line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="#64748b" stroke-width="1" />
    <text x="${padL + plotW / 2}" y="${padT - 10}" text-anchor="middle" fill="#93a4bd" font-size="10">平均排名 · 靠上更佳（1 在上，数值越小越好）</text>
    ${paths}
    ${xLabels}
  </svg>
  <div class="position-legend">${legend}</div>
</div>`;
}

/** Compact daily GSC clicks sparkline for table cells. */
export function renderClicksSparklineSvg(opts: {
  dates: string[];
  byDate: Map<string, number>;
  color?: string;
  ariaLabel?: string;
}): string {
  const W = 128;
  const H = 30;
  const padX = 3;
  const padY = 3;
  const color = opts.color ?? "#3b82f6";
  const plotW = W - padX * 2;
  const plotH = H - padY * 2;
  const n = opts.dates.length;
  if (!n) return `<span class="muted">—</span>`;

  const values = opts.dates.map((d) => opts.byDate.get(d) ?? 0);
  if (!values.some((v) => v > 0)) return `<span class="muted">—</span>`;

  const max = Math.max(...values, 1);
  let d = "";
  const dots: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = padX + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const v = values[i]!;
    const y = padY + plotH - (v / max) * plotH;
    if (i === 0) d += `M ${x.toFixed(2)} ${y.toFixed(2)}`;
    else d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
    dots.push(
      `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.4" fill="${color}"><title>${escapeSvgText(opts.dates[i]!)}: ${v} 点击</title></circle>`,
    );
  }

  const label = escapeSvgText(opts.ariaLabel ?? "日度点击趋势");
  return `<svg class="clicks-sparkline" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${label}"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />${dots.join("")}</svg>`;
}
