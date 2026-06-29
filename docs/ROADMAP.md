# Roadmap & Build Status

Per the agreed scope, the engine ships **everything** (ranking core + all growth
modules), structured so the ranking core stands alone and growth modules are
capability-flagged. Build proceeds in landmarks; each package is independently
useful.

## Status snapshot

| Package | Status | Notes |
|---|---|---|
| `@jeldon/config` | ✅ built | Types, Zod schema, defaults, loader. The keystone. |
| `@jeldon/core-scoring` | ✅ built | SEO + GEO + FKGL, config-driven, isomorphic, tested. |
| `@jeldon/cli` | ✅ built (partial) | `validate` + `doctor`. `check-geo-floor`/`audit`/`init`/`migrate` pending. |
| `@jeldon/content-model` | 🟡 scaffolded | Port frontmatter codec + lifecycle machine. |
| `@jeldon/schema-graph` | 🟡 scaffolded | Port JSON-LD builders + `extractFaqs`. |
| `@jeldon/store` | 🟡 scaffolded | `Store` interface + GitHub/FS adapters. |
| `@jeldon/aeo-audit` | 🟡 scaffolded | Multi-engine citation-presence audit. |
| `@jeldon/verify` | 🟡 scaffolded | `ClaimVerifier` + cite8/null/primary-source. |
| `@jeldon/strategy` | 🟡 scaffolded | Deterministic recommendations engine. |
| `@jeldon/drafting` | 🟡 scaffolded | LLM drafting + voice injection (high difficulty). |
| `@jeldon/amplify` | 🟡 scaffolded | Channels + newsletter + carousel. |
| `@jeldon/media` | 🟡 scaffolded | Narration + hero images + podcast feed. |
| `@jeldon/competitive-intel` | 🟡 scaffolded | War Room scanner + gap report. |
| `@jeldon/crawler-analytics` | 🟡 scaffolded | Crawler classifier + edge analytics. |
| `@jeldon/entity-presence` | ⬜ planned | NEW — off-site mention signals (not in source system). |
| `template/` | 🟡 partial | Golden example + starter config landed; Astro/Workers app + CI pending. |
| `schemas/` | 🟡 partial | Generated from the Zod schema via `pnpm gen:schema`. |

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
