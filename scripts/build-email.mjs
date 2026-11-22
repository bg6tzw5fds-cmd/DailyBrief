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

const SNAPSHOT = ["^GSPC", "^IXIC", "^SOX", "^TWII", "2330.TW", "^TNX", "DX-Y.NYB", "TWD=X", "BZ=F", "GC=F", "^VIX"];
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
    parts.push(h2("收盤快照"));
    parts.push(`<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
<tr><th ${td.replace("font-size:14px;", "font-size:12px;color:#71717a;text-align:left;")}>標的</th><th ${tdr.replace("font-size:14px;", "font-size:12px;color:#71717a;")}>最新</th><th ${tdr.replace("font-size:14px;", "font-size:12px;color:#71717a;")}>日漲跌</th><th ${tdr.replace("font-size:14px;", "font-size:12px;color:#71717a;")}>5 日</th></tr>
${rows.map((t) => `<tr><td ${td}>${esc(t.displayName)}</td><td ${tdr}>${price(t.currentPrice)}</td><td ${tdr.replace('style="', `style="color:${color(t.pct1Day)};`)}>${pct(t.pct1Day)}</td><td ${tdr.replace('style="', `style="color:${color(t.pct5Day)};`)}>${pct(t.pct5Day)}</td></tr>`).join("\n")}
</table>`);
  }

  const m = report.margin;
  if (m) {
    const yi = (k) => (k / 100000).toFixed(1);
    parts.push(h2(`台股信用交易（上市 · ${esc(m.date)}）`));
    parts.push(`<p style="font-size:14px;line-height:1.8;margin:0;">融資餘額 <b>${yi(m.marginAmount)} 億元</b>（<span style="color:${color(m.marginAmountChange)}">${m.marginAmountChange >= 0 ? "+" : ""}${yi(m.marginAmountChange)} 億</span>）・融資 ${int(m.marginUnits)} 張（<span style="color:${color(m.marginUnitsChange)}">${sint(m.marginUnitsChange)}</span>）・融券 ${int(m.shortUnits)} 張（<span style="color:${color(m.shortUnitsChange)}">${sint(m.shortUnitsChange)}</span>）・券資比 ${m.shortToMarginRatio.toFixed(2)}%</p>`);
    if (m.stocks?.length) {
      parts.push(`<p style="font-size:13px;line-height:1.8;color:#3f3f46;margin:6px 0 0;">${m.stocks
        .map((s) => `${esc(s.name)}：融資 ${int(s.marginToday)}（<span style="color:${color(s.marginChange)}">${sint(s.marginChange)}</span>）／融券 ${int(s.shortToday)}（<span style="color:${color(s.shortChange)}">${sint(s.shortChange)}</span>）`)
        .join("<br>")}</p>`);
    }
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
