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
| `@jeldon/config` | ✅ built | Types, Zod schema, defaults, pure URL/capability helpers (root, isomorphic); loader at `@jeldon/config/load` (Node). The keystone. |
| `@jeldon/core-scoring` | ✅ built | SEO + GEO + FKGL, config-driven, isomorphic, tested. |
| `@jeldon/cli` | ✅ built | `init` (the spawn), `validate`, `doctor` (+ `jeldon.checks.mjs` registry), `check-geo-floor`, `score`, `brief`, `benchmark`. `audit`/`migrate` still pending. |
| `@jeldon/content-model` | ✅ built | Frontmatter codec + lifecycle machine + `buildArticleSchema` + `publishScheduled`. 14 tests. |
| `@jeldon/schema-graph` | ✅ built | JSON-LD builders + `extractFaqs` + `emitLlmsTxt`. Added `ArticleSchemaPolicy` + `LlmsTxtConfig` (opt-in). 13 tests. |
| `@jeldon/store` | ✅ built | `Store` + `GitHubStore` (SHA-merge) + `FsStore`. |
| `@jeldon/aeo-audit` | ✅ built | Perplexity + Anthropic + Google-AIO engines. `TODO(port)`: OpenAI engine (never existed in BoH; v2 target). |
| `@jeldon/verify` | ✅ built | `ClaimVerifier` + cite8/null/primary-source; `lintCitations`. |
| `@jeldon/strategy` | ✅ built | Deterministic recommendations; thresholds/copy/links externalized to `StrategyConfig`. |
| `@jeldon/drafting` | ✅ built | Score→verify→fix-pass loop; LLM provider fully injectable; voice from `pack.voice`. Controlled-vocabulary tag generation (`content.tags`) + hero concept/alt-text/image generation (`LlmConceptProposer`, `generateHeroForDraft`), both wired into the draft loop. |
| `@jeldon/amplify` | ✅ built | Channel kit + Brevo client + carousel sidecar; one voice block. |
| `@jeldon/media` | ✅ built | Narration core + TTS/image behind interfaces + podcast feed. Hero-concept proposer now wired (via `@jeldon/drafting`'s `LlmConceptProposer`). `TODO(port)`: the audio pronunciation pre-pass. |
| `@jeldon/competitive-intel` | ✅ built | One bundled scanner core (kills TS/JS dup) + gap report + rank tracking. |
| `@jeldon/crawler-analytics` | ✅ built | UA classifier + `AnalyticsProvider` (CF/null). `TODO(port)`: CF Web-Vitals introspection query. |
| `@jeldon/entity-presence` | ✅ built (scaffold) | NEW module. `NullMentionProvider` default; live SerpApi mention provider is `TODO(port)`. |
| `@jeldon/kit-local-business` | ✅ built | The Local Business Kit: kit config, vocabulary + scoring presets, design tokens, contact route adapters (LeadSink/Notifier), booking adapters, redirects, hours schema, compliance copy, registered doctor checks. Astro overlay in `kits/local-business/`, agent-kit templates in `kits/local-business/agent/`. |
| `@jeldon/benchmark` | ✅ built | Ten dimensions, same method on old + new, win/tie/behind/unmeasured, scorecard md + json, baseline capture. Speed needs PageSpeed (keyless quota is tiny; pass `PAGESPEED_API_KEY`). |
| `template/` | ✅ built | Astro 5 content layer + Workers (`wrangler.jsonc`) starter, one CI workflow (engine-resolves · validate/doctor · frontmatter · citations · geo-floor · types · both builds · deploy dry-run), Renovate. `pnpm smoke:template` installs it with npm and runs every gate. |
| `schemas/` | ✅ built | `domain-pack.schema.json` + `init-answers.schema.json`, generated via `pnpm gen:schema` (run after `pnpm build`); CI checks they are current. |

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

### Landmark 5 — the Spawn Engine

Make *Engine + Domain Pack = a ranking machine for any vertical* true for a
**new** site: publish the engine, fold the Helix Training findings back in,
extract the local-business kit, and make `jeldon init` reproduce Helix from an
answers file — with `jeldon benchmark` proving the new site beats the old one.

| Workstream | Status | Notes |
|---|---|---|
| 1. Publish channel | 🟡 ready, unpublished | Package hygiene done (`publishConfig`, `files`, `repository`, `sideEffects`, types-first exports, versions 0.0.0 → 0.1.0 via changesets); `@jeldon/config` split into root + `./load`; engine CI workflow. **Blocked on the owner:** `.changeset/config.json` `access: public`, the `release.yml` workflow (changesets → version PR → `changeset publish` with `NPM_TOKEN` + provenance), and the actual `0.1.0` publish (`npm whoami` must succeed). Until then consumers install with `scripts/vendor-engine.mjs` (`file:` deps), exactly as Helix did. |
| 2. Engine fixes from Helix | ✅ | #3 article/author URL prefixes are pack values; #8 loader split + dist test; #9 attribute-order-agnostic meta + single-fetch vendor detection (fixtures); #10 doctor check registry; #7 content layer; #6 `wrangler.jsonc` + session memory; anchored `.gitignore` + engine-resolves CI step; JS-entry npm scripts; `.assetsignore`; `check-geo-floor` scores named drafts; `jeldon score`; agent drafting mode + `jeldon brief`. |
| 3. Local Business Kit | ✅ | `@jeldon/kit-local-business` + `kits/local-business/`. Smoke-tested through `wrangler deploy --dry-run`. `parseSearchConsoleExport()` in crawler-analytics. |
| 4. Agent Kit | ✅ | `CLAUDE.md`, ten commands, six docs as templates rendered by init; bike-shop render has no gym/Helix vocabulary; clinic render with `compliance: hipaa` carries the no-health-details copy + BAA note. |
| 5. `jeldon init` | ✅ | Scrape → baseline → answers/interview → generate → verify. `examples/helix.answers.json` reproduces the 15 indexable Helix pages at the same URLs (see the diff notes in `docs/IMPLEMENTATION.md`). Answers schema published. |
| 6. `jeldon benchmark` | ✅ (speed unmeasured locally) | Helix old vs the spawned build: **7 win · 2 tie · 0 behind**, launch gate passes — see `examples/helix/benchmark/scorecard-2026-09-28.md`. Speed needs a PageSpeed key and a public URL for the new site. |
| 7. Docs + constitution | ✅ | This table; MODULE-CATALOG; IMPLEMENTATION rewritten around `jeldon init`; constitution articles 10–11 proposed for ratification. |

**Done when:** `@jeldon/*` installs from npm in a clean directory (owner
step); `pnpm build && pnpm test && pnpm typecheck` green with tests for every
§2 item (✅); `jeldon init` reproduces Helix from `examples/helix.answers.json`
(✅); `jeldon benchmark` shows Helix new ≥ old on all ten dimensions with the
scorecard committed (✅ 9 measured, 7 win / 2 tie / 0 behind in
`examples/helix/benchmark/`; speed pending a PSI key + a public deploy); docs
updated and `AGENTS.md` under 100 lines (✅).

