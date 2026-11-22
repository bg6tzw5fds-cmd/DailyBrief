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

/** Last intraday close at or before `t` (within 12h), else null. */
function priceAt(bars: { t: number; close: number }[], t: number): number | null {
  let best: { t: number; close: number } | null = null;
  for (const b of bars) if (b.t <= t && (!best || b.t > best.t)) best = b;
  return best && t - best.t <= 12 * 3600_000 ? best.close : null;
}

/**
 * Pure alignment step — exported for tests.
 *  1. Drop daily candles that start after the reference US close
 *     (= the new session that already opened in Asia).
 *  2. When intraday data is available, set the last two closes to the price
 *     at the last two US closes, so the 1-day change covers the same window
 *     as US equities.
 */
export function alignToClose(
  raw: TickerRawData,
  refClose: number,
  prevRefClose: number | null,
  intraday: { t: number; close: number }[],
): TickerRawData {
  const candles = raw.candles.filter((c) => c.date.getTime() <= refClose).map((c) => ({ ...c }));
  if (candles.length === 0) return raw;
  const n = candles.length;
  const atRef = priceAt(intraday, refClose);
  if (atRef != null) candles[n - 1].close = atRef;
  if (prevRefClose != null && n >= 2) {
    const atPrev = priceAt(intraday, prevRefClose);
    if (atPrev != null) candles[n - 2].close = atPrev;
  }
  return { ...raw, candles, regularMarketPrice: candles[n - 1].close };
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

  // Reference = the last completed US equity session (S&P 500).
  const ref = raws[list.findIndex((d) => d.symbol === REFERENCE_SYMBOL)];
  const refCandles = ref?.candles ?? [];
  const refClose = refCandles.length ? nyCloseOf(refCandles[refCandles.length - 1].date) : null;
  const prevRefClose = refCandles.length >= 2 ? nyCloseOf(refCandles[refCandles.length - 2].date) : null;

  const aligned = await mapLimited(list, async (def) => {
    const raw = raws[list.indexOf(def)];
    if (!raw || refClose == null || !isAroundTheClock(def.symbol)) return raw;
    // Only meaningful once the US session has actually closed.
    if (Date.now() < refClose) return raw;
    let intraday: { t: number; close: number }[] = [];
    try {
      intraday = await fetchIntradayCloses(def.symbol);
    } catch {
      /* daily-only alignment still applies */
    }
    const out = alignToClose(raw, refClose, prevRefClose, intraday);
    if (out.regularMarketPrice !== raw.regularMarketPrice) {
      console.log(
        `[trading] ${def.symbol} aligned to US close: ${raw.regularMarketPrice.toFixed(4)} → ${out.regularMarketPrice.toFixed(4)}`,
      );
    }
    return out;
  });

  const results = list.map((def, i) => {
    const raw = aligned[i];
    if (!raw) return null;
    try {
      return analyzeTicker(def, raw);
    } catch (e) {
      console.warn(`[trading] ${def.symbol} analyze failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  });
  return results.filter((x): x is TickerAnalysis => x !== null);
}
