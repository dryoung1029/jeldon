# Module Catalog

Per-package reference: what it does, what BoH source it extracts from, its public
API, the config it reads, and the capability flag it sits behind. Status legend:
**✅ built** (compiles + typechecks + tests; a real port) · **🟡 partial** · **⬜ planned**.

> All 15 packages build + typecheck + test green, integration-verified against
> the `jeldon-core` workspace. Remaining `TODO(port)` markers are intentional
> gaps (named per package below), not unfinished scaffolding.

## Ranking Core (v1)

### `@jeldon/config` — ✅ built
The Domain Pack contract. **Two entry points** (Helix finding #8):
- `@jeldon/config` (root, isomorphic, no `node:*`/jiti in its static graph —
  a test greps the dist): types, `domainPackSchema`, defaults,
  `validateDomainPack`, `defineDomainPack`, the URL helpers
  (`articlePath`, `articlePathPrefix`, `articlePathPattern`, `authorPath`),
  `draftingMode`, `resolveStrategyConfig`, `resolveAnalyticsConfig`. Safe in a
  Cloudflare Worker route. A deprecated `loadDomainPack` shim defers to `./load`
  through a dynamic import (removed in 0.3).
- `@jeldon/config/load` (Node): `loadDomainPack`, `resolveConfigPath` (jiti +
  `node:fs`). Build-time code and the CLI import from here.

New pack fields: `content.articlePathPrefix` (default `/articles/`),
`authors[].urlPrefix` (default `/team/`), `brand.fonts`,
`capabilities.drafting: boolean | 'api' | 'agent'`.

### `@jeldon/core-scoring` — ✅ built
`calculateSeo(input, cfg)`, `calculateGeo(input, cfg)`, `fleschKincaidGrade`,
`scoreArticle(input, scoring)`. Isomorphic (browser + Node) — kills the
scorer-mirror drift. Extracts `seo.ts` + the inline editor mirror +
`check-geo-floor.ts`.

### `@jeldon/content-model` — ✅ built
Frontmatter codec, lifecycle state machine (draft→docReviewed→ready→
scheduled→live), Zod article schema built from `content.categories`,
`validateArticle`, `publishScheduled`. Extracts `frontmatter.ts`, `articles.ts`,
`content/config.ts`, `publish-scheduled.mjs`. Consolidates the triple-implemented
parser.

### `@jeldon/schema-graph` — ✅ built
`organizationGraph`, `personGraph`, `articleGraph`, `breadcrumbList`,
`extractFaqs` (verbatim-portable), `faqPage`, `emitLlmsTxt`. Reads `pack.schema`
+ author profiles. Extracts `schema.ts` + inline `BaseLayout`/page literals.

### `@jeldon/store` — ✅ built
`interface Store` + `GitHubStore` (SHA-conflict re-fetch/merge preserving
out-of-band frontmatter) + `FsStore`. Extracts `github.ts` + the `[slug]` PUT
merge logic. Reads `services.store` + GitHub env.

### `@jeldon/aeo-audit` — ✅ built
`runAudit(querySet, brandMatch, engines)` with a pluggable engine registry
(Perplexity / Anthropic web_search / Google AIO) + `aggregate(store)`. Extracts
`aeo-audit.mjs` + `command/aeo.ts`. Pure Node, zero host coupling — the
highest-value portable asset. Reads `pack.aeo`. `TODO(port)`: the OpenAI engine
(`ENGINE_BUILDERS.openai`) returns null — it was never implemented in BoH either.

### `@jeldon/verify` — ✅ built
`interface ClaimVerifier` + `Cite8Verifier` (health plugin) + `NullVerifier`
(default) + `PrimarySourceVerifier` (generic resolvable-link). `lintCitations`
reads `citation.forbiddenPatterns`. Extracts `cite8.ts`, `lint-citations.mjs`.

### `@jeldon/strategy` — ✅ built
`buildRecommendations(inputs, ruleSet, cfg)` — deterministic, evidence-backed.
Thresholds/copy/deep-links/category-targets externalized; audio/podcast/AEO
rules opt-in. Extracts `strategy.ts`.

### `@jeldon/cli` — ✅ built
- `jeldon init [dir] --kit local-business --name … --url … --from <old> --answers <file> --crm … --notify … [--yes] [--no-install] [--vendor-from <dir>]`
  — the spawn: scrape (competitive-intel) → baseline (`@jeldon/benchmark`) →
  answers/interview → generate (pack from a per-vertical scoring preset, kit
  config, content, redirects + OLD-URLS from one plan, rendered agent kit,
  CI, README) → verify (npm install, validate, doctor, both builds). Answers
  schema: `@jeldon/cli/answers` → `schemas/init-answers.schema.json`. The
  skeleton (template + kits) is copied into the package at build time.
- `jeldon validate` · `jeldon doctor [--pre] [--json]` (+ registered checks
  from `jeldon.checks.mjs`) · `jeldon check-geo-floor [file…]` (drafts scored
  only when named) · `jeldon score <file> [--json]` · `jeldon brief [topic]`
  (agent drafting mode) · `jeldon benchmark --old <url> --new <url> | --old <url> | --ci`.
- `audit` and `migrate` are still 🟡.

## Growth modules (v2+)

| Package | Status | Extracts from | Capability flag |
|---|---|---|---|
| `@jeldon/drafting` | ✅ | `author.ts`, `site-knowledge.ts`, `voice-memory.ts`, `priority-keywords.ts`, `chat.ts`; + `buildAgentBrief()` — the same voice block + GEO playbook rendered for a coding agent (`jeldon brief`) | `drafting: 'api' \| 'agent'` |
| `@jeldon/amplify` | ✅ | amplify/carousel/newsletter endpoints, `brevo-campaigns.ts`, `auto-newsletter.mjs` | `amplify` |
| `@jeldon/media` | ✅ | `narration.ts`, audio/image routes, `podcast.xml.ts`, R2 proxies | `audio`, `heroImages` |
| `@jeldon/competitive-intel` | ✅ | `competitor-scanner.ts`, `audit-competitors.mjs`, `competitor-gap-report.ts`, `keyword-ranks.ts` | `competitiveIntel` |
| `@jeldon/crawler-analytics` | ✅ | `ai-crawlers.ts`, `fetch-cf-analytics.mjs`, `article-analytics.ts`, `api/track.ts`; + `parseSearchConsoleExport()` / `renderSearchConsoleReport()` (Helix `traffic-report.mjs`, the no-API owner path) | `engagementAnalytics` (Search Console parsing is ungated) |
| `@jeldon/entity-presence` | ✅ (scaffold) | NEW — off-site brand-mention + per-engine citation-pattern signals | `entityPresence` |

## Site kits (Landmark 5)

### `@jeldon/kit-local-business` — ✅ built
Everything a small local business site needs around the article engine,
extracted from the Helix Training build and generalized (no vertical in the
code; vocabulary from `kit.labels`). Root (Worker-safe): `KitConfig` +
`kitConfigSchema` + `defineKitConfig`; `LABEL_PRESETS` (gym/clinic/studio/
shop/generic) + `resolveLabels`; `VERTICAL_SCORING` presets; design tokens
(`buildGlobalCss` from `brand.brandColors` + `brand.fonts` + `kit.theme`, with
derived shades and light/dark); `openingHoursSpec`; the contact handler
(`handleContact`/`processContact`) with `LeadSink` adapters (`pushpress`,
`gohighlevel`, `brevo-contact`, `none`) and `Notifier` adapters (`brevo`,
`resend`, `none`) — honeypot always, Turnstile optional, honest 503, duplicate
≠ failure, never guess a recipient; the PushPress adapter; booking adapters +
`bookingVendorOf`; `planRedirects` → `_redirects` + `OLD-URLS.md` (service and
team slug maps; `matchSlug` pairs an old person/service slug with the new one by
shared name tokens, so `dr-mel-mcnulty` lands on `mel-mcnulty/`);
`serviceNode`; `complianceCopy` (the one place the kit reads
`compliance.pack`). Node entry (`/node`): `loadKitConfig`, `kitChecks()` for
the doctor registry, `sendTestContact`, `buildTrafficReport`. The Astro overlay
is `kits/local-business/` (neutral page set, label-driven copy, collections for
services/team/faqs with one page per service and per team member (Person
nodes; the owner's page carries the pack author `@id`), the contact route, CI +
nightly rebuild, workbench scripts, `DESIGN.md`); the agent-kit templates are
`kits/local-business/agent/`.

### `@jeldon/benchmark` — ✅ built
`snapshotSite(url)` + `analyzePage` (the same extraction on both sites),
`measureAll` → ten `Measurement`s (higher-is-better scores), `compare` → win /
tie / behind / unmeasured, `buildScorecard` + `renderScorecardMarkdown` (table,
three biggest wins in plain words, fix list), `captureBaseline` (what
`jeldon init` stores on day one), `runPsi` (PageSpeed, keyless or keyed).
Reuses `@jeldon/competitive-intel` for fetching + GEO; injected fetchers make
it testable offline.

> `@jeldon/entity-presence` is the one module **not** in the source system. The
> audit flags off-site mentions as correlating ~3× stronger with AI citation
> than backlinks — the biggest lever on-page-only optimization can't reach. See
> `docs/AEO-PLAYBOOK.md`.

Before extending a package or finishing a `TODO(port)`, read
`docs/DECOUPLING-NOTES.md` first — it names the exact coupling each module breaks
and the adapter that replaces it.
