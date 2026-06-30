# The Domain Pack (`jeldon.config.ts`)

One typed file, default-exporting a `DomainPack`, validated against the Zod
schema in `@jeldon/config` (and the JSON Schema in `schemas/`). This is the only
file a consumer project edits to specialize the engine. Authoritative type:
`packages/config/src/types.ts`. Golden filled example:
`template/examples/jeldon.config.example.ts`.

Author it with the type-safe helper:

```ts
import { defineDomainPack, defaultScoringConfig } from '@jeldon/config';
export default defineDomainPack({ /* ... */ });
```

## Field reference

### `brand`
Identity that was hardcoded everywhere in the source system. `name`, `siteUrl`
(single canonical host, threaded through schema/sitemap/OG), optional `tagline`,
`geoFraming` (arbitrary, e.g. "Corvallis and Albany"), `nap` (local-business
address/phone/placeId), `logoUrl`, `brandColors`.

### `authors`
Array of author identities. Each has a `slug`, `name`, a `schemaId` (the `@id`
every Article graph links to for E-E-A-T consolidation), and a `profile`
(`PersonProfile`: credentials, `knowsAbout`, `memberOf`, `awards`, `sameAs`).
`content.defaultAuthorSlug` must match one of these slugs.

### `voice` — the single source for all prompt injection
`persona`, `bannedTopics`, `bannedPhrasings`, freeform `rules`,
`voiceAnchorUrls` (canonical tonal-reference articles), `readingGradeBand`.
Every drafting/amplify/competitive prompt injects this block — there is exactly
one copy (the source system hand-duplicated it across four files; do not).

### `content`
`categories` (the valid category enum), `categoryTargets` (GEO target per
category — each ≥ `scoring.geo.floor`), `defaultAuthorSlug`, `timezone`, optional
`lifecycle.docReviewed` to enable the extra review state. Optional `tags` — a
curated tag vocabulary: when set, the drafting generator picks an article's tags
from it (and a deterministic reconcile pass backfills by relevance) so every
draft lands in the `scoring.seo.tags` band and the taxonomy stays consistent;
omit/empty for free-form tags.

### `scoring`
- `geo.floor` — CI gate threshold (must be ≤ the lowest `categoryTarget`).
- `geo.checks` — the six (or N) weighted checks. **Detection is data**: each
  check has `kind` (`regexCount` | `regexPer1k` | `questionH2`), `patterns`
  (regex sources, or starter words for `questionH2`), `target` (`cleaned` |
  `body`), `weight`, and `thresholds: [good, meh]`. **This is where a non-health
  domain diverges most** — point `citation.patterns` at your real sources
  (RFCs, case law, CVEs) and rewrite the `firstPerson` markers.
- `seo` — bands for title/excerpt/word-count/H2/links/tags/hero-alt/reading,
  plus `internalLinkPrefixes`, `referenceSectionNames`, `evidenceTriggers`,
  `badFilenameRe`. Start from `defaultScoringConfig.seo` and override.

### `citation`
`policy` (`direct-source-urls` | `search-urls-only` | `verifier-required` — an
explicit per-domain choice that resolves the lint-vs-verifier contradiction),
`forbiddenPatterns` (lint regexes, e.g. a fabricated-ID guard), `referenceFormat`,
and `verifier` (`none` | `cite8` | `primary-source`).

### `aeo`
`brandMentions` (prose-mention detection), optional `localSearchLocation` (omit
for non-local verticals), `querySet` (the queries audited), `engines`
(`perplexity` | `anthropic` | `google-aio` | `openai`), `highPriorityTags`.

### `competitors` (optional)
`roster`, `targetKeywords`, our `ourPlaceId`/`ourName`/`localPackLocation`,
`highValuePatterns`/`skipPatterns`, `templateVendors` fingerprints.

### `schema`
`orgType` (default `["Organization"]`; add `LocalBusiness` for local),
`org` (`OrgProfile`), `articleTypes` (`["Article"]` generic, or add
`MedicalWebPage`/`TechArticle`/etc.), optional `publishingPrinciplesUrl`,
`emitLlmsTxt` (default `false` — cheap to emit, never a ranking pillar).

### `compliance` (optional)
`pack` (`none` default, or `hipaa`/`legal`/`finance`/custom),
`reviewResponseRules`, `requireHumanReviewTags`. **HIPAA-class behavior is opt-in
here, never in the engine.**

### `capabilities`
Booleans gating growth surfaces: `drafting`, `amplify`, `audio`, `heroImages`,
`competitiveIntel`, `engagementAnalytics`, `entityPresence`. Turn on only what
you use; disabled surfaces are absent from the build.

### `services`
`store` (`github` | `fs`), `analytics` (`cloudflare` | `none`), and
`requiredEnv` — the list `jeldon doctor` verifies. Include every secret the
enabled capabilities need.

## Validation invariants (enforced by the schema, surfaced by doctor)

- `scoring.geo.floor` ≤ `min(content.categoryTargets)`.
- every key in `categoryTargets` ∈ `content.categories`.
- `content.defaultAuthorSlug` matches an `authors[].slug`.
- `aeo.querySet` non-empty; `aeo.engines` non-empty.
