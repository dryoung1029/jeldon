# @jeldon/kit-local-business

## 0.1.0

### Minor Changes

- ad8969c: New package `@jeldon/kit-local-business` — the Local Business Kit extracted
  from the Helix Training build and generalized. Isomorphic root: `KitConfig`
  (+ Zod schema, `defineKitConfig`), vocabulary presets (`gym`, `clinic`,
  `studio`, `shop`, `generic`) with `resolveLabels`, per-vertical scoring presets,
  design tokens from `brand.brandColors` + `brand.fonts` (`buildGlobalCss`,
  derived shades, light/dark), `openingHoursSpec`, the contact handler
  (`handleContact` / `processContact`) with `LeadSink` adapters (pushpress,
  gohighlevel, brevo-contact, none) and `Notifier` adapters (brevo, resend,
  none), the PushPress adapter, booking adapters + vendor recognition, the
  redirect generator (`planRedirects` → `_redirects` + `OLD-URLS.md` from one
  plan), `serviceNode`, and `complianceCopy` — the one place the kit reads the
  compliance pack. Node entry (`/node`): `loadKitConfig`, `kitChecks()` for the
  doctor registry, `sendTestContact`, `buildTrafficReport`. The Astro overlay
  lives in `kits/local-business/` (neutral page set, label-driven copy, content
  collections for services/team/faqs, the contact route, CI + nightly rebuild,
  workbench scripts) with the agent-kit templates under `kits/local-business/agent/`.
  `competitive-intel` exports `listSitemapUrls`.
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

### Patch Changes

- Updated dependencies [bf4c098]
- Updated dependencies [7eda101]
- Updated dependencies [abbe8d4]
- Updated dependencies [bf4c098]
- Updated dependencies [7a8b556]
  - @jeldon/config@0.1.0
  - @jeldon/crawler-analytics@0.1.0
