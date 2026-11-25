import "./_env";
const H = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36", Accept: "application/json", Referer: "https://www.twse.com.tw/zh/trading/foreign/bfi82u.html" };
async function main() {
  for (const u of [
    "https://www.twse.com.tw/rwd/zh/fund/BFI82U?type=day&dayDate=20261125&response=json",
    "https://www.twse.com.tw/rwd/zh/fund/BFI82U?type=day&date=20261125&response=json",
    "https://www.twse.com.tw/rwd/zh/fund/BFI82U?dayDate=20261125&weekDate=&monthDate=&type=day&response=json",
    "https://www.twse.com.tw/fund/BFI82U?response=json&dayDate=20261125&type=day",
  ]) {
    const r = await fetch(u, { headers: H }); const t = await r.text();
    console.log(`[twse] ${r.status} ${u.replace("https://www.twse.com.tw", "")}\n[twse]   ${t.slice(0, 600).replace(/\n/g, " ")}`);
    await new Promise((x) => setTimeout(x, 2500));
  }
}
main().then(() => process.exit(0));
