import { analyzeTicker, type TickerAnalysis } from "./signals";
import { WATCHLIST, type TickerDef } from "./watchlist";
import { fetchTickerData, type TickerRawData } from "./yahoo";

/** How many Yahoo requests run at the same time (keeps us under rate limits). */
const CONCURRENCY = 6;

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

async function analyzeOne(def: TickerDef): Promise<TickerAnalysis | null> {
  try {
    const raw = await fetchWithRetry(def.symbol);
    if (!raw) {
      console.warn(`[trading] ${def.symbol} returned no data`);
      return null;
    }
    return analyzeTicker(def, raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[trading] ${def.symbol} failed: ${msg}`);
    return null;
  }
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
  const results: (TickerAnalysis | null)[] = new Array(list.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const i = next++;
      results[i] = await analyzeOne(list[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
  return results.filter((x): x is TickerAnalysis => x !== null);
}
