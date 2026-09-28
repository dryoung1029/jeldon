# @jeldon/benchmark

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

### Patch Changes

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

- Updated dependencies [bf4c098]
- Updated dependencies [7eda101]
- Updated dependencies [abbe8d4]
- Updated dependencies [bf4c098]
- Updated dependencies [ad8969c]
- Updated dependencies [7a8b556]
  - @jeldon/config@0.1.0
  - @jeldon/competitive-intel@0.1.0
  - @jeldon/core-scoring@0.1.0
  - @jeldon/kit-local-business@0.1.0
