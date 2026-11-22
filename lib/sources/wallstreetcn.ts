import type { RawArticle } from "./types";

/**
 * 華爾街見聞 (wallstreetcn.com) — public JSON API used by the site itself.
 * Tries the article feed first, then the live-news (快訊) feed. Content is
 * Simplified Chinese; the enrichment step rewrites summaries into
 * Traditional Chinese, so this source is NOT tagged lang:"zh".
 */
const BASE = "https://api-one-wscn.awtmt.com/apiv1/content";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  Referer: "https://wallstreetcn.com/",
};

type Obj = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function toArticle(sourceId: string, r: Obj, kind: "articles" | "livenews"): RawArticle | null {
  const id = r.id ?? r.resource_id;
  const content = stripHtml(str(r.content_short) || str(r.content_text) || str(r.content));
  let title = stripHtml(str(r.title));
  // 快訊 often has no title — use the first sentence of the text.
  if (!title && content) title = content.split(/[。！？]/)[0].slice(0, 60);
  if (!title) return null;
  const uri = str(r.uri) || (id ? `https://wallstreetcn.com/${kind}/${id}` : "");
  if (!uri) return null;
  const ts = Number(r.display_time ?? r.created_at ?? 0);
  return {
    sourceId,
    title,
    url: uri,
    excerpt: content.slice(0, 300),
    publishedAt: ts > 0 ? new Date(ts * 1000) : undefined,
    category: "finance",
  };
}

async function getJson(url: string): Promise<Obj | null> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Obj;
}

export async function fetchWallstreetcn(sourceId: string, limit = 30): Promise<RawArticle[]> {
  const errors: string[] = [];

  // 1) 文章流
  try {
    const j = await getJson(`${BASE}/information-flow?channel=global&accept=article&limit=${limit}`);
    const items = ((j?.data as Obj)?.items as Obj[]) ?? [];
    const out = items
      .map((it) => (it.resource as Obj) ?? it)
      .map((r) => toArticle(sourceId, r, "articles"))
      .filter((a): a is RawArticle => a !== null);
    if (out.length > 0) return out;
    errors.push("articles: empty");
  } catch (e) {
    errors.push(`articles: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2) 快訊
  try {
    const j = await getJson(`${BASE}/lives?channel=global-channel&limit=${limit}`);
    const items = ((j?.data as Obj)?.items as Obj[]) ?? [];
    const out = items
      .map((r) => toArticle(sourceId, r, "livenews"))
      .filter((a): a is RawArticle => a !== null);
    if (out.length > 0) return out;
    errors.push("lives: empty");
  } catch (e) {
    errors.push(`lives: ${e instanceof Error ? e.message : String(e)}`);
  }

  throw new Error(`wallstreetcn: ${errors.join("; ")}`);
}
