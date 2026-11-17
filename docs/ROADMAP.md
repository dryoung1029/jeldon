# Roadmap & Build Status

Per the agreed scope, the engine ships **everything** (ranking core + all growth
modules), structured so the ranking core stands alone and growth modules are
capability-flagged. Build proceeds in landmarks; each package is independently
useful.

## Status snapshot

All packages **build + typecheck + test green** (22/22 build and test as of
the 2026-11 Body of Health catch-up; see `docs/PORT-MAP.md`), independently re-verified by an integration pass against the renamed
`jeldon-core` workspace (with a negative-control type error to prove the
typecheck exercises real source). `TODO(port)` markers below are the honest,
intentional gaps — not unfinished scaffolding.

| Package | Status | Notes |
|---|---|---|
| `@jeldon/config` | ✅ built | Types, Zod schema, defaults, loader. The keystone. Also the shared LLM request rules (`llm.ts`: no forced tool_choice, explicit effort) and anchored matchers (`match.ts`: `hostIs`, `termRegex`, `mentionsTerm`). |
| `@jeldon/core-scoring` | ✅ built | SEO + GEO + FKGL, config-driven, isomorphic, tested. |
| `@jeldon/cli` | ✅ built (partial) | `validate`, `doctor [--pre] [--online]` (incl. Search Console, ops, site-ops and topic-cluster checks), `check-geo-floor`, `check-meta-length`, `fetch-search-console`. `init`/`migrate` still pending. |
| `@jeldon/content-model` | ✅ built | Frontmatter codec + lifecycle machine (`docReviewed` deprecated, `autonomous` provenance) + `buildArticleSchema` (video fields, hero-path prefixes) + topic-cluster membership + `parseYouTubeUrl` + `publishScheduled`. |
| `@jeldon/schema-graph` | ✅ built | JSON-LD builders (Article, Org, Person, Breadcrumb, FAQ, VideoObject gated on uploadDate, CollectionPage for clusters, opening hours) + `extractFaqs` + `emitLlmsTxt`. |
| `@jeldon/store` | ✅ built | `Store` + `GitHubStore` (SHA-merge) + `FsStore` + `getArticlesBulk` (bounded lanes, transient-only retry, partial results). |
| `@jeldon/aeo-audit` | ✅ built | Perplexity + Anthropic (5.5, `web_search_20260209`) + Google-AIO engines. Hostname/whole-term brand matching, `redditCitations`, classified `citations[]` and `citedInstead`. `TODO(port)`: OpenAI engine (never existed in BoH). |
| `@jeldon/verify` | ✅ built | `ClaimVerifier` + cite8/null/primary-source; `lintCitations`. |
| `@jeldon/strategy` | ✅ built | Deterministic recommendations; thresholds/copy/links in `StrategyConfig`. Referer groups are exact labels; Search Console striking-distance and low-CTR rules. |
| `@jeldon/drafting` | ✅ built | Score→verify→fix-pass loop; LLM provider fully injectable; voice from `pack.voice`. Controlled-vocabulary tag generation (`content.tags`) + hero concept/alt-text/image generation (`LlmConceptProposer`, `generateHeroForDraft`), both wired into the draft loop. |
| `@jeldon/amplify` | ✅ built | Channel kit (incl. reel script + educational-CTA policy), Brevo client + "Queue in Brevo" scheduling, carousel-studio hand-off (in-page carousel retired); one voice block. |
| `@jeldon/media` | ✅ built | Narration core + TTS/image behind interfaces + podcast feed. Hero-concept proposer now wired (via `@jeldon/drafting`'s `LlmConceptProposer`). `TODO(port)`: the audio pronunciation pre-pass. |
| `@jeldon/competitive-intel` | ✅ built | One bundled scanner core (kills TS/JS dup) + gap report + rank tracking. |
| `@jeldon/crawler-analytics` | ✅ built | UA classifier (anchored bot tokens) + hostname-anchored referer rules + `AnalyticsProvider` (CF/null) + per-route traffic (`normalizeSitePath`) + path-keyed beacon + `fetchWebVitals` with diagnostics. |
| `@jeldon/entity-presence` | ✅ built (scaffold) | NEW module. `NullMentionProvider` default; live SerpApi mention provider is `TODO(port)`. |
| `@jeldon/ops` | ✅ built | Pipeline freshness, attention feed, Actions dispatch, `skipWithWarning`. |
| `@jeldon/search-console` | ✅ built | WebCrypto SA auth, striking distance / low CTR, snippet lab, setup-failure diagnosis. |
| `@jeldon/leads` | ✅ built | First-touch attribution, channels, trends (date basis + maturing), conversion map, hashed booking import; mailbox tracking under `./compliance` (compliance pack only). |
| `@jeldon/google` | ✅ built | Workers-safe service-account tokens; injection-safe raw email builder. |
| `@jeldon/site-alert` | ✅ built | Scheduled site-wide alert (wall-clock in pack timezone), safe linkify, per-version dismissal. Admin page not ported. |
| `@jeldon/access` | ✅ built | Canonical-path protection + Cloudflare Access JWT verification; fails closed. |
| `@jeldon/business-info` | ✅ built | Place hours fetch, special-hours merge, open-now. |
| `template/` | ✅ built | Astro 5 + Workers starter + 5 CI gates + Renovate. CI steps call packages directly until the CLI exposes `check-geo-floor`. |
| `schemas/` | 🟡 partial | Generated from the Zod schema via `pnpm gen:schema` (run after `pnpm build`). |

## Landmarks

### Landmark 1 — Foundation (this commit)
Monorepo skeleton, `@jeldon/config` keystone, `@jeldon/core-scoring` (full + test),
`@jeldon/cli` (validate + doctor), the full agent-facing docs set, and the golden
Northwatch example. **Done when:** `pnpm install && pnpm build && pnpm test` is
green for the built packages and `jeldon validate` passes on the Northwatch
example.

### Landmark 2 — Ranking Core complete
Port `content-model`, `schema-graph`, `store`, `aeo-audit`, `verify`, `strategy`;
finish `cli` (`check-geo-floor`, `audit`, `init`); ship the 5 CI gates and the
Astro/Workers template. **Done when:** a fresh `degit` of the template with a
filled non-health config passes `jeldon doctor` (0 errors), builds clean, scores
one article above target, and runs a dry AEO audit — with no engine code edited.

### Landmark 3 — Growth modules
Port `drafting`, `amplify`, `media`, `competitive-intel`, `crawler-analytics`
behind capability flags; collapse the duplicated voice block + Brevo helpers.
**Done when:** a `drafting:true` project self-heals a draft to target, and an
`amplify:false` project builds with zero amplify surface present.

### Landmark 4 — Analytics adapters + entity presence + update channel
`AnalyticsProvider`/`Store`/`ObjectStore` with CF + null/FS adapters; the new
`@jeldon/entity-presence`; `jeldon migrate` codemod framework; prove a
Renovate-driven package bump auto-PRs into a downstream test repo with no
hand-porting.
