# Roadmap & Build Status

Per the agreed scope, the engine ships **everything** (ranking core + all growth
modules), structured so the ranking core stands alone and growth modules are
capability-flagged. Build proceeds in landmarks; each package is independently
useful.

## Status snapshot

All packages **build + typecheck + test green** (15/15 build, 19/19 test
suites), independently re-verified by an integration pass against the renamed
`jeldon-core` workspace (with a negative-control type error to prove the
typecheck exercises real source). `TODO(port)` markers below are the honest,
intentional gaps — not unfinished scaffolding.

| Package | Status | Notes |
|---|---|---|
| `@jeldon/config` | ✅ built | Types, Zod schema, defaults, loader. The keystone. |
| `@jeldon/core-scoring` | ✅ built | SEO + GEO + FKGL, config-driven, isomorphic, tested. |
| `@jeldon/cli` | ✅ built (partial) | `validate` + `doctor`. `check-geo-floor`/`audit`/`init`/`migrate` still pending. |
| `@jeldon/content-model` | ✅ built | Frontmatter codec + lifecycle machine + `buildArticleSchema` + `publishScheduled`. 14 tests. |
| `@jeldon/schema-graph` | ✅ built | JSON-LD builders + `extractFaqs` + `emitLlmsTxt`. Added `ArticleSchemaPolicy` + `LlmsTxtConfig` (opt-in). 13 tests. |
| `@jeldon/store` | ✅ built | `Store` + `GitHubStore` (SHA-merge) + `FsStore`. |
| `@jeldon/aeo-audit` | ✅ built | Perplexity + Anthropic + Google-AIO engines. `TODO(port)`: OpenAI engine (never existed in BoH; v2 target). |
| `@jeldon/verify` | ✅ built | `ClaimVerifier` + cite8/null/primary-source; `lintCitations`. |
| `@jeldon/strategy` | ✅ built | Deterministic recommendations; thresholds/copy/links externalized to `StrategyConfig`. |
| `@jeldon/drafting` | ✅ built | Score→verify→fix-pass loop; LLM provider fully injectable; voice from `pack.voice`. |
| `@jeldon/amplify` | ✅ built | Channel kit + Brevo client + carousel sidecar; one voice block. |
| `@jeldon/media` | ✅ built | Narration core + TTS/image behind interfaces + podcast feed. A few `TODO(port)` (hero-concept proposer wiring). |
| `@jeldon/competitive-intel` | ✅ built | One bundled scanner core (kills TS/JS dup) + gap report + rank tracking. |
| `@jeldon/crawler-analytics` | ✅ built | UA classifier + `AnalyticsProvider` (CF/null). `TODO(port)`: CF Web-Vitals introspection query. |
| `@jeldon/entity-presence` | ✅ built (scaffold) | NEW module. `NullMentionProvider` default; live SerpApi mention provider is `TODO(port)`. |
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
