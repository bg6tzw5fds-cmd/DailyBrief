/**
 * 投資晨報 · 行情觀察清單（客製版）
 *
 * 想新增／移除標的：照下面格式加一行或刪一行即可。
 *   symbol      → Yahoo Finance 代碼（台股上市加 .TW、上櫃加 .TWO）
 *   displayName → 晨報上顯示的中文名稱
 *   group       → 放在哪個分頁（見 AssetGroup）
 */
export type AssetGroup =
  | "index" // 全球主要指數
  | "taiwan" // 台股權值與台股 ETF
  | "ai-semi" // AI 與半導體個股
  | "etf" // 追蹤中的美股 ETF
  | "commodity" // 商品（能源、貴金屬、工業金屬）
  | "rates-fx"; // 利率、匯率與波動率

export interface TickerDef {
  symbol: string; // Yahoo Finance symbol
  displayName: string; // 中文展示名
  displayNameEn?: string; // English display name (falls back to displayName if absent)
  group: AssetGroup;
}

export function getDisplayName(t: TickerDef, locale: "zh" | "en"): string {
  return locale === "en" ? (t.displayNameEn ?? t.displayName) : t.displayName;
}

const ASSET_GROUP_LABELS_ZH: Record<AssetGroup, string> = {
  index: "全球指數",
  taiwan: "台股",
  "ai-semi": "AI 與半導體",
  etf: "追蹤 ETF",
  commodity: "商品",
  "rates-fx": "利率與匯率",
};

const ASSET_GROUP_LABELS_EN: Record<AssetGroup, string> = {
  index: "Global Indices",
  taiwan: "Taiwan",
  "ai-semi": "AI & Semis",
  etf: "ETF Watchlist",
  commodity: "Commodities",
  "rates-fx": "Rates & FX",
};

export function getAssetGroupLabels(
  locale: "zh" | "en",
): Record<AssetGroup, string> {
  return locale === "en" ? ASSET_GROUP_LABELS_EN : ASSET_GROUP_LABELS_ZH;
}

export const ASSET_GROUP_ORDER: AssetGroup[] = [
  "index",
  "taiwan",
  "ai-semi",
  "etf",
  "commodity",
  "rates-fx",
];

export const WATCHLIST: TickerDef[] = [
  // === 全球主要指數 ===
  { symbol: "^GSPC", displayName: "S&P 500", group: "index" },
  { symbol: "^IXIC", displayName: "那斯達克綜合", displayNameEn: "Nasdaq Composite", group: "index" },
  { symbol: "^DJI", displayName: "道瓊工業", displayNameEn: "Dow Jones", group: "index" },
  { symbol: "^SOX", displayName: "費城半導體", displayNameEn: "PHLX Semiconductor", group: "index" },
  { symbol: "^RUT", displayName: "羅素 2000", displayNameEn: "Russell 2000", group: "index" },
  { symbol: "^TWII", displayName: "台股加權指數", displayNameEn: "TAIEX", group: "index" },
  { symbol: "^N225", displayName: "日經 225", displayNameEn: "Nikkei 225", group: "index" },
  { symbol: "^KS11", displayName: "韓國綜合", displayNameEn: "KOSPI", group: "index" },
  { symbol: "^HSI", displayName: "恒生指數", displayNameEn: "Hang Seng", group: "index" },
  { symbol: "^STOXX50E", displayName: "歐洲 STOXX 50", displayNameEn: "Euro STOXX 50", group: "index" },
  { symbol: "^STOXX", displayName: "歐洲 STOXX 600", displayNameEn: "STOXX Europe 600", group: "index" },
  { symbol: "^BSESN", displayName: "印度 SENSEX", displayNameEn: "BSE Sensex", group: "index" },
  { symbol: "000300.SS", displayName: "滬深 300", displayNameEn: "CSI 300", group: "index" },
  { symbol: "399006.SZ", displayName: "創業板指", displayNameEn: "ChiNext", group: "index" },

  // === 台股 ===
  { symbol: "2330.TW", displayName: "台積電", displayNameEn: "TSMC", group: "taiwan" },
  { symbol: "2317.TW", displayName: "鴻海", displayNameEn: "Hon Hai", group: "taiwan" },
  { symbol: "2454.TW", displayName: "聯發科", displayNameEn: "MediaTek", group: "taiwan" },
  { symbol: "2308.TW", displayName: "台達電", displayNameEn: "Delta Electronics", group: "taiwan" },
  { symbol: "2382.TW", displayName: "廣達", displayNameEn: "Quanta", group: "taiwan" },
  { symbol: "3711.TW", displayName: "日月光投控", displayNameEn: "ASE Technology", group: "taiwan" },
  { symbol: "0050.TW", displayName: "元大台灣50", displayNameEn: "Yuanta Taiwan 50", group: "taiwan" },

  // === AI 與半導體 ===
  { symbol: "NVDA", displayName: "輝達 NVIDIA", displayNameEn: "Nvidia", group: "ai-semi" },
  { symbol: "TSM", displayName: "台積電 ADR", displayNameEn: "TSMC ADR", group: "ai-semi" },
  { symbol: "AVGO", displayName: "博通 Broadcom", displayNameEn: "Broadcom", group: "ai-semi" },
  { symbol: "AMD", displayName: "超微 AMD", displayNameEn: "AMD", group: "ai-semi" },
  { symbol: "ASML", displayName: "艾司摩爾 ASML", displayNameEn: "ASML", group: "ai-semi" },
  { symbol: "MU", displayName: "美光 Micron", displayNameEn: "Micron", group: "ai-semi" },
  { symbol: "SNDK", displayName: "Sandisk", group: "ai-semi" },
  { symbol: "MSFT", displayName: "微軟 Microsoft", displayNameEn: "Microsoft", group: "ai-semi" },
  { symbol: "GOOGL", displayName: "Alphabet", group: "ai-semi" },
  { symbol: "AMZN", displayName: "亞馬遜 Amazon", displayNameEn: "Amazon", group: "ai-semi" },
  { symbol: "META", displayName: "Meta", group: "ai-semi" },
  { symbol: "ORCL", displayName: "甲骨文 Oracle", displayNameEn: "Oracle", group: "ai-semi" },

  // === 追蹤中的 ETF ===
  { symbol: "SOXX", displayName: "SOXX 半導體", displayNameEn: "iShares Semiconductor", group: "etf" },
  { symbol: "PSI", displayName: "PSI 半導體動能", displayNameEn: "Invesco Semiconductors", group: "etf" },
  { symbol: "IGV", displayName: "IGV 軟體", displayNameEn: "iShares Software", group: "etf" },
  { symbol: "EWY", displayName: "EWY 南韓", displayNameEn: "iShares South Korea", group: "etf" },
  { symbol: "EMXC", displayName: "EMXC 新興市場(除中國)", displayNameEn: "EM ex-China", group: "etf" },
  { symbol: "GDX", displayName: "GDX 金礦股", displayNameEn: "Gold Miners", group: "etf" },
  { symbol: "XLE", displayName: "XLE 能源", displayNameEn: "Energy Select", group: "etf" },
  { symbol: "OIH", displayName: "OIH 油服", displayNameEn: "Oil Services", group: "etf" },
  { symbol: "CRAK", displayName: "CRAK 煉油", displayNameEn: "Oil Refiners", group: "etf" },
  { symbol: "XME", displayName: "XME 金屬採礦", displayNameEn: "Metals & Mining", group: "etf" },
  { symbol: "MOO", displayName: "MOO 農業", displayNameEn: "Agribusiness", group: "etf" },
  { symbol: "FLOT", displayName: "FLOT 浮動利率債", displayNameEn: "Floating Rate Bond", group: "etf" },

  // === 商品 ===
  { symbol: "BZ=F", displayName: "Brent 原油", displayNameEn: "Brent Crude", group: "commodity" },
  { symbol: "CL=F", displayName: "WTI 原油", displayNameEn: "WTI Crude", group: "commodity" },
  { symbol: "NG=F", displayName: "美國天然氣", displayNameEn: "Natural Gas", group: "commodity" },
  { symbol: "GC=F", displayName: "黃金", displayNameEn: "Gold", group: "commodity" },
  { symbol: "SI=F", displayName: "白銀", displayNameEn: "Silver", group: "commodity" },
  { symbol: "HG=F", displayName: "銅", displayNameEn: "Copper", group: "commodity" },

  // === 利率、匯率與波動率 ===
  { symbol: "^IRX", displayName: "美國 3 個月國庫券殖利率 (%)", displayNameEn: "13W T-Bill Yield (%)", group: "rates-fx" },
  { symbol: "^FVX", displayName: "美國 5 年期公債殖利率 (%)", displayNameEn: "5Y Treasury Yield (%)", group: "rates-fx" },
  { symbol: "^TNX", displayName: "美國 10 年期公債殖利率 (%)", displayNameEn: "10Y Treasury Yield (%)", group: "rates-fx" },
  { symbol: "^TYX", displayName: "美國 30 年期公債殖利率 (%)", displayNameEn: "30Y Treasury Yield (%)", group: "rates-fx" },
  { symbol: "^VIX", displayName: "VIX 恐慌指數", displayNameEn: "VIX (Volatility)", group: "rates-fx" },
  { symbol: "DX-Y.NYB", displayName: "美元指數 DXY", displayNameEn: "DXY (US Dollar Index)", group: "rates-fx" },
  { symbol: "TWD=X", displayName: "美元 / 新台幣", displayNameEn: "USD / TWD", group: "rates-fx" },
  { symbol: "JPY=X", displayName: "美元 / 日圓", displayNameEn: "USD / JPY", group: "rates-fx" },
  { symbol: "EURUSD=X", displayName: "歐元 / 美元", displayNameEn: "EUR / USD", group: "rates-fx" },
];

/**
 * 晨報首頁「收盤快照」要顯示的代表性標的（順序即顯示順序）。
 */
export const SNAPSHOT_SYMBOLS: string[] = [
  "^GSPC",
  "^IXIC",
  "^SOX",
  "^TWII",
  "^STOXX",
  "^BSESN",
  "000300.SS",
  "399006.SZ",
  "2330.TW",
  "^TNX",
  "DX-Y.NYB",
  "TWD=X",
  "BZ=F",
  "GC=F",
  "^VIX",
];
