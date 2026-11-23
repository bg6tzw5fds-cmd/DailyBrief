import "./_env";
const H = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36", Accept: "application/json" };
async function j(u: string, h: any = H) { const r = await fetch(u, { headers: h, signal: AbortSignal.timeout(15000) }); return { status: r.status, body: await r.text() }; }
async function main() {
  for (const secid of ["1.000300", "0.399006"]) {
    try {
      const r = await j(`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56&klt=101&fqt=0&beg=20251101&end=20500101`, { ...H, Referer: "https://quote.eastmoney.com/" });
      const k = JSON.parse(r.body)?.data?.klines ?? [];
      console.log(`[diag2] eastmoney ${secid} status=${r.status} n=${k.length} last3=${k.slice(-3).join(" | ")}`);
    } catch (e) { console.log(`[diag2] eastmoney ${secid} ERR ${e}`); }
  }
  for (const s of ["000300.SS", "399006.SZ"]) {
    const p2 = Math.floor(Date.now() / 1000), p1 = p2 - 400 * 86400;
    const r = await j(`https://query1.finance.yahoo.com/v8/finance/chart/${s}?period1=${p1}&period2=${p2}&interval=1d`);
    const x = JSON.parse(r.body).chart?.result?.[0];
    console.log(`[diag2] yahoo-period ${s} status=${r.status} n=${x?.timestamp?.length}`);
  }
  for (const s of ["BZ=F", "NG=F", "GC=F", "TWD=X"]) {
    const r = await j(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=5d&interval=30m`);
    const x = JSON.parse(r.body).chart?.result?.[0]; const ts: number[] = x?.timestamp ?? []; const c = x?.indicators?.quote?.[0]?.close ?? [];
    const pick = (lo: string, hi: string) => ts.map((t, i) => [t * 1000, c[i]] as [number, number]).filter(([t]) => t >= Date.parse(lo) && t <= Date.parse(hi)).map(([t, v]) => `${new Date(t).toISOString().slice(5, 16)}=${v?.toFixed?.(3)}`).join(" ");
    console.log(`[diag2] ${s} Fri: ${pick("2026-11-20T18:00:00Z", "2026-11-20T22:30:00Z")}`);
    console.log(`[diag2] ${s} Mon: ${pick("2026-11-23T05:00:00Z", "2026-11-23T09:00:00Z")} || ${pick("2026-11-23T18:00:00Z", "2026-11-24T00:30:00Z")}`);
  }
}
main().then(() => process.exit(0));
