import { analyzeTicker, type TickerAnalysis } from "./signals";
import { WATCHLIST, type TickerDef } from "./watchlist";
import { fetchIntradayCloses, fetchTickerData, type TickerRawData } from "./yahoo";

/** How many Yahoo requests run at the same time (keeps us under rate limits). */
const CONCURRENCY = 6;

/** The US session whose close every asset is aligned to. */
const REFERENCE_SYMBOL = "^GSPC";

/**
 * Assets that trade (almost) around the clock: futures, FX pairs, DXY.
 * By 07:00 Taipei their next session has usually already opened in Asia,
 * so their "latest" price would not be comparable with US equity closes.
 */
export function isAroundTheClock(symbol: string): boolean {
  return symbol.endsWith("=F") || symbol.endsWith("=X") || symbol.startsWith("DX-Y");
}

async function fetchWithRetry(symbol: string): Promise<TickerRawData | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await fetchTickerData(symbol);
      if (raw && raw.candles.length > 0) return raw;
    } catch (e) {
      if (attempt === 2) throw e;
    }
    if (attempt === 1) await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

async function mapLimited<T, R>(items: T[], fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return out;
}

/** 16:00 New York time on the calendar day of `d` (DST-aware), as epoch ms. */
export function nyCloseOf(d: Date): number {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d); // YYYY-MM-DD
  // Try both possible offsets (EST -5 / EDT -4) and keep the one that is 16:00 in NY.
  for (const off of [5, 4]) {
    const t = Date.parse(`${ymd}T${String(16 + off).padStart(2, "0")}:00:00Z`);
    const hh = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      hour12: false,
    }).format(new Date(t));
    if (Number(hh) === 16) return t;
  }
  return Date.parse(`${ymd}T21:00:00Z`);
}

/** 16:00 Asia/Taipei (台北外匯收盤) on the Taipei calendar day of `d`, as epoch ms. */
export function taipeiCloseOf(d: Date): number {
  const t = new Date(d.getTime() + 8 * 3600_000); // Taipei wall clock (no DST)
  return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 8, 0, 0);
}

/**
 * Close of the last intraday bar that ENDS at or before `t` (bar start + 30m ≤ t),
 * looking back at most 12 hours. null when no such bar.
 */
export function priceAt(bars: { t: number; close: number }[], t: number, barMs = 30 * 60_000): number | null {
  let best: { t: number; close: number } | null = null;
  for (const b of bars) if (b.t + barMs <= t && (!best || b.t > best.t)) best = b;
  return best && t - best.t <= 12 * 3600_000 ? best.close : null;
}

/**
 * Pure alignment step — exported for tests.
 * `refs` = the reference market's last session-close instants, oldest first
 * (US: 16:00 New York; USD/TWD: 16:00 Taipei).
 *  1. Drop daily candles that start after the latest reference close
 *     (= a new session that already opened in Asia). They feed SMA/RSI only.
 *  2. Read current / 1-session-ago / 5-sessions-ago prices from intraday bars
 *     of ONE series, so futures never mix contract months and FX never mixes
 *     London and New York day boundaries.
 */
export function alignToRefs(
  raw: TickerRawData,
  refs: number[],
  intraday: { t: number; close: number }[],
): TickerRawData {
  if (refs.length === 0) return raw;
  const last = refs[refs.length - 1];
  const candles = raw.candles.filter((c) => c.date.getTime() <= last);
  const current = priceAt(intraday, last);
  if (current == null) {
    // No intraday data — at least drop the new session.
    if (candles.length === 0) return raw;
    return { ...raw, candles, regularMarketPrice: candles[candles.length - 1].close };
  }
  const prev1 = refs.length >= 2 ? priceAt(intraday, refs[refs.length - 2]) ?? undefined : undefined;
  const prev5 = refs.length >= 6 ? priceAt(intraday, refs[refs.length - 6]) ?? undefined : undefined;
  return {
    ...raw,
    candles: candles.length ? candles : raw.candles,
    regularMarketPrice: current,
    override: { current, prev1, prev5 },
  };
}

function partsIn(tz: string, d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      weekday: "short", hour: "2-digit", hour12: false,
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  return { ymd: `${p.year}-${p.month}-${p.day}`, wd: p.weekday as string, hour: Number(p.hour) % 24 };
}

/**
 * 該市場「最近一個應該已經收盤的交易日」（當地日期 YYYY-MM-DD）：
 * 平日當地 17:00 以後算今天，否則往前找最近的平日。只看週末，不含國定假日
 * ——正是用來偵測國定假日休市。
 */
export function expectedSessionDate(tz: string, now: Date = new Date()): string {
  let t = now;
  let { ymd, wd, hour } = partsIn(tz, t);
  const isWeekday = (w: string) => w !== "Sat" && w !== "Sun";
  if (isWeekday(wd) && hour >= 17) return ymd;
  for (let i = 0; i < 7; i++) {
    t = new Date(t.getTime() - 86400_000);
    ({ ymd, wd } = partsIn(tz, t));
    if (isWeekday(wd)) return ymd;
  }
  return ymd;
}

/**
 * 盤中執行時（例如補跑）去掉「今天尚未收盤」的 K 棒，確保所有市場都是前一交易日收盤。
 * 判斷方式：最後一根 K 棒是當地「今天」且當地時間未到 17:00。Pure; exported for tests.
 */
export function dropUnfinishedSession(raw: TickerRawData, now: Date = new Date()): TickerRawData {
  if (!raw.timezone || isAroundTheClock(raw.symbol) || raw.candles.length < 2) return raw;
  const last = raw.candles[raw.candles.length - 1];
  const nowP = partsIn(raw.timezone, now);
  if (partsIn(raw.timezone, last.date).ymd !== nowP.ymd || nowP.hour >= 17) return raw;
  const candles = raw.candles.slice(0, -1);
  return { ...raw, candles, regularMarketPrice: candles[candles.length - 1].close };
}

/** Mark tickers whose market was closed on its most recent expected session. Pure; exported for tests. */
export function markHolidays(a: TickerAnalysis, raw: TickerRawData, now: Date = new Date()): TickerAnalysis {
  const last = raw.candles[raw.candles.length - 1];
  if (!last || !raw.timezone) return a;
  const lastYmd = partsIn(raw.timezone, last.date).ymd;
  const out = { ...a, lastSessionDate: `${lastYmd.slice(5, 7)}/${lastYmd.slice(8, 10)}` };
  if (isAroundTheClock(a.symbol)) return out;
  if (lastYmd < expectedSessionDate(raw.timezone, now)) {
    return { ...out, marketClosed: true, pct1Day: 0 };
  }
  return out;
}

/**
 * Fetch + analyze the entire watchlist with bounded concurrency. Failures
 * are non-fatal — the affected ticker is dropped from the output.
 *
 * Order in the returned array follows WATCHLIST so the renderer can
 * group by AssetGroup without further sorting.
 */
export async function analyzeWatchlist(
  list: TickerDef[] = WATCHLIST,
): Promise<TickerAnalysis[]> {
  const raws = await mapLimited(list, async (def) => {
    try {
      const raw = await fetchWithRetry(def.symbol);
      if (!raw) console.warn(`[trading] ${def.symbol} returned no data`);
      return raw;
    } catch (e) {
      console.warn(`[trading] ${def.symbol} failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  });

  // 參考時點：美股（S&P 500）最近 6 個交易日的紐約 16:00；
  // 美元/新台幣改用台股（加權指數）交易日的台北 16:00。
  const sessions = (sym: string) => raws[list.findIndex((d) => d.symbol === sym)]?.candles ?? [];
  const now = Date.now();
  const usRefs = sessions(REFERENCE_SYMBOL).slice(-6).map((c) => nyCloseOf(c.date)).filter((t) => t <= now);
  const twRefs = sessions("^TWII").slice(-6).map((c) => taipeiCloseOf(c.date)).filter((t) => t <= now);

  const aligned = await mapLimited(list, async (def) => {
    const raw = raws[list.indexOf(def)];
    if (!raw || !isAroundTheClock(def.symbol)) return raw;
    const refs = def.symbol === "TWD=X" && twRefs.length ? twRefs : usRefs;
    if (refs.length === 0) return raw;
    let intraday: { t: number; close: number }[] = [];
    try {
      intraday = await fetchIntradayCloses(def.symbol);
    } catch {
      /* fall back to daily-only alignment */
    }
    const out = alignToRefs(raw, refs, intraday);
    console.log(
      `[trading] ${def.symbol} aligned to ${def.symbol === "TWD=X" ? "Taipei 16:00" : "US close"} ${new Date(refs[refs.length - 1]).toISOString().slice(0, 16)}Z: ${out.override ? `${out.override.current} (prev ${out.override.prev1})` : `daily ${out.regularMarketPrice}`}`,
    );
    return out;
  });

  const results = list.map((def, i) => {
    const raw = aligned[i];
    if (!raw) return null;
    try {
      const done = dropUnfinishedSession(raw);
      if (done !== raw) console.log(`[trading] ${def.symbol} session still open — using previous close`);
      const a = markHolidays(analyzeTicker(def, done), done);
      if (a.marketClosed) console.log(`[trading] ${def.symbol} market closed — last session ${a.lastSessionDate}`);
      return a;
    } catch (e) {
      console.warn(`[trading] ${def.symbol} analyze failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  });
  return results.filter((x): x is TickerAnalysis => x !== null);
}
