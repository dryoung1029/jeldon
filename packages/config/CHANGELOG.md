# @jeldon/config

## 0.1.0

### Minor Changes

- bf4c098: Split `@jeldon/config` into two entry points. The root (`@jeldon/config`) is
  isomorphic — types, the Zod schema, defaults, `validateDomainPack`,
  `defineDomainPack`, and the new pure URL helpers — with no `node:*` or jiti
  in its static import graph, so a Cloudflare Worker route can import it
  without dragging the filesystem loader into the bundle (Helix finding #8).
  The loader (`loadDomainPack`, `resolveConfigPath`) moves to
  `@jeldon/config/load`. The root keeps a `loadDomainPack` shim that defers to
  `./load` through a dynamic import; it is deprecated and is removed in 0.3.
  A test greps the built dist to prove the root graph is `node:`-free. The CLI
  imports the loader from `@jeldon/config/load`.
- 7eda101: Add an optional `content.tags` curated tag vocabulary to the Domain Pack. When
  set, the article generator (`@jeldon/drafting`) draws an article's tags from this
  list — and backfills by relevance — so every draft lands in the SEO
  `scoring.seo.tags` band and the site's taxonomy stays consistent for topic
  clustering. Omit or leave empty to let the generator invent free-form tags. The
  JSON Schema (`schemas/domain-pack.schema.json`) is regenerated accordingly.
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
- 7a8b556: Findings from benchmarking the spawned Helix build against the live site.

  - **`@jeldon/config`** — `content.noindexPaths` (optional): paths the site
    serves with `noindex`. **`@jeldon/schema-graph`** —
    `sitemapExcludedArticleUrls` drops them from the sitemap (both trailing-slash
    forms), so a noindexed thank-you page is never also advertised to crawlers.
  - **`@jeldon/kit-local-business`** — `planRedirects` takes `teamSlugMap`;
    `matchSlug(old, candidates)` pairs an old slug with the new one by shared
    name tokens ("dr-mel-mcnulty" → "mel-mcnulty"). The overlay gains one page
    per team member (`team/[slug].astro`, Person node; the owner's page reuses
    the pack author `@id`), clamps titles at a sentence/word boundary and only
    appends the brand suffix within the ~60-char budget, gives legal/members
    pages real indexable status (noindex + sitemap contradicted each other), and
    writes descriptions a searcher can act on for schedule/about/person pages.
  - **`@jeldon/benchmark`** — a control nested in `<label>` counts as labelled;
    "FAQs render here" now looks at headings, not a nav link named FAQ; the
    content-depth measure counts unique indexable pages (duplicate-intent twins
    and placeholder paths excluded) and the fix list says what the old site has
    more of when the new site has no flagged issue of its own.
  - **`jeldon init`** — team pages move with `routes.team`, `noindexPaths`
    carries the thank-you route, old person URLs redirect to the matching new
    person page.
