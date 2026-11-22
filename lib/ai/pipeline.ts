import { jsonrepair } from "jsonrepair";
import { LlmIncompleteResponseError } from "./errors";
import { runLlm } from "./llm";
import { extractJson } from "./json-util";
import { SYSTEM_PROMPT_DIGEST_EN, SYSTEM_PROMPT_DIGEST_ZH } from "./prompts";
import { REPORT_LOCALE } from "../sources/registry";
import type { Category, RawArticle } from "../sources/types";

const SYSTEM_PROMPT_DIGEST =
  REPORT_LOCALE === "en" ? SYSTEM_PROMPT_DIGEST_EN : SYSTEM_PROMPT_DIGEST_ZH;

export interface BriefItem {
  title: string;
  url: string;
  source: string;
  summary: string;
  importance: number;
}

export interface DailyReport {
  hero_headline: string;
  daily_overview: string;
  tech_briefs: BriefItem[];
  finance_briefs: BriefItem[];
  politics_briefs: BriefItem[];
  editor_note: string;
  keywords: string[];
  /** Optional trading-signals section, present when scripts/daily.ts ran successfully. */
  trading?: TradingSection;
}

import type { TickerAnalysis } from "../trading/signals";
import type { CryptoGlobalStats } from "../trading/coingecko";
import type { FearGreedSnapshot } from "../trading/fear-greed";
import type { TradingCommentary } from "./trading-commentary";

export interface TradingSection extends TradingCommentary {
  generated_at: string;
  tickers: TickerAnalysis[];
  crypto_fear_greed?: FearGreedSnapshot;
  crypto_global?: CryptoGlobalStats;
}

export interface ArticleInput extends RawArticle {
  source: string;
}

const PER_CATEGORY_LIMIT: Record<Category, number> = {
  tech: 25,
  finance: 40,
  politics: 15,
};

const MAX_AGE_DAYS = 14;

const FALLBACK_BRIEF_LIMIT: Record<Category, number> = {
  tech: 5,
  finance: 6,
  politics: 3,
};

/**
 * Pick `limit` items from `items` so every source gets a fair shot.
 *
 * Why this exists: the previous `slice(0, limit)` honored insertion order,
 * which is the source-iteration order in daily.ts. That gave whichever
 * source came first 100% of the quota — e.g. all 25 tech slots filled by
 * Hacker News before GitHub Trending / Solidot / V2EX / 阮一峰 got a turn.
 *
 * Strategy: drop items older than MAX_AGE_DAYS, group by sourceId,
 * sort each bucket newest-first, then round-robin one item per source
 * until we hit the limit. Sources with fewer items naturally drop out
 * and others absorb the slack.
 */
function selectRoundRobin(
  items: ArticleInput[],
  limit: number,
): ArticleInput[] {
  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
  const fresh = items.filter(
    (it) => !it.publishedAt || it.publishedAt.getTime() >= cutoff,
  );

  const bySource = new Map<string, ArticleInput[]>();
  for (const it of fresh) {
    const arr = bySource.get(it.sourceId) ?? [];
    arr.push(it);
    bySource.set(it.sourceId, arr);
  }
  for (const arr of bySource.values()) {
    arr.sort(
      (a, b) =>
        (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
    );
  }

  const buckets = Array.from(bySource.values());
  const out: ArticleInput[] = [];
  let madeProgress = true;
  while (out.length < limit && madeProgress) {
    madeProgress = false;
    for (const b of buckets) {
      if (b.length === 0) continue;
      out.push(b.shift()!);
      madeProgress = true;
      if (out.length >= limit) break;
    }
  }
  return out;
}

/**
 * Keep the report publishable when both digest-generation attempts return
 * malformed/truncated JSON. The HTML view is driven by the raw article
 * sidecar, while this fallback preserves useful Markdown/JSON brief items
 * using summaries that earlier enrichment stages already produced.
 */
export function buildFallbackDailyReport(
  articles: ArticleInput[],
): DailyReport {
  const grouped: Record<Category, ArticleInput[]> = {
    tech: [],
    finance: [],
    politics: [],
  };
  for (const article of articles) grouped[article.category].push(article);

  const toBriefs = (category: Category): BriefItem[] =>
    selectRoundRobin(
      grouped[category],
      FALLBACK_BRIEF_LIMIT[category],
    ).map((article) => {
      const summary =
        article.summary?.trim() ||
        article.excerpt?.trim() ||
        article.title.trim();
      return {
        title: article.title,
        url: article.url,
        source: article.source,
        summary: summary.slice(0, 400),
        importance: 5,
      };
    });

  return {
    hero_headline: "",
    daily_overview: "",
    tech_briefs: toBriefs("tech"),
    finance_briefs: toBriefs("finance"),
    politics_briefs: toBriefs("politics"),
    editor_note: "",
    keywords: [],
  };
}

function isRecoverableDigestOutputError(error: unknown): boolean {
  return (
    error instanceof SyntaxError ||
    error instanceof LlmIncompleteResponseError
  );
}

async function callOnce(
  userPayloadJson: string,
  marketSnapshot = "",
): Promise<DailyReport> {
  // Claude Code CLI's built-in system prompt biases the model toward
  // conversational markdown output. Anchor the format expectation in the
  // user message (instruction recency wins) *and* explicitly demand every
  // schema field be populated — without this Sonnet has been observed to
  // emit a JSON shell with empty arrays to "satisfy" a JSON-only ask.
  const userPrompt =
    REPORT_LOCALE === "en"
      ? [
          "**Output language: ENGLISH ONLY.** Every string value in the JSON — hero_headline, daily_overview, every brief's title/summary, editor_note, keywords — must be written entirely in English. No Chinese characters anywhere.",
          "",
          "Your task: generate today's daily brief from the candidate news below. **The response MUST be a single valid JSON object** — starts with `{`, ends with `}`, no markdown, no code fences, no explanations.",
          "",
          "The JSON must contain every field non-empty (briefs arrays per the system-prompt counts):",
          "  - hero_headline: 10-25 word headline of the day",
          "  - daily_overview: **150-250 word** paragraph covering tech / finance / politics signals so a reader sees the whole picture at a glance",
          "  - tech_briefs: **3-5** tech BriefItems",
          "  - finance_briefs: **3-5** finance BriefItems",
          "  - politics_briefs: **2-3** politics BriefItems",
          "  - editor_note: 30-60 word editor's note",
          "  - keywords: 5-8 keywords",
          "",
          "BriefItem fields: title, url (copied verbatim from candidate), source, summary, importance (1-10).",
          "**Quote rule (important!)**: For any quotation INSIDE a JSON string, use single quotes ' or curly quotes '\" — **never** raw double quotes \", which break JSON parsing.",
          "No trailing commas.",
          "",
          marketSnapshot ? `Previous-close market data (only cite these numbers):\n${marketSnapshot}\n` : "",
          `Candidate news (JSON array, ${userPayloadJson.length} chars):`,
          userPayloadJson,
        ].join("\n")
      : [
          "**輸出語言：繁體中文（台灣用語）。** JSON 內所有字串都必須是繁體中文，不得出現簡體字。",
          "",
          "你的任務：根據下方的收盤數據與候選新聞，產生今日投資晨報，**回應必須是一個合法 JSON 物件**——以 `{` 開頭，以 `}` 結尾，不要 markdown、不要程式碼框、不要任何解釋。",
          "",
          "JSON 必須包含全部欄位且不能為空（briefs 陣列依 system prompt 規定的條數填入）：",
          "  - hero_headline: 15-30 字的今日頭條",
          "  - daily_overview: **200-300 字** 的晨報總覽，先講收盤數據，再串連重要新聞",
          "  - finance_briefs: **4-6 條** 財經與總經 BriefItem",
          "  - tech_briefs: **3-5 條** AI 與半導體 BriefItem",
          "  - politics_briefs: **2-3 條** 國際與地緣 BriefItem",
          "  - editor_note: 50-90 字的中性觀察",
          "  - keywords: 5-8 個關鍵字",
          "",
          "BriefItem 欄位：title、url（必須從候選條目原樣選取）、source、summary、importance(1-10)。",
          "**引號規則（重要！）**：JSON 字串內的引用請使用全形引號「」，**絕對不要**用英文雙引號 \" —— 那會導致 JSON 解析失敗。例：寫 鮑爾表示「不急於降息」 而不是 鮑爾表示\"不急於降息\"。",
          "不要使用單引號、不要結尾多餘逗號。",
          "",
          marketSnapshot
            ? "前一交易日收盤數據（只能引用這裡的數字）：\n" + marketSnapshot + "\n"
            : "（今日無收盤數據，daily_overview 請聚焦新聞。）\n",
          "候選新聞（JSON 陣列，共 " + userPayloadJson.length + " 字元）：",
          userPayloadJson,
        ].join("\n");
  const { text } = await runLlm({
    systemPrompt: SYSTEM_PROMPT_DIGEST,
    userPrompt,
  });
  const cleaned = extractJson(text);
  let parsed: Partial<DailyReport>;
  try {
    parsed = JSON.parse(cleaned) as Partial<DailyReport>;
  } catch (strictErr) {
    // LLMs routinely emit JSON with unescaped quotes inside Chinese
    // strings (e.g. 商务部回应"内卷"). jsonrepair fixes most of these
    // mechanically before we ever surface a failure.
    try {
      const repaired = jsonrepair(cleaned);
      parsed = JSON.parse(repaired) as Partial<DailyReport>;
      console.warn("[pipeline] JSON.parse failed but jsonrepair recovered");
    } catch {
      try {
        const fs = await import("node:fs");
        fs.mkdirSync("logs", { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        fs.writeFileSync(`logs/claude-raw-${ts}.txt`, text, "utf8");
        fs.writeFileSync(`logs/claude-cleaned-${ts}.txt`, cleaned, "utf8");
        console.warn(
          `[pipeline] both JSON.parse and jsonrepair failed; raw at logs/claude-raw-${ts}.txt`,
        );
      } catch {
        // best-effort logging
      }
      throw strictErr;
    }
  }
  return {
    hero_headline: parsed.hero_headline ?? "",
    daily_overview: parsed.daily_overview ?? "",
    tech_briefs: parsed.tech_briefs ?? [],
    finance_briefs: parsed.finance_briefs ?? [],
    politics_briefs: parsed.politics_briefs ?? [],
    editor_note: parsed.editor_note ?? "",
    keywords: parsed.keywords ?? [],
  };
}

export async function generateDailyReport(
  articles: ArticleInput[],
  callDigest: (userPayloadJson: string, marketSnapshot?: string) => Promise<DailyReport> = callOnce,
  marketSnapshot = "",
): Promise<{ report: DailyReport; tokensUsed: number }> {
  const grouped: Record<Category, ArticleInput[]> = {
    tech: [],
    finance: [],
    politics: [],
  };
  for (const a of articles) grouped[a.category].push(a);

  const compact = (Object.keys(grouped) as Category[]).flatMap((c) =>
    selectRoundRobin(grouped[c], PER_CATEGORY_LIMIT[c]),
  );

  const userPayload = compact.map((a, i) => ({
    n: i + 1,
    title: a.title,
    url: a.url,
    source: a.source,
    category: a.category,
    excerpt: (a.excerpt ?? "").slice(0, 200),
    published: a.publishedAt?.toISOString() ?? "",
  }));
  const userPayloadJson = JSON.stringify(userPayload);

  let report: DailyReport;
  try {
    report = await callDigest(userPayloadJson, marketSnapshot);
  } catch (firstErr) {
    // One retry covers transient provider interruptions and occasional
    // narration/malformed JSON on the first response.
    console.warn(
      `[pipeline] first digest call failed, retrying: ${
        firstErr instanceof Error ? firstErr.message : String(firstErr)
      }`,
    );
    try {
      report = await callDigest(userPayloadJson, marketSnapshot);
    } catch (secondErr) {
      if (
        isRecoverableDigestOutputError(firstErr) &&
        isRecoverableDigestOutputError(secondErr)
      ) {
        console.warn(
          "[pipeline] digest output invalid after 2 attempts; using enriched-article fallback",
        );
        report = buildFallbackDailyReport(articles);
      } else {
        // Auth, quota, networking, and configuration failures remain fatal;
        // silently publishing through those would hide actionable problems.
        throw secondErr;
      }
    }
  }

  // Max subscription has no per-call token meter — we expose 0 for schema
  // compatibility; consumers should treat 0 as "metric not available".
  return { report, tokensUsed: 0 };
}
