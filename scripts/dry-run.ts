import "./_env";

import { sources } from "../lib/sources/registry";
import { fetchSource } from "../lib/sources/dispatch";
import type { ArticleInput } from "../lib/ai/pipeline";
import { fetchTwseMargin, marginToPromptText } from "../lib/trading/twse-margin";

// Source-fetch sanity check only — does NOT call the LLM. For the full
// ingest → digest → write-to-disk pipeline use `npm run daily` instead.
async function main() {
  console.log("Fetching from sources…\n");
  const articles: ArticleInput[] = [];

  const enabled = sources.filter((s) => s.enabled !== false);
  for (const source of enabled) {
    try {
      const items = await fetchSource(source);
      console.log(`  ${source.id.padEnd(20)} ${items.length}`);
      articles.push(...items.map((it) => ({ ...it, source: source.name })));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  ${source.id.padEnd(20)} FAILED — ${msg}`);
    }
  }

  console.log(`\nTotal articles: ${articles.length}`);

  try {
    const m = await fetchTwseMargin();
    console.log(m ? `\n[margin] OK\n${marginToPromptText(m)}` : "\n[margin] no data");
  } catch (e) {
    console.error(`\n[margin] FAILED — ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log("\nTop 10 articles:");
  articles.slice(0, 10).forEach((a, i) => {
    console.log(`  ${i + 1}. [${a.category}] ${a.title}`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
  console.error(e);
  process.exit(1);
});
