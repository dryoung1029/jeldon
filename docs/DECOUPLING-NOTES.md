# Decoupling Notes

The couplings in the source system (Body of Health) that must be broken to make
each module portable, and the adapter/config that replaces each. Read the row
for a package before porting it.

| Coupling | Where it lives (BoH) | How to break it |
|---|---|---|
| **Scorer mirror drift** (the #1 hazard) | `seo.ts` vs inline `[slug].astro` vs `audit-competitors.mjs::calculateGeoFromHtml` | ✅ Done. `@jeldon/core-scoring` is isomorphic; the editor dial and CI import the same package. No hand-copy exists to drift. |
| **GitHub-as-database** | `github.ts`, every admin write | `interface Store`; `GitHubStore` default + `FsStore` fallback. Reach through the interface, never `github.ts`. |
| **Cloudflare analytics** | `fetch-cf-analytics.mjs` GraphQL, D1 `api/track.ts`, R2 proxies | `interface AnalyticsProvider` + `ObjectStore` + `EventStore`; CF is one adapter each, with `Null`/`Fs`/`Sqlite` defaults. CF zone/account IDs become config. |
| **Brand IDs/copy inline** | `yourbodyofhealth.com` ×40+, phone, place IDs, `Dr. Jason Young` in schema/prompts/podcast | Single `brand`/`authors` block; `siteUrl` threaded once. Schema entity *graphs* move from page literals into `OrgProfile`/`PersonProfile`. |
| **Voice block duplicated ×4** | `author.ts`, `chat.ts`, `carousel/[slug].ts`, `newsletter-content.ts` | One `pack.voice`, injected by `getSiteKnowledge()`; wire all four prompt sites through it (today some bypass it). |
| **Referer/channel map ×3** | `classifyReferer`, `classifySource`, `ArticleAnalytics` CTA logic | Single injected `refererChannelMap` in `@jeldon/crawler-analytics`. |
| **AI bot list ×2** | `ai-crawlers.ts` + `fetch-cf-analytics.mjs` | Single `aiBotList` config injected into `detectAiCrawler`. |
| **cite8 / PubMed hardwired** | `cite8.ts`, GEO citation regex, lint patterns | `interface ClaimVerifier` (cite8 = health plugin, `NullVerifier` default, `PrimarySourceVerifier` generic). Citation `sourcePatterns` + `forbiddenPatterns` become config. |
| **Citation-policy contradiction** | lint "no PMIDs" vs cite8 "PMIDs OK" | ✅ Resolved by `citation.policy` enum — an explicit per-domain choice; lint derives `forbiddenPatterns` from it. |
| **Category enum in 4+ places** | `content/config.ts`, `validate-article.ts`, `check-frontmatter.mjs`, prompts, scorer | Single `content.categories`; `buildArticleSchema(cfg)` derives the Zod enum; all consumers read config. |
| **Frontmatter parser ×3** | `frontmatter.ts`, `astro.config.mjs` scan, `publish-scheduled.mjs` | One `@jeldon/content-model` codec; `publishScheduled()` and the sitemap filter import it. |
| **TS-lib ↔ JS-cron duplication** | `competitor-scanner.ts` (TS) vs `audit-competitors.mjs` (JS mirror) | Ship the bundled package; import from both the Astro Function and the Node cron. One source. |
| **Astro/CF Pages adapter drift** | `astro.config.mjs` | Template bakes the current **Workers** adapter (Pages support dropped). |

## Extraction method (per 🟡 package)

1. Read the BoH source named in the row (it lives in the parent repo this engine
   was extracted from; if absent, read `docs/MODULE-CATALOG.md` for the API shape).
2. Lift the *mechanics* verbatim; replace every domain literal with a config read.
3. Put I/O behind the relevant interface; provide a null/FS default.
4. Add a Vitest that proves the same input + a *different* pack changes behavior
   without touching engine code (see `core-scoring`'s portability test).
5. Add a changeset.

## Not ported yet: the talking-head video editor (BoH 2026-10/11)

BoH edits talking-head video by its transcript, all in the browser except
transcription (`admin/studio/video/edit.astro`, ~2,500 lines, plus
`api/admin/video/{transcribe,social-cut,suggest-overlays}.ts`). It is deferred
(PORT-MAP §9). If it is ported, the pure parts (token/filler model, cut and
segment maps, filter graph and caption builders, split-plan math) belong in a
`@jeldon/video` package; the page stays a template island; the persona comes
from `pack.voice`. These lessons cost real time and apply to any port:

- **Never chain `afade` on a joined stream.** Fade each segment, then
  concatenate. The chained version shipped muted audio.
- **Scoped styles never match runtime-built DOM.** Use `is:global` with
  prefixed selectors for anything the script creates.
- **iOS only delivers a file from a real tap.** A programmatic download after
  an async step is dropped; re-arm a button for the user to press.
- **Mount the input with WORKERFS** instead of copying it into the wasm heap.
- **Split audio into 2-minute parts** to stay under the edge's ~100 s
  connection ceiling, and stream NDJSON with a keepalive line while waiting.
- **Leave a fixed total gap at each cut,** split across both sides, not a fixed
  amount per side.
