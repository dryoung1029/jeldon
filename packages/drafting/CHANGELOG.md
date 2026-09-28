# @jeldon/drafting

## 0.1.0

### Minor Changes

- d64f69e: Wire hero-image concept + alt-text generation. Adds `LlmConceptProposer`, the
  `ConceptProposer` adapter over the package's `LlmProvider` that activates
  `@jeldon/media`'s `proposeHeroConcept` (forces the `propose_image` tool, parses
  the result) — the Anthropic round-trip media deliberately left to the drafting
  layer. Also exports `proposeHero` (convenience over `proposeHeroConcept`),
  `heroInputFromMarkdown` (build a `HeroConceptInput` from a draft), and
  `setHeroAlt` (surgically write `heroImageAlt` into frontmatter). Internal
  frontmatter helpers are consolidated into one `fm-lite` module so the tag and
  hero post-processors don't each grow their own parser. Image-byte generation +
  writing the `heroImage:` path is the follow-up.
- 65e0741: Add `generateHeroForDraft` — the full hero pipeline for a drafted article:
  propose a concept + alt-text, generate the image via `@jeldon/media`'s
  `generateHeroImage`, persist the bytes, and write both `heroImage` (the public
  path) and `heroImageAlt` into the draft's frontmatter — the two fields the SEO
  scorer rewards. It is a deliberate no-op (content untouched, `changed: false`)
  when the `heroImages` capability is off or no `ImageGen`/`ObjectStore` is wired,
  so a host can call it unconditionally and let config decide. Also exports
  `setHeroImage`.
- 7993c30: Wire optional hero generation into the `draft()` loop. When `DraftDeps.hero`
  (proposer + `ImageGen` + `ObjectStore`) is provided and the `heroImages`
  capability is on, each finished draft — single and per series sibling — gets a
  generated hero image + alt-text written into its frontmatter and is re-scored so
  the reported SEO reflects it. Hero runs after the fix-pass (which rewrites
  frontmatter and would otherwise clobber the fields). Omitting `hero` keeps hero
  deferred past draft time (the unchanged default). Also: re-run `reconcileTags` on
  fix-pass output (the fix-pass returns full frontmatter, so tags need reconciling
  again), and export a pure `scoreContent` helper for cheap re-scoring.
- 6edca9e: Generate consistent, in-band tags for every draft. The draft prompts now instruct
  the model to choose tags from the pack's `content.tags` controlled vocabulary (or
  free-form when none is set), targeting the SEO `scoring.seo.tags` band. A
  deterministic `reconcileTags` pass runs in the draft loop before scoring: it keeps
  the model's in-vocabulary choices, drops invented ones, backfills by relevance to
  reach the band minimum, and clamps to the maximum — so the reported score reflects
  the tags the article ships with, and the site taxonomy stays consistent for topic
  clustering. Backfill tags come only from the curated vocabulary (no fabrication).
  Exports `selectTags` and `reconcileTags`.
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

- bf4c098: Initial release of the Jeldon engine as `@jeldon/*` 0.1.0. Every package now
  declares `publishConfig.access`, `files: ["dist"]`, `repository`,
  `sideEffects: false`, and types-first `exports`. The license stays
  `UNLICENSED` (private/proprietary; see the root README).

### Patch Changes

- Updated dependencies [bf4c098]
- Updated dependencies [7eda101]
- Updated dependencies [abbe8d4]
- Updated dependencies [bf4c098]
- Updated dependencies [7a8b556]
- Updated dependencies [d64f69e]
  - @jeldon/config@0.1.0
  - @jeldon/media@0.1.0
  - @jeldon/core-scoring@0.1.0
  - @jeldon/store@0.1.0
  - @jeldon/verify@0.1.0
