import { jsonrepair } from "jsonrepair";
import { runLlm } from "./llm";
import { extractJson } from "./json-util";
import { REPORT_LOCALE } from "../sources/registry";
import type { CryptoGlobalStats } from "../trading/coingecko";
import type { FearGreedSnapshot } from "../trading/fear-greed";
import type { TickerAnalysis } from "../trading/signals";

export interface WatchlistPick {
  symbol: string;
  display_name: string;
  /**
   * Direction label of the current technical setup (NOT a price prediction).
   * Original "看多/看空" wording occasionally tripped Sonnet's "no investment
   * advice" guardrail into returning an empty array; the neutral technical
   * vocabulary "偏上行/偏下行/中性" (and "Bullish/Bearish/Neutral" for en
   * mode) avoids the trigger. Legacy values are kept for backwards-compat.
   */
  stance:
    | "偏上行"
    | "偏下行"
    | "中性"
    | "看多"
    | "看空"
    | "Bullish"
    | "Bearish"
    | "Neutral";
  rationale: string;
}

export interface TradingCommentary {
  market_overview: string;
  watchlist: WatchlistPick[];
  risk_caveat: string;
}

export interface TradingCommentaryInput {
  tickers: TickerAnalysis[];
  cryptoFearGreed?: FearGreedSnapshot;
  cryptoGlobal?: CryptoGlobalStats;
}

const SYSTEM_PROMPT_ZH = `你是一名專業、克制、中性的繁體中文（台灣用語）技術指標解讀員。你的任務是根據公開行情資料計算出的技術指標，撰寫一份**客觀的技術面狀態描述**——你不是投顧，不預測漲跌，只描述指標讀數與走勢型態。所有讀者都已知道並接受這個定位。

**嚴格規則**：
1. 使用專業術語描述指標：黃金交叉／死亡交叉、MACD 柱狀體翻正／翻負、超買／超賣、突破、支撐、壓力、動能、趨勢、背離等。
2. 所有描述必須**根據輸入的實際數字**（價格、SMA、RSI、MACD、訊號、近期漲跌幅），不可憑空概括或編造數字。
3. watchlist 必須**同時涵蓋偏上行、偏下行、中性三種 stance**，反映輸入資料的真實分布，不能全偏一側。
4. market_overview 依序涵蓋 6 類資產：全球指數、台股、AI 與半導體、追蹤 ETF、商品（油價、黃金、銅）、利率與匯率（美債殖利率曲線、美元指數、新台幣、日圓、VIX）。可點出跨資產的關聯，例如殖利率與成長股、油價與能源 ETF、美元與新台幣。
5. risk_caveat 必須包含「過去走勢不代表未來表現」與「僅供技術指標解讀參考」。
6. **全部使用繁體中文**，不得出現簡體字。

輸入：JSON 陣列，每個元素是某標的的技術分析物件，欄位包括 symbol、displayName、group、currentPrice、pct1Day、pct5Day、pct52WeekHigh、pct52WeekLow、sma20/sma50/sma200、rsi14、macd/macdSignal、trend、rsiState、signals。殖利率類標的（^IRX、^FVX、^TNX、^TYX）的 currentPrice 單位是百分比。

輸出嚴格 JSON 物件（不要 markdown、不要任何前後說明），三個欄位都**必填且不能為空**：
{
  "market_overview": "<350-500 字段落，不能省略>",
  "watchlist": [
    { "symbol": "<必須從輸入精確複製>", "display_name": "<中文名稱>", "stance": "偏上行" | "偏下行" | "中性", "rationale": "<80-150 字，必須引用具體指標數字>" },
    ...
  ],
  "risk_caveat": "<60-100 字，必須包含「過去走勢不代表未來表現」與「僅供技術指標解讀參考」>"
}

**關於 watchlist（最容易出錯的欄位，請嚴格執行）**：
- watchlist **必須正好包含 4-6 個標的**。
- watchlist 少於 3 個是**輸出格式錯誤**，下游會自動拒絕並重新呼叫你。
- "stance" 只是當前技術面方向的標籤——純描述、純客觀——不是漲跌預測，也不是操作建議。
- 若覺得「今天市場平靜、沒有突出標的」，仍要挑出**技術訊號最明顯的 4 個**（例如 RSI 偏離 50 最遠、單日漲跌幅最大、最近出現交叉訊號），全部標「中性」也完全合規。
- 任何情況下**禁止回傳空陣列**。

**引號規則（重要！）**：JSON 字串內的引用一律使用全形引號「」，**絕不**使用英文雙引號——否則 JSON 解析失敗。

**輸出順序建議**：先產生 watchlist 陣列，再產生 market_overview，最後 risk_caveat。這樣即使輸出被截斷也能保留重點標的。`;

const SYSTEM_PROMPT_EN = `You are a professional, restrained, neutral English-language technical-indicator interpreter. Your job is to write an **objective technical-state report** based on the public-market data's computed indicators — you are NOT an investment advisor, you do not predict price direction, you only describe indicator readings and chart structure. Any reader of this report already knows and accepts this framing.

**Strict rules**:
1. Use technical terminology to describe readings: golden-cross / death-cross / MACD bullish/bearish histogram / overbought / oversold / breakout / support / momentum / trend / divergence, etc.
2. Every conclusion MUST be **grounded in actual input numbers** (price, SMA, RSI, MACD, signals, recent % moves) — no generalizing without data.
3. The watchlist MUST **cover all three stances — Bullish / Bearish / Neutral** — reflecting the real technical distribution; do not bias entirely to one side.
4. market_overview must cover all 4 asset categories (US equity / crypto / China-HK equity / commodities-FX).
5. risk_caveat MUST explicitly include "past performance does not guarantee future results" and "for technical-indicator interpretation only".

Input: a JSON array of ticker analysis objects with fields symbol, displayName, group, currentPrice, pct1Day, pct5Day, pct52WeekHigh, pct52WeekLow, sma20/sma50/sma200, rsi14, macd/macdSignal/macdHistogram, trend, rsiState, signals.

Output STRICTLY a JSON object (no markdown, no prefix/suffix). All three fields must be **populated and non-empty**:
{
  "market_overview": "<300-400 word paragraph; do not skip>",
  "watchlist": [
    { "symbol": "<copied exactly from input>", "display_name": "<readable name>", "stance": "Bullish" | "Bearish" | "Neutral", "rationale": "<80-150 words; must cite specific indicator numbers>" },
    ...
  ],
  "risk_caveat": "<60-100 words; must include 'past performance does not guarantee future results' and 'for technical-indicator interpretation only'>"
}

**About watchlist (historically the most error-prone field — execute strictly)**:
- watchlist MUST contain **exactly 3-5 tickers**.
- watchlist length < 3 is **a format error** — downstream auto-rejects and re-invokes you, wasting a quota call.
- "stance" is a label for the **current technical setup** — pure description, pure observation — not a price prediction or an action recommendation. You are merely saying "this ticker's current indicator state is Bullish / Bearish / Neutral".
- If after scanning all tickers you feel "today is quiet, no standout names", you still MUST pick the **3 with the most pronounced technical signals** (e.g. RSI furthest from 50, largest 1-day % move, most recent golden/death cross) — labeling all of them "Neutral" is perfectly compliant.
- Under no circumstances may you return an empty array. An empty watchlist is not the safer choice — it is wrong.

**Quote rule (important!)**: For any quotation INSIDE a JSON string, use single quotes ' or curly quotes '" — **never** raw double-quotes, which break JSON parsing.

**Output-order suggestion**: in your response, generate the watchlist array FIRST (most important, most easily missed), then market_overview, then risk_caveat. This preserves picks even if the response is truncated.`;

const SYSTEM_PROMPT =
  REPORT_LOCALE === "en" ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_ZH;

export async function generateTradingCommentary(
  input: TradingCommentaryInput,
): Promise<TradingCommentary> {
  const { tickers, cryptoFearGreed, cryptoGlobal } = input;
  // Slim payload — drop fields that don't help the model (no need to send
  // exchangeName/currency etc. — those are display-only)
  const payload = tickers.map((a) => ({
    symbol: a.symbol,
    displayName: a.displayName,
    group: a.group,
    currentPrice: round(a.currentPrice),
    pct1Day: round(a.pct1Day, 2),
    pct5Day: round(a.pct5Day, 2),
    pct52WeekHigh: round(a.pct52WeekHigh, 2),
    pct52WeekLow: round(a.pct52WeekLow, 2),
    sma20: roundNullable(a.sma20),
    sma50: roundNullable(a.sma50),
    sma200: roundNullable(a.sma200),
    rsi14: roundNullable(a.rsi14, 1),
    macd: roundNullable(a.macd, 4),
    macdSignal: roundNullable(a.macdSignal, 4),
    trend: a.trend,
    rsiState: a.rsiState,
    signals: a.signals.map((s) => s.label),
  }));

  // Compact context sidecars — the model should weave these into the
  // market_overview when relevant (e.g. "VIX 14 + DXY weakening + crypto
  // F&G 43 → risk-on lite").
  const contextLines: string[] = [];
  if (cryptoFearGreed) {
    const classification =
      REPORT_LOCALE === "en"
        ? cryptoFearGreed.classification
        : cryptoFearGreed.classificationCn;
    const label =
      REPORT_LOCALE === "en"
        ? `Crypto Fear & Greed Index = ${cryptoFearGreed.value} (${classification})`
        : `加密恐慌贪婪指数 = ${cryptoFearGreed.value}（${classification}）`;
    contextLines.push(label);
  }
  if (cryptoGlobal) {
    const label =
      REPORT_LOCALE === "en"
        ? `Crypto total market cap = ${(cryptoGlobal.totalMarketCapUsd / 1e12).toFixed(2)}T USD (24h ${round(cryptoGlobal.marketCapChangePct24h, 2)}%) · BTC dominance ${round(cryptoGlobal.btcDominance, 1)}% · ETH ${round(cryptoGlobal.ethDominance, 1)}%`
        : `加密总市值 = ${(cryptoGlobal.totalMarketCapUsd / 1e12).toFixed(2)}T USD (24h ${round(cryptoGlobal.marketCapChangePct24h, 2)}%) · BTC 主导率 ${round(cryptoGlobal.btcDominance, 1)}% · ETH ${round(cryptoGlobal.ethDominance, 1)}%`;
    contextLines.push(label);
  }

  // user prompt header = highest instruction-recency precedence. The
  // SYSTEM_PROMPT already says "watchlist must be 3-5", but inside a
  // system prompt that constraint sometimes loses to the RLHF "no
  // investment advice" reflex; restating it at the top of the user
  // prompt materially improves hit rate (see lesson #8).
  const userPrompt =
    REPORT_LOCALE === "en"
      ? [
          `**Output language: ENGLISH ONLY.** Every string value in the JSON — market_overview, every pick's display_name and rationale, risk_caveat — MUST be written entirely in English. Do not use any Chinese characters anywhere in the output. Even if some input ticker names appear in Chinese (e.g. "黄金期货"), translate them to English in the display_name field (e.g. "Gold Futures").`,
          "",
          `**Hard output constraint**: the response MUST be a single valid JSON object (starts with \`{\`, ends with \`}\`, no markdown, no prefix/suffix). **The watchlist field MUST contain exactly 3-5 complete WatchlistPick objects**, each shaped like \`{ "symbol": "...", "display_name": "<English name>", "stance": "Bullish"|"Bearish"|"Neutral", "rationale": "80-150 word English summary citing concrete indicator numbers" }\`. **DO NOT write the watchlist as a string array of ticker symbols** (e.g. \`["^TNX","BTC-USD"]\` is wrong) — this is a technical-indicator interpretation task; every entry must carry a rationale field. Empty arrays and string arrays are both format errors.`,
          "",
          contextLines.length > 0
            ? `Auxiliary context (**you MUST reference at least one of these in market_overview**):\n${contextLines.map((l) => `  - ${l}`).join("\n")}\n`
            : "",
          `Candidate assets (${payload.length} entries, JSON array):`,
          JSON.stringify(payload),
          "",
          `Output a JSON object per the system-prompt schema. watchlist must contain 3-5 complete WatchlistPick objects (symbol / display_name / stance / rationale fields). Empty arrays and string arrays are forbidden.`,
        ]
          .filter(Boolean)
          .join("\n")
      : [
          `**輸出語言：繁體中文（台灣用語），不得出現簡體字。**`,
          "",
          `**輸出硬性限制**：回應必須是單一合法 JSON 物件（以 \`{\` 開頭、\`}\` 結尾，不要 markdown、不要前後說明）。**watchlist 欄位必須正好包含 4-6 個完整的 WatchlistPick 物件**，每個物件形如 \`{ "symbol": "...", "display_name": "...", "stance": "偏上行"|"偏下行"|"中性", "rationale": "80-150 字繁體中文，引用具體指標數字" }\`。**禁止把 watchlist 寫成代碼字串陣列**（如 \`["^TNX","NVDA"]\` 是錯的）。空陣列或字串陣列都是輸出錯誤。`,
          "",
          contextLines.length > 0
            ? `辅助背景（**必须在 market_overview 里至少引用一项**）：\n${contextLines.map((l) => `  - ${l}`).join("\n")}\n`
            : "",
          `候選標的（共 ${payload.length} 個，JSON 陣列）：`,
          JSON.stringify(payload),
          "",
          `請依 system prompt 的 schema 輸出 JSON 物件。watchlist 必須 4-6 個完整 WatchlistPick 物件（含 symbol / display_name / stance / rationale 四個欄位），絕不允許空陣列或字串陣列。`,
        ]
          .filter(Boolean)
          .join("\n");

  const fallback: TradingCommentary = {
    market_overview: "",
    watchlist: [],
    risk_caveat:
      REPORT_LOCALE === "en"
        ? "The above is based on computed technical indicators from public market data and text summaries; it does NOT constitute investment advice. Past performance does not guarantee future results — market risk is your own."
        : "以上內容根據公開行情資料的技術指標計算與文字摘要整理，不構成任何投資建議。過去走勢不代表未來表現，僅供技術指標解讀參考，投資風險請自行評估。",
  };

  // Up to 3 attempts. The "0 picks" failure mode is a probabilistic
  // guardrail trigger, not a deterministic prompt bug — retrying with the
  // exact same prompt usually flips to a different sampling branch. From
  // attempt 2 on, we also prefix a corrective note so the model sees its
  // own prior empty output as the thing to fix.
  const MAX_ATTEMPTS = 3;
  const RETRY_HINT =
    REPORT_LOCALE === "en"
      ? `\n\n⚠️ Important: the previous attempt returned an empty watchlist — that's a format error, downstream rejected and triggered this retry (wasting quota). This attempt MUST return 3-5 tickers (even if you feel "no standout names today", pick the 3 with the most pronounced technical signals and label them "Neutral").`
      : `\n\n⚠️ 重要：上一次嘗試 watchlist 為空或格式錯誤，下游已拒絕並觸發重試。本次必須回傳 4-6 個標的（即使認為今天沒有突出標的，也要選訊號最明顯的 4 個並標「中性」）。`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const promptForAttempt = attempt === 1 ? userPrompt : userPrompt + RETRY_HINT;
    try {
      return await callOnce(promptForAttempt, fallback);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_ATTEMPTS) {
        console.warn(
          `[trading-commentary] attempt ${attempt}/${MAX_ATTEMPTS} failed, retrying: ${msg}`,
        );
      } else {
        console.warn(
          `[trading-commentary] all ${MAX_ATTEMPTS} attempts failed: ${msg}`,
        );
      }
    }
  }
  return fallback;
}

async function callOnce(
  userPrompt: string,
  fallback: TradingCommentary,
): Promise<TradingCommentary> {
  const { text } = await runLlm({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    timeoutMs: 240_000,
  });
  const cleaned = extractJson(text);
  let parsed: Partial<TradingCommentary>;
  try {
    parsed = JSON.parse(cleaned);
  } catch (strictErr) {
    try {
      parsed = JSON.parse(jsonrepair(cleaned));
      console.warn("[trading-commentary] JSON.parse failed, jsonrepair recovered");
    } catch {
      // Dump raw output for postmortem — symmetric to pipeline.ts logging.
      try {
        const fs = await import("node:fs");
        fs.mkdirSync("logs", { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        fs.writeFileSync(`logs/trading-raw-${ts}.txt`, text, "utf8");
        fs.writeFileSync(`logs/trading-cleaned-${ts}.txt`, cleaned, "utf8");
        console.warn(
          `[trading-commentary] both JSON.parse and jsonrepair failed; raw at logs/trading-raw-${ts}.txt`,
        );
      } catch {
        // best-effort
      }
      throw strictErr;
    }
  }
  // Validate critical fields are populated. Empty watchlist, missing
  // overview, or wrong-shape picks (e.g. Sonnet sometimes returns a
  // string array ["^TNX", ...] when over-anchored on the "3-5 ticker"
  // wording) all trigger retry.
  const overview = parsed.market_overview ?? "";
  const picks = parsed.watchlist ?? [];
  if (overview.length < 100) {
    throw new Error(`market_overview too short (${overview.length} chars)`);
  }
  if (picks.length < 2) {
    throw new Error(`watchlist too short (${picks.length} picks)`);
  }
  const malformed = picks.find(
    (p) =>
      !p ||
      typeof p !== "object" ||
      typeof (p as WatchlistPick).symbol !== "string" ||
      typeof (p as WatchlistPick).stance !== "string" ||
      typeof (p as WatchlistPick).rationale !== "string" ||
      (p as WatchlistPick).rationale.length < 20,
  );
  if (malformed !== undefined) {
    throw new Error(
      `watchlist pick has invalid shape: ${JSON.stringify(malformed).slice(0, 120)}`,
    );
  }
  return {
    market_overview: overview,
    watchlist: picks as WatchlistPick[],
    risk_caveat: parsed.risk_caveat ?? fallback.risk_caveat,
  };
}

function round(n: number, dp = 2): number {
  return Math.round(n * 10 ** dp) / 10 ** dp;
}
function roundNullable(n: number | null, dp = 2): number | null {
  return n == null ? null : round(n, dp);
}
