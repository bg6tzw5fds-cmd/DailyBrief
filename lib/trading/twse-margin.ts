/**
 * 台股（上市）信用交易：融資融券餘額，資料來源為臺灣證券交易所公開資料。
 * 證交所約在交易日晚間公布當日資料，所以晨報（07:00）抓到的是前一個交易日。
 *
 * 不需要 API key。抓不到時回傳 null，晨報其餘部分照常產生。
 */
import { WATCHLIST } from "./watchlist";

export interface MarginStock {
  code: string;
  name: string;
  marginToday: number; // 融資餘額（張）
  marginChange: number; // 融資增減（張）
  shortToday: number; // 融券餘額（張）
  shortChange: number; // 融券增減（張）
}

export interface MarginSnapshot {
  date: string; // YYYY-MM-DD（資料日期）
  marginAmount: number; // 融資金額餘額（仟元）
  marginAmountChange: number; // 融資金額增減（仟元）
  marginUnits: number; // 融資餘額（張）
  marginUnitsChange: number;
  shortUnits: number; // 融券餘額（張）
  shortUnitsChange: number;
  shortToMarginRatio: number; // 券資比（%）
  stocks: MarginStock[]; // 觀察清單中的台股個股
}

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  Referer: "https://www.twse.com.tw/zh/trading/margin/mi-margn.html",
};

type Row = unknown[];
type Table = { title?: string; fields?: string[]; data?: Row[] };

export function num(v: unknown): number {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function taipeiDate(offsetDays: number): Date {
  const now = new Date(Date.now() + 8 * 3600_000); // shift to UTC+8 wall clock
  now.setUTCDate(now.getUTCDate() - offsetDays);
  return now;
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Normalize both the current (`tables`) and legacy (`creditList`/`data`) JSON shapes. */
export function extractTables(j: Record<string, unknown>): Table[] {
  if (Array.isArray(j.tables)) return j.tables as Table[];
  const out: Table[] = [];
  if (Array.isArray(j.creditList)) out.push({ title: "信用交易統計", data: j.creditList as Row[] });
  if (Array.isArray(j.data)) out.push({ title: "個股", data: j.data as Row[] });
  return out;
}

/** Pure parser — exported for tests. */
export function parseMargin(
  j: Record<string, unknown>,
  dateKey: string,
  watchCodes: Map<string, string>,
): MarginSnapshot | null {
  if (j.stat && String(j.stat).toUpperCase() !== "OK") return null;
  const tables = extractTables(j);
  const summary = tables.find((t) =>
    (t.data ?? []).some((r) => String(r[0] ?? "").includes("融資金額")),
  );
  if (!summary?.data) return null;
  const row = (label: string) =>
    summary.data!.find((r) => String(r[0] ?? "").includes(label));
  const amt = row("融資金額");
  const mu = summary.data.find((r) => /融資/.test(String(r[0])) && /交易單位|張/.test(String(r[0])));
  const su = summary.data.find((r) => /融券/.test(String(r[0])) && /交易單位|張/.test(String(r[0])));
  if (!amt) return null;
  // columns: 項目, 買進, 賣出, 現金(券)償還, 前日餘額, 今日餘額
  const prevToday = (r: Row | undefined) => [num(r?.[4]), num(r?.[5])];
  const [amtPrev, amtToday] = prevToday(amt);
  const [muPrev, muToday] = prevToday(mu);
  const [suPrev, suToday] = prevToday(su);
  if (amtToday === 0) return null;

  const stocks: MarginStock[] = [];
  for (const t of tables) {
    for (const r of t.data ?? []) {
      const code = String(r[0] ?? "").trim();
      if (!watchCodes.has(code) || r.length < 13) continue;
      stocks.push({
        code,
        name: watchCodes.get(code) ?? String(r[1] ?? "").trim(),
        marginToday: num(r[6]),
        marginChange: num(r[6]) - num(r[5]),
        shortToday: num(r[12]),
        shortChange: num(r[12]) - num(r[11]),
      });
    }
  }
  const order = [...watchCodes.keys()];
  stocks.sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));

  return {
    date: `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`,
    marginAmount: amtToday,
    marginAmountChange: amtToday - amtPrev,
    marginUnits: muToday,
    marginUnitsChange: muToday - muPrev,
    shortUnits: suToday,
    shortUnitsChange: suToday - suPrev,
    shortToMarginRatio: muToday > 0 ? (suToday / muToday) * 100 : 0,
    stocks,
  };
}

export async function fetchTwseMargin(): Promise<MarginSnapshot | null> {
  const watchCodes = new Map<string, string>(
    WATCHLIST.filter((t) => t.symbol.endsWith(".TW")).map((t) => [
      t.symbol.replace(".TW", ""),
      t.displayName,
    ]),
  );
  for (let back = 0; back <= 10; back++) {
    const key = ymd(taipeiDate(back));
    const day = taipeiDate(back).getUTCDay();
    if (day === 0 || day === 6) continue; // 週末沒有交易
    const url = `https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=${key}&selectType=ALL&response=json`;
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
      if (!res.ok) {
        console.warn(`[margin] ${key} HTTP ${res.status}`);
      } else {
        const j = (await res.json()) as Record<string, unknown>;
        const snap = parseMargin(j, key, watchCodes);
        if (snap) return snap;
      }
    } catch (e) {
      console.warn(`[margin] ${key} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    await new Promise((r) => setTimeout(r, 2000)); // 證交所有頻率限制
  }
  return null;
}

/** One-paragraph text for the LLM digest prompt. */
export function marginToPromptText(m: MarginSnapshot): string {
  const yi = (k: number) => (k / 100000).toFixed(1); // 仟元 → 億元
  const sign = (n: number) => (n >= 0 ? "+" : "") + n.toLocaleString("en-US");
  const lines = [
    `台股上市信用交易（${m.date}）：融資餘額 ${yi(m.marginAmount)} 億元（${m.marginAmountChange >= 0 ? "+" : ""}${yi(m.marginAmountChange)} 億元），融資 ${m.marginUnits.toLocaleString("en-US")} 張（${sign(m.marginUnitsChange)}），融券 ${m.shortUnits.toLocaleString("en-US")} 張（${sign(m.shortUnitsChange)}），券資比 ${m.shortToMarginRatio.toFixed(2)}%`,
  ];
  for (const s of m.stocks) {
    lines.push(
      `- ${s.name}(${s.code})：融資 ${s.marginToday.toLocaleString("en-US")} 張（${sign(s.marginChange)}），融券 ${s.shortToday.toLocaleString("en-US")} 張（${sign(s.shortChange)}）`,
    );
  }
  return lines.join("\n");
}
