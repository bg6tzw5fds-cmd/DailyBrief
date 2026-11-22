import type {
  ArticleInput,
  BriefItem,
  DailyReport,
  TradingSection,
} from "../ai/pipeline";
import type { WatchlistPick } from "../ai/trading-commentary";
import { REPORT_LOCALE } from "../sources/registry";
import { getReportTz } from "../utils";
import type { Category, SourceDef } from "../sources/types";
import { V2EX_OFF_TOPIC_RE } from "../sources/v2ex";
import type { TickerAnalysis } from "../trading/signals";
import type { MarginSnapshot } from "../trading/twse-margin";
import {
  getAssetGroupLabels,
  ASSET_GROUP_ORDER,
  SNAPSHOT_SYMBOLS,
  type AssetGroup,
} from "../trading/watchlist";

// ----- i18n -----

/**
 * Localized UI strings. `t` resolves to TEXTS_ZH or TEXTS_EN at module
 * init based on REPORT_LOCALE. All hardcoded display text routes through
 * this object so adding a third locale = adding one more table.
 */
const TEXTS_ZH = {
  siteTitle: "投資晨報",
  catTech: "AI 與半導體",
  catFinance: "財經要點",
  catPolitics: "國際與地緣",
  catTrading: "市場行情",
  catCommunity: "社群討論",
  catDigest: "今日重點",
  subAiNews: "AI 產業",
  subSemis: "半導體產業",
  subTwTech: "台灣科技",
  subTwMarket: "台灣財經",
  subCentralBank: "央行與總經",
  subEnergy: "能源與原物料",
  subWscn: "華爾街見聞",
  subTrendingPapers: "熱門論文",
  subXViral: "X 推文",
  subBlogWeekly: "部落格",
  subCnCommunity: "中文社群",
  subOverseasCommunity: "海外社群",
  subFinanceNews: "國際財經",
  subFinanceCommunity: "社群討論",
  subWorld: "國際要聞",
  subOverseasNews: "海外科技",
  subOverseas: "海外",
  emptySource: "此來源今日無內容。",
  emptyCategory: "此分類今日無內容。",
  emptyGroup: "此組今日無資料。",
  footer: "內容均來自原始媒體與公開行情資料，本頁僅做摘要整理與連結，不構成投資建議。",
  summaryLabelNews: "中文摘要",
  summaryLabelIntro: "中文介紹",
  tradingMarketOverview: "技術面總覽",
  tradingTodayFocus: "今日技術面焦點",
  tradingAllAssets: "全部標的",
  tradingRiskCaveat: "風險提示",
  widgetCryptoFearGreed: "加密恐慌貪婪",
  widgetCryptoCap: "加密總市值",
  widgetBtcDom: "BTC 市占率",
  widgetVolume24h: "24h 成交量",
  widgetActiveCoins: "活躍幣種",
  ticker5d: "5 日",
  tickerVs52wHigh: "距 52 週高",
  tickerTrend: "趨勢",
  tickerMacd: "MACD / 訊號",
  signalToday: "今天",
  signalDaysAgoSuffix: "天前",
  trendBullish: "多頭",
  trendBearish: "空頭",
  trendNeutral: "中性",
  mdTodayOverview: "今日總覽",
  mdEditorNote: "編輯短評",
  mdTodayKeywords: "今日關鍵字",
  mdImportance: "重要度",
  archiveLink: "← 歷史晨報",
  digestHeadline: "今日頭條",
  digestOverview: "晨報總覽",
  digestSnapshot: "收盤快照",
  digestSnapshotNote: "前一交易日收盤；殖利率單位為 %，漲跌以「台股慣例」紅漲綠跌呈現",
  snapshotName: "標的",
  snapshotLast: "最新",
  snapshot1d: "日漲跌",
  snapshot5d: "5 日",
  digestFinance: "財經與總經重點",
  marginTitle: "台股信用交易",
  marginNote: "資料來源：臺灣證券交易所臺股儀表板；為前一交易日資料。融資餘額為上市（含 ETF）；擔保維持率、追繳為上市＋上櫃全市場；追繳戶數指整戶擔保維持率低於 130% 之戶數",
  marginKeepRate: "全市場擔保維持率",
  marginCallAcc: "追繳戶數",
  marginCallAmt: "追繳金額",
  marginHistory: "近 5 個交易日",
  marginDate: "日期",
  marginIndex: "加權指數",
  marginPct: "漲跌%",
  marginAmtYi: "融資餘額(億)",
  marginAmtChg: "增減(億)",
  marginCallAmtYi: "追繳金額(億)",
  marginEtf: "ETF 融資融券（張）",
  marginWantgoo: "玩股網：扣除 ETF 融資餘額與融資維持率 →",
  marginAmount: "融資餘額",
  marginUnits: "融資（張）",
  marginShort: "融券（張）",
  marginRatio: "券資比",
  marginStock: "個股",
  marginChange: "增減",
  digestTech: "AI 與半導體重點",
  digestPolitics: "國際與地緣重點",
  digestEditorNote: "編輯觀點",
  digestKeywords: "今日關鍵字",
  digestEmpty: "今日 AI 摘要未產生，請直接瀏覽各分頁新聞。",
};

const TEXTS_EN: typeof TEXTS_ZH = {
  siteTitle: "Daily Brief",
  catTech: "Tech",
  catFinance: "Finance",
  catPolitics: "World",
  catTrading: "Markets",
  catCommunity: "Community",
  subAiNews: "AI Media",
  subTrendingPapers: "Trending Papers",
  subXViral: "X Viral",
  subBlogWeekly: "Blog Weekly",
  subCnCommunity: "Chinese Community",
  subOverseasCommunity: "Overseas Community",
  subFinanceNews: "Finance News",
  subFinanceCommunity: "Community",
  subWorld: "World News",
  subOverseasNews: "Overseas Tech",
  subOverseas: "Overseas",
  emptySource: "No content from this source today.",
  emptyCategory: "No content in this category today.",
  emptyGroup: "No data for this group today.",
  footer:
    "Content sourced from original publishers; this site provides summary and backlinks only.",
  summaryLabelNews: "Summary",
  summaryLabelIntro: "Summary",
  tradingMarketOverview: "Market Overview",
  tradingTodayFocus: "Today's Focus",
  tradingAllAssets: "All Assets",
  tradingRiskCaveat: "Risk Disclaimer",
  widgetCryptoFearGreed: "Crypto Fear/Greed",
  widgetCryptoCap: "Crypto Market Cap",
  widgetBtcDom: "BTC Dominance",
  widgetVolume24h: "24h Volume",
  widgetActiveCoins: "Active coins",
  ticker5d: "5d",
  tickerVs52wHigh: "vs 52w High",
  tickerTrend: "Trend",
  tickerMacd: "MACD / Signal",
  signalToday: "today",
  signalDaysAgoSuffix: "d ago",
  trendBullish: "Bullish",
  trendBearish: "Bearish",
  trendNeutral: "Neutral",
  mdTodayOverview: "Today's Overview",
  mdEditorNote: "Editor's Note",
  mdTodayKeywords: "Keywords",
  mdImportance: "Importance",
  archiveLink: "← Archive",
  catDigest: "Today",
  subSemis: "Semiconductors",
  subTwTech: "Taiwan Tech",
  subTwMarket: "Taiwan Markets",
  subCentralBank: "Central Banks & Macro",
  subEnergy: "Energy & Materials",
  subWscn: "WallstreetCN",
  digestHeadline: "Headline",
  digestOverview: "Overview",
  digestSnapshot: "Market Snapshot",
  digestSnapshotNote: "Previous close; yields in %",
  snapshotName: "Asset",
  snapshotLast: "Last",
  snapshot1d: "1D",
  snapshot5d: "5D",
  digestFinance: "Finance & Macro",
  marginTitle: "Taiwan Margin Trading",
  marginNote: "Source: TWSE dashboard; previous trading day. Margin balance is TWSE-listed (incl. ETFs); maintenance ratio and margin calls cover TWSE + TPEx; call accounts = accounts below 130%",
  marginKeepRate: "Market maint. ratio",
  marginCallAcc: "Margin-call accts",
  marginCallAmt: "Margin-call amount",
  marginHistory: "Last 5 trading days",
  marginDate: "Date",
  marginIndex: "TAIEX",
  marginPct: "Chg%",
  marginAmtYi: "Margin (100M)",
  marginAmtChg: "Chg (100M)",
  marginCallAmtYi: "Calls (100M)",
  marginEtf: "ETF margin / short (lots)",
  marginWantgoo: "Wantgoo: margin balance & ratio excl. ETFs →",
  marginAmount: "Margin balance",
  marginUnits: "Margin (lots)",
  marginShort: "Short (lots)",
  marginRatio: "Short/Margin",
  marginStock: "Stock",
  marginChange: "Chg",
  digestTech: "AI & Semis",
  digestPolitics: "World & Geopolitics",
  digestEditorNote: "Editor's Note",
  digestKeywords: "Keywords",
  digestEmpty: "No AI digest today — browse the tabs for news.",
};

const STR = REPORT_LOCALE === "en" ? TEXTS_EN : TEXTS_ZH;
const ASSET_GROUP_LABELS_LOCALIZED = getAssetGroupLabels(REPORT_LOCALE);

// ----- types -----

export type SourceGroup = {
  sourceId: string;
  sourceName: string;
  items: ArticleInput[];
  /**
   * When true, items come from multiple merged sources and the renderer
   * should label each article with `a.source` since the source-tab row
   * is suppressed (only one synthetic group).
   */
  merged?: boolean;
};

export type SubGroup = {
  id: string;
  name: string;
  sources: SourceGroup[];
};

export type RawByCategory = Record<Category, SubGroup[]>;

// ----- labels & ordering -----

const CATEGORY_LABELS: Record<Category, string> = {
  tech: STR.catTech,
  finance: STR.catFinance,
  politics: STR.catPolitics,
};

const CATEGORY_DIGEST_LABELS: Record<Category, string> = {
  tech: STR.catTech,
  finance: STR.catFinance,
  politics: STR.catPolitics,
};

/**
 * L2 ordering per category. Categories not listed render flat (no L2 tabs).
 */
const SUBCATEGORY_ORDER: Partial<Record<Category, string[]>> = {
  // cn-community + overseas-community are listed last so the L1 "community"
  // panel (rendered separately via TECH_COMMUNITY_SUBS) can extract them.
  // Within the "tech" L1 panel itself, COMMUNITY_SUBS is filtered out.
  // Locale filtering at registry level decides which actually appears:
  // zh mode keeps cn-community (V2EX / LinuxDo); en mode keeps
  // overseas-community (Hacker News / r/stocks).
  tech: ["semis", "ai-news", "tw-tech", "github-trending", "trending-papers", "x-viral", "cn-community", "overseas-community"],
  finance: ["tw-market", "news", "wscn", "central-bank", "energy"],
  politics: ["world"],
};

const TECH_MAIN_SUBS = new Set(["semis", "ai-news", "tw-tech", "github-trending", "trending-papers", "x-viral"]);
const TECH_COMMUNITY_SUBS = new Set(["cn-community", "overseas-community"]);

const SUBCATEGORY_LABELS: Record<string, string> = {
  "github-trending": "GitHub Trending",
  "trending-papers": STR.subTrendingPapers,
  "cn-community": STR.subCnCommunity,
  "overseas-community": STR.subOverseasCommunity,
  "ai-news": STR.subAiNews,
  "x-viral": STR.subXViral,
  "blog-weekly": STR.subBlogWeekly,
  news: STR.subFinanceNews,
  world: STR.subWorld,
  semis: STR.subSemis,
  "tw-tech": STR.subTwTech,
  "tw-market": STR.subTwMarket,
  "central-bank": STR.subCentralBank,
  energy: STR.subEnergy,
  wscn: STR.subWscn,
};

/**
 * Per-source item caps in the raw display, keyed by "category:subcategory".
 * Each source inside the subcategory shows up to N items. Missing keys = no cap.
 *
 * Default 20 across all L3-tabbed subcategories keeps each tab a single
 * comfortable scroll instead of 25-30 items. Merged subgroups (blog-weekly,
 * finance:news, politics:world) ignore this — they use MERGED_SUBGROUP_LIMITS.
 */
const SOURCE_DISPLAY_LIMITS: Record<string, number> = {
  "tech:github-trending": 20,
  "tech:cn-community": 10,
  "tech:x-viral": 20,
  "tech:trending-papers": 20,
};

/**
 * Sources whose fetcher returns items already sorted by an engagement/heat
 * algorithm we want to preserve. groupRaw skips its default date-desc sort
 * for these so the final render reflects the source's own ranking.
 */
const PRESERVE_FETCH_ORDER_SOURCES = new Set([
  "attentionvc-ai",
  "huggingface-papers",
]);

function displayLimitFor(
  category: Category,
  subId: string | undefined,
): number | undefined {
  if (!subId) return undefined;
  return SOURCE_DISPLAY_LIMITS[`${category}:${subId}`];
}

/**
 * Subcategories that should collapse their sources into a single flat
 * time-sorted list (no L3 source tabs), keyed by "category:subcategory".
 * Value = number of items kept after merging. Each rendered article
 * will display its `source` label inline since the per-source tab row
 * is suppressed.
 *
 * Used when:
 *  - sources are heterogeneous but each publishes few items (blog-weekly)
 *  - the user explicitly wants a curated time-sorted feed rather than
 *    per-source browsing (finance:news, only authoritative sources)
 *
 * Exported so daily.ts can read the cap to keep enrichment in sync.
 */
export const MERGED_SUBGROUP_LIMITS: Record<string, number> = {
  "tech:semis": 12,
  "tech:ai-news": 10,
  "tech:tw-tech": 12,
  "finance:tw-market": 15,
  "finance:news": 15,
  "finance:wscn": 15,
  "finance:central-bank": 10,
  "finance:energy": 10,
  "politics:world": 12,
};

/**
 * Politics sources (especially Al Jazeera / BBC / The Diplomat) regularly
 * mix in World Cup / Olympic / football coverage. Filter at the title level
 * so the merged "国际要闻" stream stays politics-only.
 *
 * Pattern is intentionally specific — avoid generic words like "team" or
 * "match" that overlap with diplomacy headlines.
 */
const POLITICS_SPORTS_RE =
  /\b(World\s*Cup|Olympics?|UEFA|FIFA|NBA|NFL|NHL|MLB|ATP|WTA|Premier\s*League|Bundesliga|La\s*Liga|Serie\s*A|Champions\s*League|Eurovision|Wimbledon|Grand\s*Slam|F1|Formula\s*1|Ronaldo|Messi|Mbappe|Beckham|Lukaku|Mitoma|sportsman|footballer|squad)\b|世界杯|奥运|残奥|冬奥|欧冠|英超|西甲|意甲|德甲|网球|足球|篮球|高尔夫|棒球|板球|橄榄球|世界盃|奧運|帕運|冬奧|歐冠|網球|籃球|高爾夫|橄欖球|中職|職棒|經典賽|世界12強/i;

export function isSportsArticle(title: string): boolean {
  return POLITICS_SPORTS_RE.test(title);
}

function mergedLimitFor(
  category: Category,
  subId: string,
): number | undefined {
  return MERGED_SUBGROUP_LIMITS[`${category}:${subId}`];
}

// ----- grouping -----

export function groupRaw(
  articles: ArticleInput[],
  registry: SourceDef[],
): RawByCategory {
  const subcatOf = new Map<string, string | undefined>();
  for (const s of registry) subcatOf.set(s.id, s.subcategory);
  // Drop articles from sources that have since been disabled — important
  // when scripts/render.ts re-renders against a stale sidecar that still
  // contains the disabled sources' fetched data.
  const enabledIds = new Set(
    registry.filter((s) => s.enabled !== false).map((s) => s.id),
  );

  type Bucket = { sourceName: string; items: ArticleInput[] };
  const buckets: Record<Category, Map<string, Bucket>> = {
    tech: new Map(),
    finance: new Map(),
    politics: new Map(),
  };
  // Pre-seed empty buckets for every enabled source so per-source-tabbed
  // subcategories (e.g. cn-community) still render a tab for sources that
  // returned 0 items today. Without this, a transient LinuxDo Cloudflare
  // block would silently collapse the L3 tab nav, making users wonder
  // whether the other forum even exists.
  for (const s of registry) {
    if (s.enabled === false) continue;
    if (!buckets[s.category].has(s.id)) {
      buckets[s.category].set(s.id, { sourceName: s.name, items: [] });
    }
  }

  for (const a of articles) {
    if (!enabledIds.has(a.sourceId)) continue;
    if (a.category === "politics" && isSportsArticle(a.title)) continue;
    if (
      (a.sourceId === "v2ex-hot" || a.sourceId === "linuxdo") &&
      V2EX_OFF_TOPIC_RE.test(a.title)
    )
      continue;
    const map = buckets[a.category];
    let b = map.get(a.sourceId);
    if (!b) {
      b = { sourceName: a.source, items: [] };
      map.set(a.sourceId, b);
    }
    b.items.push(a);
  }

  for (const cat of Object.keys(buckets) as Category[]) {
    for (const [id, b] of buckets[cat].entries()) {
      if (PRESERVE_FETCH_ORDER_SOURCES.has(id)) continue;
      b.items.sort(
        (a, b) =>
          (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
      );
    }
  }

  function toSourceGroup(
    sourceId: string,
    b: Bucket,
    limit: number | undefined,
  ): SourceGroup {
    return {
      sourceId,
      sourceName: b.sourceName,
      items: limit ? b.items.slice(0, limit) : b.items,
    };
  }

  function sortByRegistry(list: SourceGroup[]): SourceGroup[] {
    return [...list].sort((a, b) => {
      const ia = registry.findIndex((s) => s.id === a.sourceId);
      const ib = registry.findIndex((s) => s.id === b.sourceId);
      return ia - ib;
    });
  }

  const out: RawByCategory = { tech: [], finance: [], politics: [] };

  for (const cat of Object.keys(buckets) as Category[]) {
    const order = SUBCATEGORY_ORDER[cat];
    if (!order) {
      // Flat: one synthetic subgroup with every source.
      const sources: SourceGroup[] = [];
      for (const [id, b] of buckets[cat].entries()) {
        sources.push(toSourceGroup(id, b, undefined));
      }
      out[cat] = sources.length
        ? [{ id: "all", name: CATEGORY_LABELS[cat], sources: sortByRegistry(sources) }]
        : [];
      continue;
    }
    // Subcategory split: bucket each source under its registered subcategory.
    const subs: SubGroup[] = [];
    for (const subId of order) {
      const mergeLimit = mergedLimitFor(cat, subId);
      if (mergeLimit !== undefined) {
        // Merge: flatten all sources under this subcategory into a single
        // time-sorted SourceGroup. Articles keep their `source` field so
        // the renderer can label them.
        const flat: ArticleInput[] = [];
        for (const [id, b] of buckets[cat].entries()) {
          if (subcatOf.get(id) === subId) flat.push(...b.items);
        }
        if (flat.length === 0) continue;
        flat.sort(
          (a, b) =>
            (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
        );
        subs.push({
          id: subId,
          name: SUBCATEGORY_LABELS[subId] ?? subId,
          sources: [
            {
              sourceId: "_merged",
              sourceName: SUBCATEGORY_LABELS[subId] ?? subId,
              items: flat.slice(0, mergeLimit),
              merged: true,
            },
          ],
        });
        continue;
      }

      const limit = displayLimitFor(cat, subId);
      const sources: SourceGroup[] = [];
      for (const [id, b] of buckets[cat].entries()) {
        if (subcatOf.get(id) === subId) sources.push(toSourceGroup(id, b, limit));
      }
      if (sources.length === 0) continue;
      subs.push({
        id: subId,
        name: SUBCATEGORY_LABELS[subId] ?? subId,
        sources: sortByRegistry(sources),
      });
    }
    out[cat] = subs;
  }

  return out;
}

// ----- HTML helpers -----

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(d: Date | undefined): string {
  if (!d) return "";
  try {
    // zh: "05/20 16:00"  · en: "May 20, 4:00 PM" → keep 24h en-GB style "20/05 16:00"
    const localeTag = REPORT_LOCALE === "en" ? "en-GB" : "zh-TW";
    return d.toLocaleString(localeTag, {
      timeZone: getReportTz(),
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

// ----- raw article renderers -----

function renderArticleHtml(a: ArticleInput, showSource = false): string {
  const title = escapeHtml(a.title);
  const url = escapeHtml(a.url);
  const excerpt = a.excerpt ? escapeHtml(a.excerpt) : "";
  // Backwards-compat: old sidecar JSON files may carry `cnSummary` instead.
  const summaryText = a.summary ?? (a as unknown as { cnSummary?: string }).cnSummary;
  const summary = summaryText ? escapeHtml(summaryText) : "";
  const meta = a.meta ? escapeHtml(a.meta) : "";
  const time = formatDate(a.publishedAt);
  const sourceLabel = showSource && a.source ? escapeHtml(a.source) : "";
  const metaLine = [sourceLabel, time].filter(Boolean).join(" · ");
  // News-style summary label for finance/politics, project-intro style for GH/tech.
  const newsy = a.category === "finance" || a.category === "politics";
  const summaryLabel = newsy ? STR.summaryLabelNews : STR.summaryLabelIntro;
  return `<article class="article">
  <h3 class="article-title"><a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a></h3>
  ${meta ? `<p class="article-stats">${meta}</p>` : ""}
  ${metaLine ? `<p class="article-meta">${metaLine}</p>` : ""}
  ${excerpt ? `<p class="article-excerpt">${excerpt}</p>` : ""}
  ${summary ? `<p class="article-summary"><span class="summary-label">${summaryLabel}</span> ${summary}</p>` : ""}
</article>`;
}

function renderSourceContent(
  category: Category,
  subId: string,
  source: SourceGroup,
  isActive: boolean,
): string {
  const showSource = source.merged === true;
  return `<div class="source-content${isActive ? " active" : ""}" data-source-content="${escapeHtml(source.sourceId)}" data-sub="${escapeHtml(subId)}" data-cat="${category}">
    ${source.items.length === 0 ? `<p class="empty">${STR.emptySource}</p>` : source.items.map((a) => renderArticleHtml(a, showSource)).join("\n")}
  </div>`;
}

function renderSourceTabs(
  category: Category,
  subId: string,
  sources: SourceGroup[],
): string {
  // Single-source L2s (X 推文 / GitHub Trending) skip the L3 row — the L2 tab
  // label already identifies the dataset. L3 only earns its row when there
  // are ≥2 sources to switch between (e.g. 社区讨论 V2EX vs LinuxDo).
  if (sources.length < 2) return "";
  return `<nav class="source-tabs">${sources
    .map(
      (s, i) =>
        `<button class="source-tab${i === 0 ? " active" : ""}" data-source="${escapeHtml(s.sourceId)}" data-sub="${escapeHtml(subId)}" data-cat="${category}">${escapeHtml(s.sourceName)}<span class="count">${s.items.length}</span></button>`,
    )
    .join("")}</nav>`;
}

function renderSubContent(category: Category, sub: SubGroup, isActive: boolean): string {
  return `<div class="sub-content${isActive ? " active" : ""}" data-sub-content="${escapeHtml(sub.id)}" data-cat="${category}">
    ${renderSourceTabs(category, sub.id, sub.sources)}
    <div class="source-contents">
      ${sub.sources.map((s, i) => renderSourceContent(category, sub.id, s, i === 0)).join("\n")}
    </div>
  </div>`;
}

function renderRawCategoryPanel(
  category: Category,
  subs: SubGroup[],
): string {
  if (subs.length === 0) {
    return `<p class="empty">${STR.emptyCategory}</p>`;
  }
  if (subs.length === 1) {
    return renderSubContent(category, subs[0], true);
  }
  const subTabs = subs
    .map((s, i) => {
      const count = s.sources.reduce((n, src) => n + src.items.length, 0);
      return `<button class="sub-tab${i === 0 ? " active" : ""}" data-sub="${escapeHtml(s.id)}" data-cat="${category}">${escapeHtml(s.name)}<span class="count">${count}</span></button>`;
    })
    .join("");
  const panels = subs
    .map((s, i) => renderSubContent(category, s, i === 0))
    .join("\n");
  return `<nav class="sub-tabs">${subTabs}</nav>\n<div class="sub-contents">${panels}</div>`;
}

// ----- top-level renderer -----

export function renderHtml(
  report: DailyReport,
  raw: RawByCategory,
  date: string,
): string {
  const trading = report.trading;

  // Split tech raw subgroups: "tech" L1 panel (github-trending + ai-news)
  // vs. "community" L1 panel (cn-community). Keeps the registry simple
  // (V2EX/LinuxDo still live under category=tech) while exposing the
  // forums as their own top-level tab per UX preference.
  const techMainSubs = raw.tech.filter((s) => TECH_MAIN_SUBS.has(s.id));
  const techCommunitySubs = raw.tech.filter((s) => TECH_COMMUNITY_SUBS.has(s.id));

  const sumItems = (subs: SubGroup[]) =>
    subs.reduce(
      (n, sg) => n + sg.sources.reduce((m, s) => m + s.items.length, 0),
      0,
    );
  const counts = {
    tech: sumItems(techMainSubs),
    finance: sumItems(raw.finance),
    politics: sumItems(raw.politics),
    community: sumItems(techCommunitySubs),
  };

  return `<!doctype html>
<html lang="${REPORT_LOCALE === "en" ? "en" : "zh-Hant-TW"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${STR.siteTitle} · ${date}</title>
<style>
  :root {
    --bg: #fafaf9;
    --bg-elevated: #ffffff;
    --fg: #18181b;
    --fg-soft: #3f3f46;
    --muted: #71717a;
    --rule: #e4e4e7;
    --card: #f4f4f5;
    --link: #1d4ed8;
    --accent: #18181b;
    --accent-fg: #fafaf9;
    --rank-high-bg: #fee2e2;
    --rank-high-fg: #991b1b;
    --rank-mid-bg: #fef3c7;
    --rank-mid-fg: #92400e;
    --rank-low-bg: #e0e7ff;
    --rank-low-fg: #3730a3;
    --hero-grad-from: #fafaf9;
    --hero-grad-to: #f4f4f5;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0a0a0a;
      --bg-elevated: #18181b;
      --fg: #fafafa;
      --fg-soft: #d4d4d8;
      --muted: #a1a1aa;
      --rule: #27272a;
      --card: #18181b;
      --link: #93c5fd;
      --accent: #fafafa;
      --accent-fg: #0a0a0a;
      --rank-high-bg: rgba(239,68,68,0.18);
      --rank-high-fg: #fca5a5;
      --rank-mid-bg: rgba(245,158,11,0.18);
      --rank-mid-fg: #fcd34d;
      --rank-low-bg: rgba(99,102,241,0.18);
      --rank-low-fg: #a5b4fc;
      --hero-grad-from: #18181b;
      --hero-grad-to: #0a0a0a;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
      "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", "Heiti TC", sans-serif;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  main { max-width: 960px; margin: 0 auto; padding: 2.5rem 1.5rem 4rem; }

  /* ===== header ===== */
  header.report-header { margin-bottom: 1.25rem; }
  .eyebrow {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: var(--muted);
    font-weight: 500;
  }
  h1.report-title {
    font-size: 2.2rem;
    font-weight: 700;
    margin: 0.4rem 0 1.2rem;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  .archive-link {
    display: inline-block;
    margin-bottom: 1rem;
    font-size: 0.85rem;
    color: var(--muted);
    text-decoration: none;
    border-bottom: 1px dashed var(--rule);
    padding-bottom: 1px;
  }
  .archive-link:hover { color: var(--accent); border-bottom-style: solid; }
  .hero-card {
    background: linear-gradient(135deg, var(--hero-grad-from) 0%, var(--hero-grad-to) 100%);
    border: 1px solid var(--rule);
    border-left: 4px solid var(--accent);
    padding: 1rem 1.4rem;
    border-radius: 0.6rem;
  }
  .hero-eyebrow {
    font-size: 0.7rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 500;
  }
  .hero-headline {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0.35rem 0 0;
    line-height: 1.45;
    color: var(--fg);
  }
  .overview-card {
    margin: 0.7rem 0 0;
    padding: 0.7rem 1.1rem;
    background: var(--card);
    border-radius: 0.5rem;
    border-left: 3px solid var(--muted);
  }
  .overview-card .eyebrow { display: block; margin-bottom: 0.3rem; }
  .overview-text {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.65;
    color: var(--fg-soft);
  }

  /* ===== primary tabs ===== */
  .tabs {
    display: flex;
    gap: 0.25rem;
    margin: 1.25rem 0 0.75rem;
    border-bottom: 1px solid var(--rule);
    flex-wrap: wrap;
  }
  .tab {
    background: none;
    border: none;
    padding: 0.7rem 1.1rem;
    font-size: 0.95rem;
    font-weight: 500;
    color: var(--muted);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    font-family: inherit;
    transition: color 0.15s;
  }
  .tab:hover { color: var(--fg); }
  .tab.active {
    color: var(--fg);
    border-bottom-color: var(--accent);
  }
  .tab .count {
    font-size: 0.72rem;
    color: var(--muted);
    margin-left: 0.4rem;
    font-weight: 400;
  }
  .panel { display: none; }
  .panel.active { display: block; }

  /* ===== digest (AI 简报) — compact ===== */
  .digest-category { margin-bottom: 1.1rem; }
  .category-header {
    display: flex;
    align-items: baseline;
    gap: 0.55rem;
    margin: 0 0 0.55rem;
    padding-bottom: 0.35rem;
    border-bottom: 1px solid var(--rule);
  }
  .category-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--fg);
    margin: 0;
    letter-spacing: 0.05em;
  }
  .category-count {
    font-size: 0.7rem;
    color: var(--muted);
    background: var(--card);
    padding: 0.12rem 0.45rem;
    border-radius: 999px;
  }
  .brief-list {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }
  @media (min-width: 720px) {
    .brief-list { grid-template-columns: 1fr 1fr; }
  }
  .brief {
    background: var(--bg-elevated);
    border: 1px solid var(--rule);
    border-radius: 0.5rem;
    padding: 0.7rem 0.95rem;
    transition: border-color 0.15s, transform 0.15s;
  }
  .brief:hover {
    border-color: var(--muted);
    transform: translateY(-1px);
  }
  .brief-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    margin-bottom: 0.3rem;
  }
  .brief-source {
    font-size: 0.72rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 500;
  }
  .brief-rank {
    font-size: 0.7rem;
    padding: 0.12rem 0.5rem;
    border-radius: 999px;
    font-weight: 600;
    flex-shrink: 0;
  }
  .brief-rank.high { background: var(--rank-high-bg); color: var(--rank-high-fg); }
  .brief-rank.mid  { background: var(--rank-mid-bg);  color: var(--rank-mid-fg); }
  .brief-rank.low  { background: var(--rank-low-bg);  color: var(--rank-low-fg); }
  .brief-title {
    font-size: 0.98rem;
    font-weight: 600;
    margin: 0 0 0.3rem;
    line-height: 1.35;
  }
  .brief-title a { color: var(--fg); text-decoration: none; }
  .brief-title a:hover { color: var(--link); text-decoration: underline; }
  .brief-summary {
    margin: 0;
    color: var(--fg-soft);
    font-size: 0.86rem;
    line-height: 1.55;
  }

  .editor-card {
    background: var(--card);
    border-left: 3px solid var(--muted);
    border-radius: 0.5rem;
    padding: 1rem 1.3rem;
    margin: 1.5rem 0 1.2rem;
  }
  .editor-card .eyebrow { display: block; margin-bottom: 0.4rem; }
  .editor-text {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.7;
    color: var(--fg);
  }
  .keywords { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0 0 1.5rem; }
  .keyword {
    background: var(--card);
    color: var(--fg-soft);
    padding: 0.25rem 0.7rem;
    border-radius: 999px;
    font-size: 0.8rem;
  }

  /* ===== L2 sub-tabs ===== */
  .sub-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 1rem 0;
  }
  .sub-tab {
    background: var(--card);
    border: 1px solid transparent;
    padding: 0.5rem 1.05rem;
    border-radius: 0.5rem;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--fg-soft);
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
  }
  .sub-tab:hover { border-color: var(--muted); color: var(--fg); }
  .sub-tab.active {
    background: var(--accent);
    color: var(--accent-fg);
  }
  .sub-tab .count {
    font-size: 0.7rem;
    opacity: 0.75;
    margin-left: 0.4rem;
    font-weight: 400;
  }
  .sub-content { display: none; }
  .sub-content.active { display: block; }

  /* ===== L3 source-tabs ===== */
  .source-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: 0.9rem 0 1.3rem;
    padding-bottom: 0.7rem;
    border-bottom: 1px solid var(--rule);
  }
  .source-tab {
    background: none;
    border: 1px solid var(--rule);
    padding: 0.35rem 0.85rem;
    border-radius: 999px;
    font-size: 0.83rem;
    color: var(--fg-soft);
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
  }
  .source-tab:hover { border-color: var(--muted); color: var(--fg); }
  .source-tab.active {
    background: var(--fg);
    color: var(--bg);
    border-color: var(--fg);
  }
  .source-tab .count {
    font-size: 0.7rem;
    opacity: 0.75;
    margin-left: 0.3rem;
  }
  .source-content { display: none; }
  .source-content.active { display: block; }

  /* ===== article cards in raw panels ===== */
  .article {
    padding: 1rem 0;
    border-bottom: 1px solid var(--rule);
  }
  .article:first-child { padding-top: 0; }
  .article:last-child { border-bottom: none; }
  .article-title {
    font-size: 1rem;
    margin: 0 0 0.3rem;
    font-weight: 500;
    line-height: 1.45;
  }
  .article-title a { color: var(--fg); text-decoration: none; }
  .article-title a:hover { color: var(--link); text-decoration: underline; }
  .article-meta { color: var(--muted); font-size: 0.76rem; margin: 0 0 0.35rem; }
  .article-stats {
    color: var(--muted);
    font-size: 0.8rem;
    margin: 0 0 0.4rem;
    font-feature-settings: "tnum";
  }
  .article-excerpt {
    margin: 0;
    color: var(--fg-soft);
    font-size: 0.9rem;
    line-height: 1.6;
  }
  .article-summary {
    margin: 0.55rem 0 0;
    padding: 0.6rem 0.85rem;
    background: var(--card);
    border-left: 2px solid var(--link);
    border-radius: 0.3rem;
    font-size: 0.9rem;
    line-height: 1.6;
    color: var(--fg);
  }
  .summary-label {
    display: inline-block;
    font-size: 0.68rem;
    color: var(--link);
    margin-right: 0.4rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .empty {
    color: var(--muted);
    text-align: center;
    padding: 2rem 0;
    font-size: 0.9rem;
  }

  /* ===== trading panel ===== */
  .crypto-widgets {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.55rem;
    margin: 0.4rem 0 1.2rem;
  }
  @media (min-width: 720px) {
    .crypto-widgets { grid-template-columns: repeat(4, 1fr); }
  }
  .crypto-widget {
    background: var(--bg-elevated);
    border: 1px solid var(--rule);
    border-radius: 0.5rem;
    padding: 0.7rem 0.85rem;
    text-align: center;
  }
  .widget-label {
    font-size: 0.7rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 0.3rem;
  }
  .widget-value {
    font-size: 1.5rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--fg);
    line-height: 1.1;
  }
  .widget-sub {
    font-size: 0.78rem;
    color: var(--muted);
    margin-top: 0.25rem;
  }
  .widget-sub.positive { color: #dc2626; }
  .widget-sub.negative { color: #16a34a; }
  @media (prefers-color-scheme: dark) {
    .widget-sub.positive { color: #fca5a5; }
    .widget-sub.negative { color: #4ade80; }
  }
  .crypto-widget.fg-fear-extreme { border-left: 4px solid #b91c1c; }
  .crypto-widget.fg-fear-extreme .widget-value { color: #b91c1c; }
  .crypto-widget.fg-fear { border-left: 4px solid #d97706; }
  .crypto-widget.fg-fear .widget-value { color: #d97706; }
  .crypto-widget.fg-neutral { border-left: 4px solid var(--muted); }
  .crypto-widget.fg-greed { border-left: 4px solid #65a30d; }
  .crypto-widget.fg-greed .widget-value { color: #65a30d; }
  .crypto-widget.fg-greed-extreme { border-left: 4px solid #dc2626; }
  .crypto-widget.fg-greed-extreme .widget-value { color: #dc2626; }
  @media (prefers-color-scheme: dark) {
    .crypto-widget.fg-fear-extreme .widget-value,
    .crypto-widget.fg-fear .widget-value { color: #4ade80; }
    .crypto-widget.fg-greed .widget-value,
    .crypto-widget.fg-greed-extreme .widget-value { color: #fca5a5; }
  }

  .trading-overview-card {
    margin: 0 0 1.5rem;
    padding: 1rem 1.3rem;
    background: var(--card);
    border-radius: 0.5rem;
    border-left: 3px solid var(--accent);
  }
  .trading-overview-card .eyebrow { display: block; margin-bottom: 0.4rem; }
  .trading-overview-text { font-size: 0.92rem; line-height: 1.75; color: var(--fg-soft); margin: 0; }

  .trading-section-title {
    font-size: 0.95rem;
    font-weight: 600;
    margin: 1.5rem 0 0.8rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid var(--rule);
    color: var(--fg);
    letter-spacing: 0.05em;
  }

  /* picks (Sonnet's watchlist) */
  .trading-picks {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.6rem;
  }
  @media (min-width: 720px) {
    .trading-picks { grid-template-columns: 1fr 1fr; }
  }
  .trading-pick {
    background: var(--bg-elevated);
    border: 1px solid var(--rule);
    border-left: 4px solid var(--muted);
    border-radius: 0.5rem;
    padding: 0.8rem 1rem;
  }
  .trading-pick.stance-bull { border-left-color: #dc2626; }
  .trading-pick.stance-bear { border-left-color: #16a34a; }
  .trading-pick.stance-neutral { border-left-color: var(--muted); }
  .pick-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    margin-bottom: 0.45rem;
  }
  .pick-symbol-block {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .pick-symbol { font-weight: 700; font-size: 1rem; color: var(--fg); }
  .pick-name { color: var(--muted); font-size: 0.82rem; }
  .pick-stance {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    white-space: nowrap;
  }
  .pick-stance-bull { background: rgba(220,38,38,0.12); color: #dc2626; }
  .pick-stance-bear { background: rgba(22,163,74,0.12); color: #16a34a; }
  .pick-stance-neutral { background: var(--card); color: var(--muted); }
  .pick-rationale { margin: 0; font-size: 0.88rem; line-height: 1.65; color: var(--fg-soft); }

  /* asset-group tabs */
  .trading-group-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0.6rem 0 1.2rem;
  }
  .trading-group-tab {
    background: var(--card);
    border: 1px solid transparent;
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.88rem;
    font-weight: 500;
    color: var(--fg-soft);
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
  }
  .trading-group-tab:hover { border-color: var(--muted); color: var(--fg); }
  .trading-group-tab.active {
    background: var(--accent);
    color: var(--accent-fg);
  }
  .trading-group-tab .count {
    font-size: 0.7rem;
    opacity: 0.75;
    margin-left: 0.4rem;
    font-weight: 400;
  }
  .trading-group-content { display: none; }
  .trading-group-content.active { display: block; }

  /* ticker cards */
  .ticker-card {
    background: var(--bg-elevated);
    border: 1px solid var(--rule);
    border-radius: 0.55rem;
    padding: 0.85rem 1.1rem;
    margin-bottom: 0.7rem;
  }
  .ticker-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.65rem;
  }
  .ticker-id { min-width: 0; }
  .ticker-symbol { margin: 0; font-size: 1rem; font-weight: 700; font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; }
  .ticker-name { margin: 0.15rem 0 0; font-size: 0.82rem; color: var(--muted); }
  .ticker-price-block { text-align: right; flex-shrink: 0; }
  .ticker-price { display: block; font-size: 1.05rem; font-weight: 600; font-variant-numeric: tabular-nums; }
  .ticker-pct { display: inline-block; font-size: 0.82rem; font-weight: 500; margin-top: 0.15rem; font-variant-numeric: tabular-nums; }
  .ticker-pct.positive, .positive { color: #dc2626; }
  .ticker-pct.negative, .negative { color: #16a34a; }

  .ticker-indicators {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.35rem 0.9rem;
    margin: 0;
    font-size: 0.82rem;
    color: var(--fg-soft);
  }
  @media (min-width: 720px) {
    .ticker-indicators { grid-template-columns: repeat(3, 1fr); }
  }
  .ticker-indicators > div { display: flex; gap: 0.4rem; align-items: baseline; min-width: 0; }
  .ticker-indicators dt { color: var(--muted); font-size: 0.74rem; margin: 0; white-space: nowrap; }
  .ticker-indicators dd { margin: 0; font-variant-numeric: tabular-nums; font-weight: 500; color: var(--fg); }
  .trend-bullish { color: #dc2626; }
  .trend-bearish { color: #16a34a; }
  .trend-neutral { color: var(--muted); }
  .rsi-overbought { color: #d97706; }
  .rsi-oversold { color: #2563eb; }

  .ticker-signals {
    margin-top: 0.65rem;
    padding-top: 0.55rem;
    border-top: 1px dashed var(--rule);
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .signal-pill {
    font-size: 0.72rem;
    padding: 0.18rem 0.55rem;
    border-radius: 999px;
    font-weight: 500;
  }
  .signal-pill.tone-bull { background: rgba(220,38,38,0.13); color: #991b1b; }
  .signal-pill.tone-bear { background: rgba(22,163,74,0.13); color: #166534; }
  .signal-pill.tone-caution { background: rgba(217,119,6,0.15); color: #92400e; }
  @media (prefers-color-scheme: dark) {
    .signal-pill.tone-bull { color: #fca5a5; }
    .signal-pill.tone-bear { color: #4ade80; }
    .signal-pill.tone-caution { color: #fcd34d; }
    .trend-bullish, .positive, .ticker-pct.positive { color: #fca5a5; }
    .trend-bearish, .negative, .ticker-pct.negative { color: #4ade80; }
    .rsi-overbought { color: #fcd34d; }
    .rsi-oversold { color: #93c5fd; }
    .trading-pick.stance-bull { border-left-color: #fca5a5; }
    .trading-pick.stance-bear { border-left-color: #4ade80; }
    .pick-stance-bull { background: rgba(252,165,165,0.15); color: #fca5a5; }
    .pick-stance-bear { background: rgba(74,222,128,0.15); color: #4ade80; }
  }
  .signal-age { opacity: 0.7; font-weight: 400; }

  .trading-risk {
    margin: 1.5rem 0 0;
    padding: 0.9rem 1.2rem;
    background: var(--card);
    border-radius: 0.45rem;
    border-left: 3px solid #d97706;
  }
  .trading-risk .eyebrow { display: block; margin-bottom: 0.35rem; }
  .trading-risk p { margin: 0; font-size: 0.82rem; line-height: 1.65; color: var(--fg-soft); }

  .snapshot-card {
    margin: 0.9rem 0 1.4rem;
    padding: 0.8rem 1.1rem 0.6rem;
    background: var(--bg-elevated);
    border: 1px solid var(--rule);
    border-radius: 0.5rem;
  }
  .snapshot-card .eyebrow { display: block; margin-bottom: 0.4rem; }
  .snapshot-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  .snapshot-table th {
    text-align: right; font-weight: 500; color: var(--muted);
    font-size: 0.75rem; padding: 0.25rem 0.4rem; border-bottom: 1px solid var(--rule);
  }
  .snapshot-table th:first-child { text-align: left; }
  .snapshot-table td { padding: 0.32rem 0.4rem; border-bottom: 1px solid var(--rule); }
  .snapshot-table tr:last-child td { border-bottom: none; }
  .snap-name { color: var(--fg); }
  .snap-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .snapshot-note { margin: 0.45rem 0 0; font-size: 0.72rem; color: var(--muted); }
  .digest-category { margin-top: 1.2rem; }
  .margin-stats {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.6rem; margin: 0.2rem 0 0.8rem;
  }
  @media (max-width: 520px) { .margin-stats { grid-template-columns: repeat(2, 1fr); } }
  .margin-stats > div { background: var(--card); border-radius: 0.4rem; padding: 0.5rem 0.7rem; }
  .margin-stats .widget-value { font-size: 1.05rem; font-weight: 600; font-variant-numeric: tabular-nums; }
  .margin-stats .widget-label { font-size: 0.72rem; color: var(--muted); }
  .margin-stats .widget-sub { font-size: 0.78rem; font-variant-numeric: tabular-nums; }
  .margin-code { color: var(--muted); font-size: 0.75rem; }
  .margin-sub { font-size: 0.78rem; color: var(--muted); font-weight: 600; margin: 0.9rem 0 0.3rem; }
  .margin-scroll { overflow-x: auto; }
  .margin-link { margin: 0.8rem 0 0.2rem; font-size: 0.85rem; }
  .margin-link a { color: #2563eb; text-decoration: none; font-weight: 600; }
  .margin-link a:hover { text-decoration: underline; }
  .margin-scroll .snapshot-table { min-width: 560px; }
  @media (max-width: 520px) {
    .snapshot-table { font-size: 0.8rem; }
    .snapshot-table td, .snapshot-table th { padding: 0.28rem 0.25rem; }
  }

  footer {
    margin-top: 2.5rem;
    border-top: 1px solid var(--rule);
    padding-top: 1.1rem;
    color: var(--muted);
    font-size: 0.82rem;
  }
</style>
</head>
<body>
<main>
  <header class="report-header">
    <span class="eyebrow">${STR.siteTitle}</span>
    <h1 class="report-title">${date}</h1>
    ${process.env.WEB_MODE === "true" ? `<a class="archive-link" href="../archive.html">${STR.archiveLink}</a>` : ""}
  </header>

  <nav class="tabs" role="tablist">
    <button class="tab active" data-tab="digest">${STR.catDigest}</button>
    ${trading ? `<button class="tab" data-tab="trading">${STR.catTrading}<span class="count">${trading.tickers.length}</span></button>` : ""}
    <button class="tab" data-tab="finance">${CATEGORY_LABELS.finance}<span class="count">${counts.finance}</span></button>
    <button class="tab" data-tab="tech">${CATEGORY_LABELS.tech}<span class="count">${counts.tech}</span></button>
    <button class="tab" data-tab="politics">${CATEGORY_LABELS.politics}<span class="count">${counts.politics}</span></button>
    ${techCommunitySubs.length > 0 ? `<button class="tab" data-tab="community">${STR.catCommunity}<span class="count">${counts.community}</span></button>` : ""}
  </nav>

  <section class="panel active" data-panel="digest">
    ${renderDigestPanel(report)}
  </section>
  ${trading ? `<section class="panel" data-panel="trading">${renderTradingPanel(trading)}</section>` : ""}
  <section class="panel" data-panel="finance">
    ${renderRawCategoryPanel("finance", raw.finance)}
  </section>
  <section class="panel" data-panel="tech">
    ${renderRawCategoryPanel("tech", techMainSubs)}
  </section>
  <section class="panel" data-panel="politics">
    ${renderRawCategoryPanel("politics", raw.politics)}
  </section>
  ${techCommunitySubs.length > 0 ? `<section class="panel" data-panel="community">
    ${renderRawCategoryPanel("tech", techCommunitySubs)}
  </section>` : ""}

  <footer>
    ${STR.footer}
  </footer>
</main>
<script>
  document.querySelectorAll('.tabs > .tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = btn.dataset.tab;
      document.querySelectorAll('.tabs > .tab').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      document.querySelectorAll('.panel').forEach(function (p) {
        p.classList.toggle('active', p.dataset.panel === target);
      });
    });
  });
  // Scope sub-tab / source-tab toggles to the parent .panel so two L1 panels
  // can share the same data-cat (e.g. tech main + community both data-cat=tech)
  // without stomping on each other's active state.
  document.querySelectorAll('.sub-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var panel = btn.closest('.panel');
      if (!panel) return;
      var sub = btn.dataset.sub;
      panel.querySelectorAll('.sub-tab').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      panel.querySelectorAll('.sub-content').forEach(function (p) {
        p.classList.toggle('active', p.dataset.subContent === sub);
      });
    });
  });
  document.querySelectorAll('.source-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var subContent = btn.closest('.sub-content');
      if (!subContent) return;
      var src = btn.dataset.source;
      subContent.querySelectorAll('.source-tab').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      subContent.querySelectorAll('.source-content').forEach(function (p) {
        p.classList.toggle('active', p.dataset.sourceContent === src);
      });
    });
  });
  // Trading panel: asset-group sub-tabs (US/crypto/china/commodity)
  document.querySelectorAll('.trading-group-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var grp = btn.dataset.group;
      document.querySelectorAll('.trading-group-tab').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      document.querySelectorAll('.trading-group-content').forEach(function (p) {
        p.classList.toggle('active', p.dataset.group === grp);
      });
    });
  });
</script>
</body>
</html>`;
}

// ----- trading panel -----

const SIGNAL_TONE: Record<string, "bull" | "bear" | "caution"> = {
  "golden-cross": "bull",
  "macd-bull-cross": "bull",
  "above-sma50-sma200": "bull",
  "near-52w-high": "bull",
  "death-cross": "bear",
  "macd-bear-cross": "bear",
  "below-sma50-sma200": "bear",
  "near-52w-low": "bear",
  "rsi-overbought": "caution",
  "rsi-oversold": "caution",
};

const TREND_LABEL: Record<TickerAnalysis["trend"], string> = {
  bullish: STR.trendBullish,
  bearish: STR.trendBearish,
  neutral: STR.trendNeutral,
};

function stanceClass(stance: string): "bull" | "bear" | "neutral" {
  // Supports both legacy ("看多"/"看空") and current ("偏上行"/"偏下行")
  // stance values. The current values were chosen to avoid Sonnet's
  // "no investment advice" guardrail; rendering keeps both readable.
  if (/多|涨|漲|上行|bull/i.test(stance)) return "bull";
  if (/空|跌|下行|bear/i.test(stance)) return "bear";
  return "neutral";
}

function fmtNum(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  // Use thousand separators only for prices >= 1000
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toFixed(dp).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return n.toFixed(dp);
}

function fmtPct(n: number, dp = 2): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(dp)}%`;
}

function renderPickCard(p: WatchlistPick): string {
  const cls = stanceClass(p.stance);
  const symbol = escapeHtml(p.symbol);
  const name = escapeHtml(p.display_name ?? p.symbol);
  const stance = escapeHtml(p.stance);
  const rationale = escapeHtml(p.rationale ?? "");
  return `<article class="trading-pick stance-${cls}">
    <header class="pick-head">
      <div class="pick-symbol-block">
        <span class="pick-symbol">${symbol}</span>
        <span class="pick-name">${name}</span>
      </div>
      <span class="pick-stance pick-stance-${cls}">${stance}</span>
    </header>
    <p class="pick-rationale">${rationale}</p>
  </article>`;
}

function renderTickerCard(t: TickerAnalysis): string {
  const trendCls = t.trend;
  const priceCls = t.pct1Day >= 0 ? "positive" : "negative";
  const pct5Cls = t.pct5Day >= 0 ? "positive" : "negative";
  const signals = t.signals
    .map((s) => {
      const tone = SIGNAL_TONE[s.type] ?? "caution";
      const ageSuffix =
        s.daysAgo !== undefined
          ? ` <span class="signal-age">(${s.daysAgo === 0 ? STR.signalToday : `${s.daysAgo} ${STR.signalDaysAgoSuffix}`})</span>`
          : "";
      return `<span class="signal-pill tone-${tone}">${escapeHtml(s.label)}${ageSuffix}</span>`;
    })
    .join("");
  const currencyPrefix = currencyPrefixFor(t);
  return `<article class="ticker-card">
    <header class="ticker-head">
      <div class="ticker-id">
        <h3 class="ticker-symbol">${escapeHtml(t.symbol)}</h3>
        <p class="ticker-name">${escapeHtml(t.displayName)}</p>
      </div>
      <div class="ticker-price-block">
        <span class="ticker-price">${currencyPrefix}${fmtNum(t.currentPrice)}</span>
        <span class="ticker-pct ${priceCls}">${fmtPct(t.pct1Day)}</span>
      </div>
    </header>
    <dl class="ticker-indicators">
      <div><dt>${STR.ticker5d}</dt><dd class="${pct5Cls}">${fmtPct(t.pct5Day)}</dd></div>
      <div><dt>${STR.tickerVs52wHigh}</dt><dd>${fmtPct(t.pct52WeekHigh, 1)}</dd></div>
      <div><dt>RSI(14)</dt><dd class="rsi-${t.rsiState}">${fmtNum(t.rsi14, 1)}</dd></div>
      <div><dt>${STR.tickerTrend}</dt><dd class="trend-${trendCls}">${TREND_LABEL[t.trend]}</dd></div>
      <div><dt>SMA 20 / 50 / 200</dt><dd>${fmtNum(t.sma20)} / ${fmtNum(t.sma50)} / ${fmtNum(t.sma200)}</dd></div>
      <div><dt>${STR.tickerMacd}</dt><dd>${fmtNum(t.macd, 3)} / ${fmtNum(t.macdSignal, 3)}</dd></div>
    </dl>
    ${signals ? `<div class="ticker-signals">${signals}</div>` : ""}
  </article>`;
}

function currencyPrefixFor(t: TickerAnalysis): string {
  // Indices, yields, FX pairs and DXY are levels, not prices — no symbol.
  if (t.symbol.startsWith("^") || t.symbol.endsWith("=X") || t.symbol.startsWith("DX-Y")) return "";
  switch (t.currency) {
    case "USD": return "$";
    case "TWD": return "NT$";
    case "HKD": return "HK$";
    case "JPY": return "¥";
    case "EUR": return "€";
    default: return "";
  }
}

function fearGreedTone(value: number): "fear-extreme" | "fear" | "neutral" | "greed" | "greed-extreme" {
  if (value <= 24) return "fear-extreme";
  if (value <= 44) return "fear";
  if (value <= 55) return "neutral";
  if (value <= 74) return "greed";
  return "greed-extreme";
}

function fmtBigUsd(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)} T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)} B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)} M`;
  return `$${n.toFixed(0)}`;
}

function renderCryptoWidgets(t: TradingSection): string {
  const fg = t.crypto_fear_greed;
  const cg = t.crypto_global;
  if (!fg && !cg) return "";
  const items: string[] = [];
  if (fg) {
    const tone = fearGreedTone(fg.value);
    items.push(`<div class="crypto-widget fg-${tone}">
      <div class="widget-label">${STR.widgetCryptoFearGreed}</div>
      <div class="widget-value">${fg.value}</div>
      <div class="widget-sub">${escapeHtml(fg.classificationCn)}</div>
    </div>`);
  }
  if (cg) {
    const tone = cg.marketCapChangePct24h >= 0 ? "positive" : "negative";
    items.push(`<div class="crypto-widget">
      <div class="widget-label">${STR.widgetCryptoCap}</div>
      <div class="widget-value">${fmtBigUsd(cg.totalMarketCapUsd)}</div>
      <div class="widget-sub ${tone}">${fmtPct(cg.marketCapChangePct24h)} / 24h</div>
    </div>`);
    items.push(`<div class="crypto-widget">
      <div class="widget-label">${STR.widgetBtcDom}</div>
      <div class="widget-value">${cg.btcDominance.toFixed(1)}%</div>
      <div class="widget-sub">ETH ${cg.ethDominance.toFixed(1)}%</div>
    </div>`);
    items.push(`<div class="crypto-widget">
      <div class="widget-label">${STR.widgetVolume24h}</div>
      <div class="widget-value">${fmtBigUsd(cg.total24hVolumeUsd)}</div>
      <div class="widget-sub">${STR.widgetActiveCoins} ${cg.activeCryptocurrencies.toLocaleString()}</div>
    </div>`);
  }
  return `<div class="crypto-widgets">${items.join("")}</div>`;
}

function renderTradingPanel(trading: TradingSection): string {
  const tickers = trading.tickers;
  const groupCounts = Object.fromEntries(
    ASSET_GROUP_ORDER.map((g) => [g, 0]),
  ) as Record<AssetGroup, number>;
  for (const t of tickers) groupCounts[t.group as AssetGroup] = (groupCounts[t.group as AssetGroup] ?? 0) + 1;

  const groupTabs = ASSET_GROUP_ORDER.map(
    (g, i) =>
      `<button class="trading-group-tab${i === 0 ? " active" : ""}" data-group="${g}">${escapeHtml(ASSET_GROUP_LABELS_LOCALIZED[g])}<span class="count">${groupCounts[g] ?? 0}</span></button>`,
  ).join("");

  const groupPanels = ASSET_GROUP_ORDER.map((g, i) => {
    const groupTickers = tickers.filter((t) => t.group === g);
    // Crypto sub-tab carries an extra header widget panel (F&G + global stats)
    const cryptoWidgets =
      (g as string) === "crypto" ? renderCryptoWidgets(trading) : "";
    return `<div class="trading-group-content${i === 0 ? " active" : ""}" data-group="${g}">
      ${cryptoWidgets}
      ${groupTickers.length === 0 ? `<p class="empty">${STR.emptyGroup}</p>` : groupTickers.map(renderTickerCard).join("")}
    </div>`;
  }).join("");

  const overview = escapeHtml(trading.market_overview ?? "");
  const risk = escapeHtml(trading.risk_caveat ?? "");

  return `<section class="trading-overview-card">
    <span class="eyebrow">${STR.tradingMarketOverview}</span>
    <p class="overview-text trading-overview-text">${overview}</p>
  </section>

  ${
    trading.watchlist.length > 0
      ? `<section class="trading-watchlist">
    <h2 class="category-title trading-section-title">${STR.tradingTodayFocus}</h2>
    <div class="trading-picks">
      ${trading.watchlist.map(renderPickCard).join("\n")}
    </div>
  </section>`
      : ""
  }

  <section class="trading-tickers">
    <h2 class="category-title trading-section-title">${STR.tradingAllAssets}</h2>
    <nav class="trading-group-tabs">${groupTabs}</nav>
    <div class="trading-group-contents">${groupPanels}</div>
  </section>

  ${
    risk
      ? `<section class="trading-risk">
    <span class="eyebrow">${STR.tradingRiskCaveat}</span>
    <p>${risk}</p>
  </section>`
      : ""
  }`;
}

// ----- digest (今日重點) -----

function rankClass(importance: number): "high" | "mid" | "low" {
  if (importance >= 8) return "high";
  if (importance >= 5) return "mid";
  return "low";
}

function renderBriefCard(b: BriefItem): string {
  const imp = Number.isFinite(b.importance) ? b.importance : 0;
  return `<article class="brief">
    <div class="brief-head">
      <span class="brief-source">${escapeHtml(b.source ?? "")}</span>
      ${imp ? `<span class="brief-rank ${rankClass(imp)}">${STR.mdImportance} ${imp}</span>` : ""}
    </div>
    <h3 class="brief-title"><a href="${escapeHtml(b.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(b.title)}</a></h3>
    <p class="brief-summary">${escapeHtml(b.summary ?? "")}</p>
  </article>`;
}

function renderBriefSection(title: string, briefs: BriefItem[]): string {
  if (!briefs || briefs.length === 0) return "";
  return `<section class="digest-category">
    <header class="category-header">
      <h2 class="category-title">${title}</h2>
      <span class="category-count">${briefs.length}</span>
    </header>
    <div class="brief-list">${briefs.map(renderBriefCard).join("\n")}</div>
  </section>`;
}

function renderSnapshot(trading: TradingSection | undefined): string {
  if (!trading || trading.tickers.length === 0) return "";
  const bySymbol = new Map(trading.tickers.map((t) => [t.symbol, t]));
  const rows = SNAPSHOT_SYMBOLS.map((sym) => bySymbol.get(sym))
    .filter((t): t is TickerAnalysis => t !== undefined)
    .map((t) => {
      const c1 = t.pct1Day >= 0 ? "positive" : "negative";
      const c5 = t.pct5Day >= 0 ? "positive" : "negative";
      return `<tr><td class="snap-name">${escapeHtml(t.displayName)}</td><td class="snap-num">${currencyPrefixFor(t)}${fmtNum(t.currentPrice)}</td><td class="snap-num ${c1}">${fmtPct(t.pct1Day)}</td><td class="snap-num ${c5}">${fmtPct(t.pct5Day)}</td></tr>`;
    });
  if (rows.length === 0) return "";
  return `<section class="snapshot-card">
    <span class="eyebrow">${STR.digestSnapshot}</span>
    <table class="snapshot-table">
      <thead><tr><th>${STR.snapshotName}</th><th>${STR.snapshotLast}</th><th>${STR.snapshot1d}</th><th>${STR.snapshot5d}</th></tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table>
    <p class="snapshot-note">${STR.digestSnapshotNote}</p>
  </section>`;
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
function fmtSignedInt(n: number): string {
  return (n >= 0 ? "+" : "") + fmtInt(n);
}

const WANTGOO_MARGIN_URL = "https://www.wantgoo.com/stock/margin-trading/exclude-etf/taiex";

function renderMargin(m: MarginSnapshot | undefined): string {
  if (!m) return "";
  const yi = (k: number) => (k / 100000).toFixed(2); // 仟元 → 億元
  const yiY = (y: number) => (y / 1e8).toFixed(2); // 元 → 億元
  const cls = (n: number) => (n >= 0 ? "positive" : "negative");
  const signed = (s: string, n: number) => (n >= 0 ? "+" : "") + s;
  const dash = "—";
  const hist = m.history ?? [];
  const last = hist[hist.length - 1];
  const prev = hist[hist.length - 2];
  const amtChg = m.marginAmountChange;

  const stat = (label: string, value: string, sub = "", subCls = "") =>
    `<div><div class="widget-label">${label}</div><div class="widget-value">${value}</div>${sub ? `<div class="widget-sub ${subCls}">${sub}</div>` : ""}</div>`;

  const stats: string[] = [];
  if (m.marginAmount) stats.push(stat(STR.marginAmount, `${yi(m.marginAmount)} 億`, `${signed(yi(amtChg), amtChg)} 億`, cls(amtChg)));
  if (last?.keepRate != null) {
    const d = prev?.keepRate != null ? last.keepRate - prev.keepRate : null;
    stats.push(stat(STR.marginKeepRate, `${last.keepRate.toFixed(2)}%`, d != null ? `${signed(d.toFixed(2), d)}%` : "", d != null ? cls(d) : ""));
  }
  if (last?.callAccounts != null) {
    const d = prev?.callAccounts != null ? last.callAccounts - prev.callAccounts : null;
    stats.push(stat(STR.marginCallAcc, `${fmtInt(last.callAccounts)} 戶`, d != null ? fmtSignedInt(d) : ""));
  }
  if (last?.callAmount != null) stats.push(stat(STR.marginCallAmt, `${yiY(last.callAmount)} 億`));
  if (m.marginUnits) stats.push(stat(STR.marginUnits, fmtInt(m.marginUnits), fmtSignedInt(m.marginUnitsChange), cls(m.marginUnitsChange)));
  if (m.shortUnits) stats.push(stat(STR.marginShort, fmtInt(m.shortUnits), fmtSignedInt(m.shortUnitsChange), cls(m.shortUnitsChange)));
  if (m.marginUnits) stats.push(stat(STR.marginRatio, `${m.shortToMarginRatio.toFixed(2)}%`));

  const histRows = [...hist]
    .reverse()
    .map(
      (d) =>
        `<tr><td class="snap-name">${escapeHtml(d.date.slice(5).replace("-", "/"))}</td>` +
        `<td class="snap-num">${d.indexClose != null ? d.indexClose.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : dash}</td>` +
        `<td class="snap-num ${d.indexPct != null ? cls(d.indexPct) : ""}">${d.indexPct != null ? signed(d.indexPct.toFixed(2), d.indexPct) + "%" : dash}</td>` +
        `<td class="snap-num">${d.marginAmount != null ? yi(d.marginAmount) : dash}</td>` +
        `<td class="snap-num ${d.marginAmountChange != null ? cls(d.marginAmountChange) : ""}">${d.marginAmountChange != null ? signed(yi(d.marginAmountChange), d.marginAmountChange) : dash}</td>` +
        `<td class="snap-num">${d.keepRate != null ? d.keepRate.toFixed(2) + "%" : dash}</td>` +
        `<td class="snap-num">${d.callAccounts != null ? fmtInt(d.callAccounts) : dash}</td>` +
        `<td class="snap-num">${d.callAmount != null ? yiY(d.callAmount) : dash}</td></tr>`,
    )
    .join("");

  const etfRows = m.stocks
    .map(
      (s) =>
        `<tr><td class="snap-name">${escapeHtml(s.name)} <span class="margin-code">${escapeHtml(s.code)}</span></td><td class="snap-num">${fmtInt(s.marginToday)}</td><td class="snap-num ${cls(s.marginChange)}">${fmtSignedInt(s.marginChange)}</td><td class="snap-num">${fmtInt(s.shortToday)}</td><td class="snap-num ${cls(s.shortChange)}">${fmtSignedInt(s.shortChange)}</td></tr>`,
    )
    .join("");

  return `<section class="snapshot-card margin-card">
    <span class="eyebrow">${STR.marginTitle} · ${escapeHtml(m.date)}</span>
    ${stats.length ? `<div class="margin-stats">${stats.join("")}</div>` : ""}
    ${
      histRows
        ? `<div class="margin-sub">${STR.marginHistory}</div>
    <div class="margin-scroll"><table class="snapshot-table">
      <thead><tr><th>${STR.marginDate}</th><th>${STR.marginIndex}</th><th>${STR.marginPct}</th><th>${STR.marginAmtYi}</th><th>${STR.marginAmtChg}</th><th>${STR.marginKeepRate}</th><th>${STR.marginCallAcc}</th><th>${STR.marginCallAmtYi}</th></tr></thead>
      <tbody>${histRows}</tbody>
    </table></div>`
        : ""
    }
    ${
      etfRows
        ? `<div class="margin-sub">${STR.marginEtf}</div>
    <table class="snapshot-table">
      <thead><tr><th>ETF</th><th>${STR.marginUnits}</th><th>${STR.marginChange}</th><th>${STR.marginShort}</th><th>${STR.marginChange}</th></tr></thead>
      <tbody>${etfRows}</tbody>
    </table>`
        : ""
    }
    <p class="margin-link"><a href="${WANTGOO_MARGIN_URL}" target="_blank" rel="noopener">${STR.marginWantgoo}</a></p>
    <p class="snapshot-note">${STR.marginNote}</p>
  </section>`;
}

function renderDigestPanel(report: DailyReport): string {
  const hasDigest =
    !!report.hero_headline ||
    !!report.daily_overview ||
    report.finance_briefs.length + report.tech_briefs.length + report.politics_briefs.length > 0;
  const parts: string[] = [];
  if (report.hero_headline) {
    parts.push(`<section class="hero-card">
      <span class="hero-eyebrow">${STR.digestHeadline}</span>
      <p class="hero-headline">${escapeHtml(report.hero_headline)}</p>
    </section>`);
  }
  if (report.daily_overview) {
    parts.push(`<section class="overview-card">
      <span class="eyebrow">${STR.digestOverview}</span>
      <p class="overview-text">${escapeHtml(report.daily_overview)}</p>
    </section>`);
  }
  parts.push(renderSnapshot(report.trading));
  parts.push(renderMargin(report.margin));
  parts.push(renderBriefSection(STR.digestFinance, report.finance_briefs));
  parts.push(renderBriefSection(STR.digestTech, report.tech_briefs));
  parts.push(renderBriefSection(STR.digestPolitics, report.politics_briefs));
  if (report.editor_note) {
    parts.push(`<section class="editor-card">
      <span class="eyebrow">${STR.digestEditorNote}</span>
      <p class="editor-text">${escapeHtml(report.editor_note)}</p>
    </section>`);
  }
  if (report.keywords && report.keywords.length > 0) {
    parts.push(`<div class="keywords">${report.keywords.map((k) => `<span class="keyword">#${escapeHtml(k)}</span>`).join("")}</div>`);
  }
  if (!hasDigest) parts.unshift(`<p class="empty">${STR.digestEmpty}</p>`);
  return parts.filter(Boolean).join("\n");
}

// ----- markdown -----

function renderBriefMarkdown(b: BriefItem): string {
  const importance = Number.isFinite(b.importance) ? b.importance : 0;
  return `### [${b.title}](${b.url})\n${b.source} · ${STR.mdImportance} ${importance}/10\n\n${b.summary}\n`;
}

function renderSectionMarkdown(title: string, briefs: BriefItem[]): string {
  if (briefs.length === 0) return "";
  return `## ${title}\n\n${briefs.map(renderBriefMarkdown).join("\n")}\n`;
}

export function renderMarkdown(report: DailyReport, date: string): string {
  const blocks: string[] = [];
  blocks.push(`# ${STR.siteTitle} · ${date}\n`);
  if (report.hero_headline) blocks.push(`> ${report.hero_headline}\n`);
  if (report.daily_overview) {
    blocks.push(`## ${STR.mdTodayOverview}\n\n${report.daily_overview}\n`);
  }
  blocks.push(
    renderSectionMarkdown(CATEGORY_DIGEST_LABELS.tech, report.tech_briefs),
  );
  blocks.push(
    renderSectionMarkdown(
      CATEGORY_DIGEST_LABELS.finance,
      report.finance_briefs,
    ),
  );
  blocks.push(
    renderSectionMarkdown(
      CATEGORY_DIGEST_LABELS.politics,
      report.politics_briefs,
    ),
  );
  if (report.editor_note) {
    blocks.push(`## ${STR.mdEditorNote}\n\n${report.editor_note}\n`);
  }
  if (report.keywords.length > 0) {
    blocks.push(
      `## ${STR.mdTodayKeywords}\n\n${report.keywords.map((k) => `\`#${k}\``).join(" ")}\n`,
    );
  }
  return blocks.filter(Boolean).join("\n");
}
