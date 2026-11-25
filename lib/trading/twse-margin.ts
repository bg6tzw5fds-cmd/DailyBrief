/**
 * 台股信用交易：資料來源為臺灣證券交易所公開資料（臺股儀表板同一組 API）。
 * 證交所約在交易日晚間公布當日資料，所以晨報（07:00）抓到的是前一個交易日。
 *
 *   - MI_MARGN          上市信用交易統計 + 追蹤 ETF 的融資融券
 *   - MI_MARGN_TREND    上市融資金額餘額（近 N 日）
 *   - BFIJ3U_TREND      全市場（上市＋上櫃）擔保維持率、追繳／處分戶數與金額（近 N 日）
 *   - FMTQIK            加權指數每日收盤與漲跌點數（按月）
 *   - BFI82U            三大法人買賣金額統計（每日一次請求）
 *
 * 不需要 API key。任何一支抓不到都只是少一塊，晨報其餘部分照常產生。
 */

/** 要追蹤融資融券的 ETF（代號 → 晨報顯示名稱）。想加減直接改這裡。 */
export const MARGIN_ETFS: [string, string][] = [
  ["0050", "元大台灣50"],
  ["00631L", "元大台灣50正2"],
  ["00685L", "群益臺灣加權正2"],
];

/** 晨報表格顯示幾個交易日 */
const HISTORY_DAYS = 5;

export interface MarginStock {
  code: string;
  name: string;
  marginToday: number; // 融資餘額（張）
  marginChange: number; // 融資增減（張）
  shortToday: number; // 融券餘額（張）
  shortChange: number; // 融券增減（張）
}

/** 每日一列：加權指數、上市融資金額、全市場擔保維持率與追繳。缺資料的欄位為 undefined。 */
export interface MarginDay {
  date: string; // YYYY-MM-DD
  indexClose?: number; // 加權指數收盤
  indexPct?: number; // 漲跌 %
  marginAmount?: number; // 上市融資金額餘額（仟元）
  marginAmountChange?: number; // 增減（仟元）
  keepRate?: number; // 全市場擔保維持率（%）
  callAccounts?: number; // 追繳戶數
  callAmount?: number; // 追繳金額（元）
  exeAccounts?: number; // 處分戶數
  exeAmount?: number; // 處分金額（元）
  instForeign?: number; // 外資及陸資（不含外資自營商）買賣超（元）
  instTrust?: number; // 投信買賣超（元）
  instDealer?: number; // 自營商（自行買賣）買賣超（元）
}

/** Pure parser for BFI82U — exported for tests. Returns null when the day has no data. */
export function parseInstitutional(
  j: Record<string, unknown>,
): { foreign?: number; trust?: number; dealer?: number } | null {
  const rows: Row[] = Array.isArray(j.data)
    ? (j.data as Row[])
    : Array.isArray(j.tables)
      ? ((j.tables as Table[])[0]?.data ?? [])
      : [];
  if (rows.length === 0) return null;
  const out: { foreign?: number; trust?: number; dealer?: number } = {};
  for (const r of rows) {
    const name = String(r[0] ?? "").replace(/[\s()（）]/g, "");
    const net = num(r[3]); // 單位名稱, 買進金額, 賣出金額, 買賣差額
    if (name.includes("自行買賣")) out.dealer = net;
    else if (name === "投信") out.trust = net;
    else if (name.startsWith("外資及陸資")) out.foreign = net;
  }
  return out.foreign == null && out.trust == null && out.dealer == null ? null : out;
}

/** 依交易日抓三大法人買賣超，寫回 history（就地修改）。 */
async function addInstitutional(history: MarginDay[]): Promise<void> {
  for (const d of history) {
    const key = d.date.replace(/-/g, "");
    const j = await getJson(`${BASE}/fund/BFI82U?type=day&dayDate=${key}&response=json`);
    const p = j ? parseInstitutional(j) : null;
    if (p) {
      d.instForeign = p.foreign;
      d.instTrust = p.trust;
      d.instDealer = p.dealer;
    }
    await sleep(2000);
  }
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
  stocks: MarginStock[]; // 追蹤的 ETF
  history?: MarginDay[]; // 近幾個交易日，舊 → 新
}

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  Referer: "https://www.twse.com.tw/dashboard/zh/credit/margin.html",
};
const BASE = "https://www.twse.com.tw/rwd/zh";

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

const dash = (k: string) => `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      console.warn(`[margin] HTTP ${res.status} ${url.replace(BASE, "")}`);
      return null;
    }
    const j = (await res.json()) as Record<string, unknown>;
    if (j.stat && String(j.stat).toUpperCase() !== "OK") return null;
    return j;
  } catch (e) {
    console.warn(`[margin] ${url.replace(BASE, "")} failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Normalize both the current (`tables`) and legacy (`creditList`/`data`) JSON shapes. */
export function extractTables(j: Record<string, unknown>): Table[] {
  if (Array.isArray(j.tables)) return j.tables as Table[];
  const out: Table[] = [];
  if (Array.isArray(j.creditList)) out.push({ title: "信用交易統計", data: j.creditList as Row[] });
  if (Array.isArray(j.data)) out.push({ title: "個股", data: j.data as Row[] });
  return out;
}

/** Pure parser for MI_MARGN — exported for tests. */
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
  const amt = summary.data.find((r) => String(r[0] ?? "").includes("融資金額"));
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
  const seen = new Set<string>();
  for (const t of tables) {
    for (const r of t.data ?? []) {
      const code = String(r[0] ?? "").trim();
      if (!watchCodes.has(code) || seen.has(code) || r.length < 13) continue;
      seen.add(code);
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
    date: dash(dateKey),
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

type TrendRow = Record<string, unknown>;
const trendData = (j: Record<string, unknown> | null): TrendRow[] =>
  j && Array.isArray(j.data) ? (j.data as TrendRow[]) : [];

/** 民國日期 "115/11/20" → "20261120" */
export function rocToKey(s: string): string | null {
  const m = String(s).trim().match(/^(\d{2,3})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  return `${Number(m[1]) + 1911}${m[2].padStart(2, "0")}${m[3].padStart(2, "0")}`;
}

/**
 * Pure merger — exported for tests. Combines MI_MARGN_TREND, BFIJ3U_TREND and
 * FMTQIK rows by date and returns the last `days` trading days (old → new).
 */
export function buildHistory(
  marginTrend: TrendRow[],
  creditTrend: TrendRow[],
  indexRows: Row[],
  days = HISTORY_DAYS,
): MarginDay[] {
  const byDate = new Map<string, MarginDay>();
  const get = (k: string) => {
    let d = byDate.get(k);
    if (!d) byDate.set(k, (d = { date: dash(k) }));
    return d;
  };

  const mt = [...marginTrend].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  mt.forEach((r, i) => {
    const d = get(String(r.date));
    d.marginAmount = num(r.marginAmt);
    if (i > 0) d.marginAmountChange = num(r.marginAmt) - num(mt[i - 1].marginAmt);
  });

  for (const r of creditTrend) {
    const d = get(String(r.date));
    d.keepRate = num(r.keepRate);
    // 儀表板「追繳戶數」顯示的是 belowAccNum（整戶擔保維持率低於 130% 之戶數）
    d.callAccounts = num(r.belowAccNum);
    d.callAmount = num(r.callAmt);
    d.exeAccounts = num(r.exeAccNum);
    d.exeAmount = num(r.exeAmt);
  }

  // FMTQIK: 日期, 成交股數, 成交金額, 成交筆數, 發行量加權股價指數, 漲跌點數
  for (const r of indexRows) {
    const k = rocToKey(String(r[0]));
    if (!k || !byDate.has(k)) continue; // only days we have credit data for
    const close = num(r[4]);
    const chg = num(r[5]);
    const d = get(k);
    d.indexClose = close;
    const prev = close - chg;
    if (prev > 0) d.indexPct = (chg / prev) * 100;
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-days);
}

async function fetchHistory(): Promise<MarginDay[]> {
  const n = HISTORY_DAYS + 1; // one extra so the oldest row gets a change value
  const marginTrend = trendData(await getJson(`${BASE}/marginTrading/MI_MARGN_TREND?response=json&days=${n}&date=`));
  await sleep(2000);
  const creditTrend = trendData(await getJson(`${BASE}/marginTrading/BFIJ3U_TREND?response=json&days=${n}&date=`));
  await sleep(2000);

  const keys = [...marginTrend, ...creditTrend].map((r) => String(r.date)).sort();
  if (keys.length === 0) return [];
  // FMTQIK is monthly: fetch the month(s) the date range spans.
  const months = [...new Set([keys[0].slice(0, 6), keys[keys.length - 1].slice(0, 6)])];
  const indexRows: Row[] = [];
  for (const m of months) {
    const j = await getJson(`${BASE}/afterTrading/FMTQIK?response=json&date=${m}01`);
    if (j && Array.isArray(j.data)) indexRows.push(...(j.data as Row[]));
    await sleep(2000);
  }
  return buildHistory(marginTrend, creditTrend, indexRows);
}

export async function fetchTwseMargin(): Promise<MarginSnapshot | null> {
  const watchCodes = new Map<string, string>(MARGIN_ETFS);
  let snap: MarginSnapshot | null = null;
  for (let back = 0; back <= 10 && !snap; back++) {
    const key = ymd(taipeiDate(back));
    const day = taipeiDate(back).getUTCDay();
    if (day === 0 || day === 6) continue; // 週末沒有交易
    const j = await getJson(`${BASE}/marginTrading/MI_MARGN?date=${key}&selectType=ALL&response=json`);
    if (j) snap = parseMargin(j, key, watchCodes);
    await sleep(2000); // 證交所有頻率限制
  }
  let history: MarginDay[] = [];
  try {
    history = await fetchHistory();
  } catch (e) {
    console.warn(`[margin] history failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!snap) {
    if (history.length === 0) return null;
    // MI_MARGN failed but trends worked — build a minimal snapshot from the latest day.
    const last = history[history.length - 1];
    snap = {
      date: last.date,
      marginAmount: last.marginAmount ?? 0,
      marginAmountChange: last.marginAmountChange ?? 0,
      marginUnits: 0,
      marginUnitsChange: 0,
      shortUnits: 0,
      shortUnitsChange: 0,
      shortToMarginRatio: 0,
      stocks: [],
    };
  }
  if (history.length) {
    try {
      await addInstitutional(history);
    } catch (e) {
      console.warn(`[margin] institutional failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
    }
    snap.history = history;
  }
  return snap;
}

export const yiFromThousand = (k: number) => (k / 100000).toFixed(2); // 仟元 → 億元
export const yiFromYuan = (y: number) => (y / 1e8).toFixed(2); // 元 → 億元

/** Text block for the LLM digest prompt. */
export function marginToPromptText(m: MarginSnapshot): string {
  const sign = (n: number) => (n >= 0 ? "+" : "") + n.toLocaleString("en-US");
  const lines = [
    `台股上市信用交易（${m.date}）：融資餘額 ${yiFromThousand(m.marginAmount)} 億元（${m.marginAmountChange >= 0 ? "+" : ""}${yiFromThousand(m.marginAmountChange)} 億元），融資 ${m.marginUnits.toLocaleString("en-US")} 張（${sign(m.marginUnitsChange)}），融券 ${m.shortUnits.toLocaleString("en-US")} 張（${sign(m.shortUnitsChange)}），券資比 ${m.shortToMarginRatio.toFixed(2)}%`,
  ];
  if (m.history?.length) {
    lines.push("近幾個交易日（加權指數／上市融資餘額／全市場擔保維持率／追繳戶數／追繳金額）：");
    for (const d of m.history) {
      lines.push(
        `- ${d.date}：指數 ${d.indexClose?.toFixed(2) ?? "—"}（${d.indexPct != null ? (d.indexPct >= 0 ? "+" : "") + d.indexPct.toFixed(2) + "%" : "—"}），融資 ${d.marginAmount != null ? yiFromThousand(d.marginAmount) + " 億" : "—"}（${d.marginAmountChange != null ? (d.marginAmountChange >= 0 ? "+" : "") + yiFromThousand(d.marginAmountChange) + " 億" : "—"}），維持率 ${d.keepRate != null ? d.keepRate.toFixed(2) + "%" : "—"}，追繳 ${d.callAccounts?.toLocaleString("en-US") ?? "—"} 戶／${d.callAmount != null ? yiFromYuan(d.callAmount) + " 億" : "—"}`,
      );
    }
  }
  const inst = (m.history ?? []).filter((d) => d.instForeign != null || d.instTrust != null || d.instDealer != null);
  if (inst.length) {
    const yy = (v?: number) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${yiFromYuan(v)} 億`);
    lines.push("三大法人買賣超（上市，外資及陸資不含外資自營商／投信／自營商自行買賣）：");
    for (const d of inst) {
      lines.push(`- ${d.date}：外資 ${yy(d.instForeign)}，投信 ${yy(d.instTrust)}，自營商 ${yy(d.instDealer)}`);
    }
  }
  for (const s of m.stocks) {
    lines.push(
      `- ETF ${s.name}(${s.code})：融資 ${s.marginToday.toLocaleString("en-US")} 張（${sign(s.marginChange)}），融券 ${s.shortToday.toLocaleString("en-US")} 張（${sign(s.shortChange)}）`,
    );
  }
  return lines.join("\n");
}
