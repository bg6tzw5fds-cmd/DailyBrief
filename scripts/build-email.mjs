#!/usr/bin/env node
/**
 * 投資晨報 · 產生 Email 版內容
 *
 * 讀取 daily_reports/ 裡最新一天的 <date>.json，輸出：
 *   email/brief.html   — 信件內文（全部 inline style，Outlook / Gmail 都能正常顯示）
 *   email/subject.txt  — 信件主旨
 * 在 GitHub Actions 中另外把 subject 寫進 $GITHUB_OUTPUT。
 *
 * 環境變數：PAGES_URL（完整晨報網址，可省略）
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.argv[2] ?? "daily_reports";
const OUT_DIR = process.argv[3] ?? "email";
const PAGES_URL = (process.env.PAGES_URL ?? "").trim();

const SNAPSHOT = ["^GSPC", "^IXIC", "^SOX", "^TWII", "^STOXX", "^BSESN", "000300.SS", "399006.SZ", "2330.TW", "^TNX", "DX-Y.NYB", "TWD=X", "BZ=F", "GC=F", "^VIX"];
const UP = "#dc2626"; // 台股慣例：紅漲
const DOWN = "#16a34a"; // 綠跌

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const pct = (n) => `${n >= 0 ? "+" : ""}${Number(n).toFixed(2)}%`;
const color = (n) => (n >= 0 ? UP : DOWN);
const price = (n) => (Math.abs(n) >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : Number(n).toFixed(2));
const int = (n) => Math.round(n).toLocaleString("en-US");
const sint = (n) => (n >= 0 ? "+" : "") + int(n);

export function buildEmail(report, date, pagesUrl = "") {
  const td = 'style="padding:6px 8px;border-bottom:1px solid #eee;font-size:14px;"';
  const tdr = 'style="padding:6px 8px;border-bottom:1px solid #eee;font-size:14px;text-align:right;white-space:nowrap;"';
  const h2 = (t) => `<h2 style="font-size:16px;margin:24px 0 8px;padding-bottom:4px;border-bottom:2px solid #18181b;">${t}</h2>`;
  const parts = [];

  parts.push(`<p style="color:#71717a;font-size:12px;letter-spacing:2px;margin:0;">投資晨報 · ${esc(date)}</p>`);
  if (report.hero_headline) parts.push(`<h1 style="font-size:21px;line-height:1.4;margin:6px 0 14px;">${esc(report.hero_headline)}</h1>`);
  if (report.daily_overview) parts.push(`<p style="font-size:15px;line-height:1.75;color:#3f3f46;background:#f4f4f5;padding:12px 14px;border-left:3px solid #71717a;margin:0;">${esc(report.daily_overview)}</p>`);

  const tickers = report.trading?.tickers ?? [];
  const bySym = new Map(tickers.map((t) => [t.symbol, t]));
  const rows = SNAPSHOT.map((s) => bySym.get(s)).filter(Boolean);
  if (rows.length) {
    const BULL = new Set(["golden-cross", "macd-bull-cross", "above-sma50-sma200", "near-52w-high", "sma20-cross-up-50", "sma50-cross-up-100", "price-cross-up-200"]);
    const BEAR = new Set(["death-cross", "macd-bear-cross", "below-sma50-sma200", "near-52w-low", "sma20-cross-down-50", "sma50-cross-down-100", "price-cross-down-200"]);
    const sigColor = (type) => (BULL.has(type) ? UP : BEAR.has(type) ? DOWN : "#d97706");
    const tdS = 'style="padding:6px 5px;border-bottom:1px solid #eee;font-size:13px;text-align:right;white-space:nowrap;"';
    const thS = (t, left = false) => `<th style="padding:6px 5px;border-bottom:1px solid #eee;font-size:11px;color:#71717a;text-align:${left ? "left" : "right"};white-space:nowrap;">${t}</th>`;
    const smaCell = (t, v) =>
      v == null ? `<td ${tdS}>—</td>` : `<td ${tdS.replace('style="', `style="color:${t.currentPrice >= v ? UP : DOWN};`)}>${price(v)}</td>`;
    parts.push(h2("收盤快照"));
    parts.push(`<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
<tr>${thS("標的", true)}${thS("最新")}${thS("日漲跌")}${thS("5 日")}${thS("SMA20")}${thS("SMA50")}${thS("SMA100")}${thS("SMA200")}</tr>
${rows
  .map((t) => {
    const sig = (t.signals ?? [])
      .map((g) => `<span style="color:${sigColor(g.type)};">${esc(g.label)}${g.daysAgo != null ? `（${g.daysAgo === 0 ? "今天" : `${g.daysAgo} 天前`}）` : ""}</span>`)
      .join("、");
    return `<tr><td style="padding:6px 5px;border-bottom:1px solid #eee;font-size:13px;">${esc(t.displayName)}${sig ? `<div style="font-size:11px;line-height:1.5;margin-top:2px;">${sig}</div>` : ""}</td><td ${tdS}>${price(t.currentPrice)}</td><td ${tdS.replace('style="', `style="color:${color(t.pct1Day)};`)}>${pct(t.pct1Day)}</td><td ${tdS.replace('style="', `style="color:${color(t.pct5Day)};`)}>${pct(t.pct5Day)}</td>${smaCell(t, t.sma20)}${smaCell(t, t.sma50)}${smaCell(t, t.sma100)}${smaCell(t, t.sma200)}</tr>`;
  })
  .join("\n")}
</table>
<p style="font-size:11px;color:#a1a1aa;margin:6px 0 0;">均線數字紅色＝價格在該均線之上，綠色＝在之下。</p>`);
  }

  const m = report.margin;
  if (m) {
    const yi = (k) => (k / 100000).toFixed(2); // 仟元 → 億元
    const yiY = (y) => (y / 1e8).toFixed(2); // 元 → 億元
    const sgn = (s, n) => (n >= 0 ? "+" : "") + s;
    const hist = m.history ?? [];
    const last = hist[hist.length - 1];
    const th = (t, right = true) => `<th ${(right ? tdr : td).replace("font-size:14px;", "font-size:12px;color:#71717a;" + (right ? "" : "text-align:left;"))}>${t}</th>`;
    const tds = 'style="padding:5px 6px;border-bottom:1px solid #eee;font-size:13px;text-align:right;white-space:nowrap;"';
    const cell = (v, n) => `<td ${n == null ? tds : tds.replace('style="', `style="color:${color(n)};`)}>${v ?? "—"}</td>`;

    parts.push(h2(`台股信用交易（${esc(m.date)}）`));
    const head = [];
    if (m.marginAmount) head.push(`上市融資餘額 <b>${yi(m.marginAmount)} 億元</b>（<span style="color:${color(m.marginAmountChange)}">${sgn(yi(m.marginAmountChange), m.marginAmountChange)} 億</span>）`);
    if (last?.keepRate != null) head.push(`全市場擔保維持率 <b>${last.keepRate.toFixed(2)}%</b>`);
    if (last?.callAccounts != null) head.push(`追繳 <b>${int(last.callAccounts)} 戶</b>${last.callAmount != null ? `／${yiY(last.callAmount)} 億元` : ""}`);
    if (m.marginUnits) head.push(`券資比 ${m.shortToMarginRatio.toFixed(2)}%`);
    if (head.length) parts.push(`<p style="font-size:14px;line-height:1.8;margin:0 0 8px;">${head.join("・")}</p>`);

    if (hist.length) {
      parts.push(`<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
<tr>${th("日期", false)}${th("加權指數")}${th("漲跌%")}${th("融資(億)")}${th("增減(億)")}${th("維持率")}${th("追繳戶")}${th("追繳(億)")}</tr>
${[...hist]
  .reverse()
  .map(
    (d) =>
      `<tr><td ${td.replace("font-size:14px;", "font-size:13px;")}>${esc(d.date.slice(5).replace("-", "/"))}</td>${cell(d.indexClose != null ? price(d.indexClose) : null)}${cell(d.indexPct != null ? pct(d.indexPct) : null, d.indexPct)}${cell(d.marginAmount != null ? yi(d.marginAmount) : null)}${cell(d.marginAmountChange != null ? sgn(yi(d.marginAmountChange), d.marginAmountChange) : null, d.marginAmountChange)}${cell(d.keepRate != null ? d.keepRate.toFixed(2) + "%" : null)}${cell(d.callAccounts != null ? int(d.callAccounts) : null)}${cell(d.callAmount != null ? yiY(d.callAmount) : null)}</tr>`,
  )
  .join("\n")}
</table>`);
    }
    if (m.stocks?.length) {
      parts.push(`<p style="font-size:13px;line-height:1.8;color:#3f3f46;margin:8px 0 0;"><b>ETF 融資融券（張）</b><br>${m.stocks
        .map((s) => `${esc(s.name)} ${esc(s.code)}：融資 ${int(s.marginToday)}（<span style="color:${color(s.marginChange)}">${sint(s.marginChange)}</span>）／融券 ${int(s.shortToday)}（<span style="color:${color(s.shortChange)}">${sint(s.shortChange)}</span>）`)
        .join("<br>")}</p>`);
    }
    parts.push(`<p style="font-size:14px;margin:10px 0 0;"><a href="https://www.wantgoo.com/stock/margin-trading/exclude-etf/taiex" style="color:#2563eb;text-decoration:none;font-weight:600;">玩股網：扣除 ETF 融資餘額與融資維持率 →</a></p>`);
    parts.push(`<p style="font-size:11px;color:#a1a1aa;margin:6px 0 0;">融資餘額為上市（含 ETF）；擔保維持率、追繳為上市＋上櫃全市場。資料來源：臺灣證券交易所。</p>`);
  }

  const briefs = (title, list) => {
    if (!list?.length) return;
    parts.push(h2(title));
    for (const b of list) {
      parts.push(`<div style="margin:0 0 14px;">
<a href="${esc(b.url)}" style="font-size:15px;font-weight:600;color:#1d4ed8;text-decoration:none;">${esc(b.title)}</a>
<div style="font-size:12px;color:#71717a;margin:2px 0;">${esc(b.source)}${b.importance ? ` · 重要度 ${esc(b.importance)}` : ""}</div>
<div style="font-size:14px;line-height:1.65;color:#3f3f46;">${esc(b.summary)}</div></div>`);
    }
  };
  briefs("財經與總經重點", report.finance_briefs);
  briefs("AI 與半導體重點", report.tech_briefs);
  briefs("國際與地緣重點", report.politics_briefs);

  if (report.editor_note) {
    parts.push(h2("編輯觀點"));
    parts.push(`<p style="font-size:14px;line-height:1.7;margin:0;">${esc(report.editor_note)}</p>`);
  }
  if (pagesUrl) {
    parts.push(`<p style="margin:28px 0 8px;"><a href="${esc(pagesUrl)}" style="display:inline-block;background:#18181b;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px;">開啟完整晨報（行情、技術面、全部新聞）</a></p>`);
  }
  parts.push(`<p style="font-size:11px;color:#a1a1aa;line-height:1.6;margin-top:24px;">內容由 AI 根據公開新聞與行情資料整理，僅供參考，不構成投資建議。漲跌顏色依台股慣例：紅漲綠跌。</p>`);

  const html = `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="max-width:680px;margin:0 auto;padding:20px 16px;font-family:-apple-system,'PingFang TC','Microsoft JhengHei','Noto Sans TC',sans-serif;color:#18181b;">
${parts.join("\n")}
</div></body></html>`;
  const subject = `投資晨報 ${date}｜${report.hero_headline || "今日重點"}`.replace(/[\r\n]+/g, " ").slice(0, 120);
  return { html, subject };
}

function main() {
  if (!fs.existsSync(ROOT)) throw new Error(`${ROOT} not found`);
  const dates = fs
    .readdirSync(ROOT)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && fs.existsSync(path.join(ROOT, d, `${d}.json`)))
    .sort();
  const date = dates.at(-1);
  if (!date) throw new Error("no report json found");
  const report = JSON.parse(fs.readFileSync(path.join(ROOT, date, `${date}.json`), "utf8"));
  const { html, subject } = buildEmail(report, date, PAGES_URL);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "brief.html"), html, "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "subject.txt"), subject, "utf8");
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `subject=${subject}\n`);
  console.log(`[build-email] ${date} → ${OUT_DIR}/brief.html · ${subject}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
