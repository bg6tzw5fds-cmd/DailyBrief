/** 診斷：印出指定標的 Yahoo 原始資料（meta 與最後幾根日 K）。SYMBOLS 以逗號分隔。 */
import "./_env";
const HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36", Accept: "application/json" };
const syms = (process.env.SYMBOLS ?? "^TWII,^STOXX,000300.SS,399006.SZ,TWD=X,BZ=F,^GSPC").split(",");
async function main() {
  for (const s of syms) {
    const r = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=1y&interval=1d`, { headers: HEADERS });
    const j: any = await r.json();
    const x = j.chart?.result?.[0]; if (!x) { console.log(`[diag] ${s} NO RESULT ${r.status}`); continue; }
    const m = x.meta; const ts: number[] = x.timestamp ?? []; const c = x.indicators.quote[0].close;
    console.log(`[diag] ${s} tz=${m.exchangeTimezoneName} price=${m.regularMarketPrice} time=${new Date(m.regularMarketTime*1000).toISOString()} prevClose=${m.previousClose} chartPrev=${m.chartPreviousClose} 52H=${m.fiftyTwoWeekHigh} 52L=${m.fiftyTwoWeekLow} n=${ts.length} validRange=${m.validRanges?.length} dataGranularity=${m.dataGranularity}`);
    const tail = ts.slice(-7).map((t, i) => `${new Date(t*1000).toISOString().slice(0,16)}=${c[ts.length-7+i]}`);
    console.log(`[diag] ${s} last7: ${tail.join(" | ")}`);
    const nn = c.filter((v: any) => v != null); const uniq = new Set(nn.slice(-30).map((v: number) => v.toFixed(2))).size;
    console.log(`[diag] ${s} nonNull=${nn.length} distinctLast30=${uniq} first=${new Date(ts[0]*1000).toISOString().slice(0,10)}`);
  }
}
main().then(() => process.exit(0));
