/**
 * 檢查 24 小時交易資產（黃金、原油、匯率、美元指數）是否正確對齊美股收盤。
 * 只印結果，不寫檔、不呼叫 AI。Source Check workflow 會執行。
 */
import "./_env";
import { analyzeWatchlist, isAroundTheClock } from "../lib/trading/runner";
import { WATCHLIST } from "../lib/trading/watchlist";
import { fetchTickerData } from "../lib/trading/yahoo";

async function main() {
  const list = WATCHLIST.filter((t) => ["^GSPC", "^TWII", "^STOXX", "^STOXX50E", "000300.SS", "399006.SZ", "2330.TW"].includes(t.symbol) || isAroundTheClock(t.symbol));
  for (const t of list) {
    const raw = await fetchTickerData(t.symbol);
    const last = raw?.candles.slice(-3).map((c) => `${c.date.toISOString().slice(0, 16)}=${c.close.toFixed(3)}`);
    console.log(`[raw] ${t.symbol.padEnd(10)} live=${raw?.regularMarketPrice} last3=${last?.join(" | ")}`);
  }
  const out = await analyzeWatchlist(list);
  for (const a of out) {
    console.log(`[aligned] ${a.symbol.padEnd(10)} price=${a.currentPrice.toFixed(3)} 1D=${a.pct1Day.toFixed(2)}% 5D=${a.pct5Day.toFixed(2)}% vs52H=${a.pct52WeekHigh.toFixed(1)}% vs52L=${a.pct52WeekLow.toFixed(1)}% n=${a.candleCount ?? ""} sig=${a.signals.map((x: any) => x.label).join("/")}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
