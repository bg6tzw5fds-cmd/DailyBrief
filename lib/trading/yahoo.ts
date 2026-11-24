export interface OHLC {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TickerRawData {
  symbol: string;
  currency: string;
  exchangeName: string;
  regularMarketPrice: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  /** Daily OHLCV for the last ~1 year, oldest first. */
  candles: OHLC[];
  /** 交易所時區（IANA），用來判斷最新一根 K 棒是哪一個交易日。 */
  timezone?: string;
  /**
   * 投資晨報：24 小時交易資產對齊到參考市場收盤時點後的價格。
   * 有提供時，signals.ts 以此計算現價、日漲跌、5 日漲跌。
   */
  override?: { current: number; prev1?: number; prev5?: number };
}

/** A 股指數 Yahoo 沒有歷史日線，改用東方財富公開日 K。 */
const EASTMONEY_SECID: Record<string, string> = {
  "000300.SS": "1.000300", // 滬深 300
  "399006.SZ": "0.399006", // 創業板指
  "000001.SS": "1.000001", // 上證指數
  "399001.SZ": "0.399001", // 深證成指
};

async function fetchEastmoney(symbol: string, secid: string): Promise<TickerRawData | null> {
  const beg = new Date(Date.now() - 400 * 86400_000).toISOString().slice(0, 10).replace(/-/g, "");
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56&klt=101&fqt=0&beg=${beg}&end=20500101`;
  const res = await fetch(url, {
    headers: { ...HEADERS, Referer: "https://quote.eastmoney.com/" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { data?: { klines?: string[] } };
  const candles: OHLC[] = [];
  for (const line of j.data?.klines ?? []) {
    // 日期,開,收,高,低,量
    const [d, o, c, h, l, v] = line.split(",");
    const close = Number(c);
    if (!d || !Number.isFinite(close)) continue;
    candles.push({
      date: new Date(`${d}T07:00:00Z`), // 15:00 Asia/Shanghai
      open: Number(o),
      high: Number(h),
      low: Number(l),
      close,
      volume: Number(v) || 0,
    });
  }
  if (candles.length === 0) return null;
  const year = candles.slice(-252);
  return {
    symbol,
    currency: "CNY",
    exchangeName: secid.startsWith("1.") ? "SSE" : "SZSE",
    timezone: "Asia/Shanghai",
    regularMarketPrice: candles[candles.length - 1].close,
    fiftyTwoWeekHigh: Math.max(...year.map((x) => x.high)),
    fiftyTwoWeekLow: Math.min(...year.map((x) => x.low)),
    candles,
  };
}

/** Calendar date (YYYY-MM-DD) of an instant in a given IANA time zone. */
function dateIn(tz: string, d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
} as const;

interface YahooChartResp {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        currency?: string;
        exchangeName?: string;
        regularMarketPrice?: number;
        fiftyTwoWeekHigh?: number;
        fiftyTwoWeekLow?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }>;
    error?: { code?: string; description?: string } | null;
  };
}

/**
 * Fetch daily OHLCV + meta from Yahoo Finance public chart API.
 * No key required. Works for stocks, ETFs, indices, crypto (BTC-USD),
 * forex (USDCNY=X), commodities (GC=F), Hong Kong equities (0700.HK).
 *
 * Null-day candles (e.g. forex non-trading day) are filtered out.
 */
export async function fetchTickerData(
  symbol: string,
): Promise<TickerRawData | null> {
  if (EASTMONEY_SECID[symbol]) return fetchEastmoney(symbol, EASTMONEY_SECID[symbol]);
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return null;
  const data = (await res.json()) as YahooChartResp;
  const r = data.chart?.result?.[0];
  if (!r || !r.meta || !r.timestamp || !r.indicators?.quote?.[0]) return null;

  const ts = r.timestamp;
  const q = r.indicators.quote[0];
  const candles: OHLC[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i];
    const h = q.high?.[i];
    const l = q.low?.[i];
    const c = q.close?.[i];
    const v = q.volume?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    candles.push({
      date: new Date(ts[i] * 1000),
      open: o,
      high: h,
      low: l,
      close: c,
      volume: v ?? 0,
    });
  }

  // Yahoo 有時最新一根日 K 的收盤是 null（例如台股、STOXX 600 收盤後），
  // 只有 meta.regularMarketPrice 是最新收盤。補上一根，避免日漲跌變成兩日漲跌。
  const meta = r.meta as typeof r.meta & {
    regularMarketTime?: number;
    exchangeTimezoneName?: string;
    regularMarketDayHigh?: number;
    regularMarketDayLow?: number;
  };
  const is24h = symbol.endsWith("=F") || symbol.endsWith("=X") || symbol.startsWith("DX-Y");
  if (!is24h && meta.regularMarketPrice != null && meta.regularMarketTime && candles.length > 0) {
    const tz = meta.exchangeTimezoneName ?? "UTC";
    const lastDay = dateIn(tz, candles[candles.length - 1].date);
    const quoteDay = dateIn(tz, new Date(meta.regularMarketTime * 1000));
    if (quoteDay > lastDay) {
      const p = meta.regularMarketPrice;
      candles.push({
        date: new Date(meta.regularMarketTime * 1000),
        open: p,
        high: meta.regularMarketDayHigh ?? p,
        low: meta.regularMarketDayLow ?? p,
        close: p,
        volume: 0,
      });
    }
  }

  return {
    symbol: r.meta.symbol ?? symbol,
    currency: r.meta.currency ?? "",
    exchangeName: r.meta.exchangeName ?? "",
    timezone: meta.exchangeTimezoneName,
    regularMarketPrice:
      r.meta.regularMarketPrice ?? candles[candles.length - 1]?.close ?? 0,
    fiftyTwoWeekHigh: r.meta.fiftyTwoWeekHigh ?? 0,
    fiftyTwoWeekLow: r.meta.fiftyTwoWeekLow ?? 0,
    candles,
  };
}

/**
 * Intraday bars (30-minute, last ~5 days) — used to read a 24-hour asset's
 * price at the exact moment the US equity market closed.
 */
export async function fetchIntradayCloses(
  symbol: string,
): Promise<{ t: number; close: number }[]> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=30m`;
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (!res.ok) return [];
  const data = (await res.json()) as YahooChartResp;
  const r = data.chart?.result?.[0];
  const ts = r?.timestamp ?? [];
  const closes = r?.indicators?.quote?.[0]?.close ?? [];
  const out: { t: number; close: number }[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c != null && Number.isFinite(c)) out.push({ t: ts[i] * 1000, close: c });
  }
  return out;
}
