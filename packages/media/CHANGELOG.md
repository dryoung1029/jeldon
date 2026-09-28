# @jeldon/media

## 0.1.0

### Minor Changes

- bf4c098: Initial release of the Jeldon engine as `@jeldon/*` 0.1.0. Every package now
  declares `publishConfig.access`, `files: ["dist"]`, `repository`,
  `sideEffects: false`, and types-first `exports`. The license stays
  `UNLICENSED` (private/proprietary; see the root README).

### Patch Changes

- abbe8d4: Engine fixes from the Helix Training build (the second Jeldon consumer):

  - **Article URL prefix is config** (#3). `content.articlePathPrefix` (default
    `/articles/`) and `authors[].urlPrefix` (default `/team/`) are Domain Pack
    values, normalized on parse. `@jeldon/config` exports pure helpers
    (`articlePath`, `articlePathPrefix`, `articlePathPattern`, `authorPath`,
    `resolveStrategyConfig`, `resolveAnalyticsConfig`); schema-graph's Article
    canonical, inline-Person fallback and sitemap exclusions, amplify's article
    URLs, media's podcast item links, drafting's cross-link hints and knowledge
    inventory all read them. A `/blog/` site no longer string-rebases JSON-LD.
  - **competitive-intel** (#9): meta/link extraction is attribute-order
    agnostic (`metaContent`, `linkHref`, `tagAttr`), so `<meta content=… name=
"description">` is no longer reported MISSING; `runAudit` runs schema
    extraction and template-vendor detection on the document it already fetched
    instead of re-fetching, so a rate-limited second request can no longer hide
    PushPress/Webflow fingerprints. Fixture + tests.
  - **Doctor check registry** (#10): a project or kit registers checks in
    `jeldon.checks.mjs` (`[{ id, run(ctx) }]`); `jeldon doctor` runs them after
    the pack checks and traps throws as errors. Doctor also warns when
    `scoring.seo.internalLinkPrefixes` omits the article prefix.
  - **`jeldon check-geo-floor`** scores drafts when a file is named explicitly
    (drafts are skipped only in the no-argument scan).
  - **`jeldon score <file>`** prints GEO + SEO + FKGL for one file as JSON or a
    plain-words scorecard.
  - **Agent drafting mode**: `capabilities.drafting: 'agent' | 'api' | boolean`
    (`true` = `api`). `@jeldon/drafting` exports `buildAgentBrief(pack, opts)`
    — the same voice block, GEO playbook, citation rules, tag vocabulary and
    frontmatter shape the API pipeline uses, rendered for a coding agent — and
    `jeldon brief <topic>` prints it. Doctor does not demand an LLM key in
    agent mode.
  - **`@jeldon/crawler-analytics`** gains `parseSearchConsoleExport()` and
    friends: pure parsing/aggregation of Search Console CSV exports (the no-API
    owner path) plus `renderSearchConsoleReport()`.
  - Template: Astro 5 content layer (`src/content.config.ts`, `glob` loader,
    `id` + `render()`), `wrangler.jsonc` (`main` + `assets`, `nodejs_compat`),
    `session: { driver: 'memory' }`, anchored `.gitignore`, `public/.assetsignore`
    with `_worker.js`, npm scripts that call each tool's JS entry directly, a
    CI step asserting the engine resolves and a `wrangler deploy --dry-run`
    step, and `scripts/smoke-template.mjs` in the engine repo that installs the
    template with npm and runs every consumer gate.

- d64f69e: `proposeHeroConcept` is no longer described as a stub: its injected
  `ConceptProposer` now has a ready adapter — `@jeldon/drafting`'s
  `LlmConceptProposer` — so the doc comment points there and the `TODO(port)`
  marker is removed. No behavior change.
- Updated dependencies [bf4c098]
- Updated dependencies [7eda101]
- Updated dependencies [abbe8d4]
- Updated dependencies [bf4c098]
- Updated dependencies [7a8b556]
  - @jeldon/config@0.1.0
