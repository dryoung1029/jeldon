---
"@jeldon/config": minor
"@jeldon/schema-graph": minor
"@jeldon/benchmark": patch
"@jeldon/kit-local-business": minor
"@jeldon/cli": patch
---

Findings from benchmarking the spawned Helix build against the live site.

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
