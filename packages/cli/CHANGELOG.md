# @jeldon/cli

## 0.1.0

### Minor Changes

- a4b3b0d: **`@jeldon/benchmark`** — the standing directive, enforced. `snapshotSite(url)`
  fetches home + sampled pages + sitemap + robots (+ PageSpeed when enabled) and
  `analyzePage` extracts the same facts from both sites; `measureAll` scores ten
  dimensions (speed, search hygiene, duplicate-intent URLs, structured data,
  citability via `@jeldon/core-scoring`, content depth, conversion path,
  accessibility, honesty, local) as higher-is-better numbers; `compare` yields
  win / tie / behind / unmeasured with one rule; `buildScorecard` +
  `renderScorecardMarkdown` produce the table, the three biggest wins in plain
  words and the fix list; `captureBaseline` stores the OLD site on day one.
  Injected fetchers make every dimension unit-testable without network.

  **`jeldon init`** — the spawn. `jeldon init [dir] --kit local-business
--name … --url … --from <old site> --answers <file> --crm … --notify …`:
  scrapes the old site with competitive-intel (title/description, NAP from
  schema, phone, social links, logo, nav labels, every sitemap URL, blog posts
  → migrated drafts, booking/checkout vendors by host, GSC tag, template
  vendor), stores `data/benchmark/baseline.json`, interviews (or reads
  `--answers`; every scraped fact is "I found X — keep it?" and lands with a
  `SETUP:` marker until confirmed), generates the pack from a per-vertical
  scoring preset, the kit config, service/team/FAQ content, `_redirects` +
  `OLD-URLS.md` from one redirect plan, the rendered agent kit, CI, README, and
  verifies with `npm install` + validate + doctor + both builds. The answers
  schema is published at `schemas/init-answers.schema.json`
  (`@jeldon/cli/answers`); `examples/helix.answers.json` reproduces the Helix
  reference consumer. **`jeldon benchmark`** — `--old <url> --new <url>`,
  `--old <url>` (baseline only), `--ci` (compare NEW to the stored baseline;
  exit 1 on any behind). Writes `data/benchmark/scorecard-<date>.md`,
  `latest.json`, `baseline.json`.

- 8493eef: Add the `jeldon check-geo-floor [file…]` subcommand. It scores articles with the
  same `@jeldon/core-scoring` the editor dial uses (no mirrored scoring logic) and
  exits non-zero if any live article is below its category target — the GEO floor
  is the backstop for categories with no explicit target. With no file arguments it
  scans every `.md` under `services.contentDir` (default `src/content/articles`);
  drafts are skipped. `--json` emits a machine-readable report. This promotes the
  template's `check-geo-floor.mjs` CI step to a first-class command so consumers can
  drop the script.
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

- Updated dependencies [a4b3b0d]
- Updated dependencies [bf4c098]
- Updated dependencies [7eda101]
- Updated dependencies [d64f69e]
- Updated dependencies [65e0741]
- Updated dependencies [7993c30]
- Updated dependencies [6edca9e]
- Updated dependencies [abbe8d4]
- Updated dependencies [bf4c098]
- Updated dependencies [ad8969c]
- Updated dependencies [7a8b556]
  - @jeldon/benchmark@0.1.0
  - @jeldon/config@0.1.0
  - @jeldon/drafting@0.1.0
  - @jeldon/competitive-intel@0.1.0
  - @jeldon/core-scoring@0.1.0
  - @jeldon/content-model@0.1.0
  - @jeldon/kit-local-business@0.1.0
