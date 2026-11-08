export function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function layout(opts: {
  title: string;
  active: "home" | "sites" | "runs" | "keywords" | "metrics";
  body: string;
  flash?: string | null;
}): string {
  const nav = (id: string, href: string, label: string) =>
    `<a class="nav-link${opts.active === id ? " active" : ""}" href="${href}">${label}</a>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(opts.title)} · Githubbox Sitemap</title>
  <style>
    :root {
      --bg: #0f1419;
      --panel: #1a2332;
      --panel2: #243044;
      --border: #2f3d52;
      --text: #e7eef8;
      --muted: #93a4bd;
      --accent: #3b82f6;
      --accent2: #22c55e;
      --danger: #ef4444;
      --warn: #f59e0b;
      --chip: #334155;
      --radius: 10px;
      --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
      --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; background: var(--bg); color: var(--text);
      font-family: var(--font); line-height: 1.5; min-height: 100vh;
    }
    a { color: #93c5fd; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 20px 16px 48px; }
    header.app {
      display: flex; flex-wrap: wrap; gap: 12px; align-items: center;
      justify-content: space-between; margin-bottom: 20px;
      padding-bottom: 14px; border-bottom: 1px solid var(--border);
    }
    .brand { display: flex; gap: 10px; align-items: center; }
    .logo {
      width: 34px; height: 34px; border-radius: 8px;
      background: linear-gradient(135deg, #2563eb, #06b6d4);
      display: grid; place-items: center; font-weight: 700; color: white;
    }
    .brand h1 { font-size: 18px; margin: 0; font-weight: 650; }
    .brand p { margin: 0; color: var(--muted); font-size: 12px; }
    nav { display: flex; gap: 6px; flex-wrap: wrap; }
    .nav-link {
      padding: 7px 12px; border-radius: 999px; color: var(--muted);
      background: transparent; border: 1px solid transparent;
    }
    .nav-link:hover { background: var(--panel); text-decoration: none; color: var(--text); }
    .nav-link.active { background: var(--panel); border-color: var(--border); color: var(--text); }
    .card {
      background: var(--panel); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 16px; margin-bottom: 16px;
    }
    .card h2 { margin: 0 0 12px; font-size: 16px; }
    .grid { display: grid; gap: 12px; }
    .grid-2 { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
    .muted { color: var(--muted); }
    .flash {
      background: #14532d33; border: 1px solid #166534; color: #bbf7d0;
      padding: 10px 12px; border-radius: 8px; margin-bottom: 14px;
    }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
    th { color: var(--muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .03em; }
    tr:hover td { background: #ffffff06; }
    .chip {
      display: inline-flex; align-items: center; gap: 4px;
      background: var(--chip); color: var(--text); border-radius: 999px;
      padding: 2px 8px; font-size: 12px; margin: 1px 2px;
    }
    .status { font-weight: 600; font-size: 12px; }
    .status.ok { color: var(--accent2); }
    .status.fail, .status.no-sitemap { color: var(--danger); }
    .status.pending { color: var(--warn); }
    form.filters, form.stack { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; }
    form.stack { flex-direction: column; align-items: stretch; }
    label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
    input[type=text], input[type=url], select, textarea {
      background: var(--bg); color: var(--text); border: 1px solid var(--border);
      border-radius: 8px; padding: 8px 10px; font: inherit; min-width: 140px;
    }
    .checks { display: flex; flex-wrap: wrap; gap: 8px 14px; }
    .checks label { flex-direction: row; align-items: center; gap: 6px; color: var(--text); font-size: 13px; }
    button, .btn {
      background: var(--accent); color: white; border: 0; border-radius: 8px;
      padding: 8px 14px; font: inherit; cursor: pointer; display: inline-block;
    }
    button.secondary, .btn.secondary { background: var(--panel2); color: var(--text); border: 1px solid var(--border); }
    button.danger { background: var(--danger); }
    button:hover, .btn:hover { filter: brightness(1.08); text-decoration: none; }
    .actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .meta-row { display: flex; flex-wrap: wrap; gap: 16px; color: var(--muted); font-size: 13px; margin-bottom: 12px; }
    .url { font-family: var(--mono); font-size: 12px; word-break: break-all; }
    .empty { padding: 28px; text-align: center; color: var(--muted); }
    .metric-card h3 { margin: 0 0 8px; font-size: 15px; }
    .metric-big { font-size: 28px; font-weight: 650; margin: 4px 0; }
    .metric-strip {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px;
    }
    .metric-kpi {
      background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
      padding: 10px 12px;
    }
    .metric-kpi .label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
    .metric-kpi .value { font-size: 22px; font-weight: 700; margin-top: 4px; line-height: 1.2; }
    .metric-kpi.rank .value { color: #fcd34d; }
    .metric-kpi.clicks .value { color: #86efac; }
    .metric-kpi.impr .value { color: #93c5fd; }
    .tdh dt { color: var(--muted); font-size: 12px; margin-top: 8px; }
    .tdh dd { margin: 2px 0 0; }
    footer {
      margin-top: 28px; color: var(--muted); font-size: 12px;
      border-top: 1px solid var(--border); padding-top: 14px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="app">
      <div class="brand">
        <div class="logo">G</div>
        <div>
          <h1>Githubbox Sitemap Monitor</h1>
          <p>站点地图监控 · 新页面发现</p>
        </div>
      </div>
      <nav>
        ${nav("home", "/", "新页面")}
        ${nav("keywords", "/keywords", "关键词动态")}
        ${nav("metrics", "/metrics", "数据看板")}
        ${nav("sites", "/sites", "站点库")}
        ${nav("runs", "/runs", "扫描日志")}
      </nav>
    </header>
    ${opts.flash ? `<div class="flash">${escapeHtml(opts.flash)}</div>` : ""}
    ${opts.body}
    <footer>
      每日扫描一次（UTC 02:00 ≈ 上海时间 10:00）· User-Agent: GithubboxSitemapMonitor/1.0 ·
      不存储页面全文
    </footer>
  </div>
</body>
</html>`;
}
