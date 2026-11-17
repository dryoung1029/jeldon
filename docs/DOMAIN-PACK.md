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
`brandMentions` (prose-mention detection, matched as whole terms), optional
`brandMentionExclusions` (term → regex sources for generic phrasings that
contain the term but aren't a mention, e.g. "a growing body of health research"),
optional `localSearchLocation` (omit for non-local verticals), `querySet` (the
queries audited), `engines` (`perplexity` | `anthropic` | `google-aio` |
`openai`), `highPriorityTags`, optional `model` (alias into `drafting.models`).

### `drafting` (optional)
`models` (alias → model id; the one place IDs live), `modelLabels` (picker
text), `defaultModel`, `utilityModel`, `effort` (per-purpose
`low`/`medium`/`high`/`max`, with a `default`), `maxTokens` per mode (thinking
counts toward these, so leave headroom), `draftFloor`, `wordCountTarget`.
Optional `autonomous` (`source`, `maxDraftsPerRun`, `digestDays`,
`relevance { topics, requireTopic, requirePriorityKeyword }`, `category`,
`coverageTitleChars`, `promptTemplate`): absent means the autonomous runner
reports `not_configured`. Optional `backlinks` (`chunkSize` default 8,
`internalPathPrefix`, `maxTokens`, `minAnchorChars`).

### `ideation` (optional)
`transcriptMiner` (`maxChars` 200 000, `minChars` 400, `publishedSourceNoun`,
`listenCalloutLabel`, `maxProposals`, `privateSourceGuidance`,
`publishedSourceGuidance`, `anchorEverySeconds`, `maxTokens`, `model`) and
`backlog.path`. Gated by `capabilities.ideation`.

### `listening` (optional)
`reddit`: `geoSubreddits`, `conditionSubreddits`, `brandTerms`,
`genericPhraseExclusions` (falls back to `aeo.brandMentionExclusions`),
`serviceKeywords`, `targetSearches`, `retentionDays`, `maxItems`,
`archivedAfterDays` (175), `staleAfterDays`, `stalePenalty`, `recency` bands,
`competitorMinNameLength`, `maxTargets`, `userAgent`, request pacing. Competitor
names come from `competitors.roster`. Read-only: nothing in the engine posts.
Gated by `capabilities.listening`.

### `analytics` (optional)
`refererChannelMap` rules match the referer **hostname**, never a substring:
`hosts` (exact or parent domain), `hostPatterns` (anchored regex, e.g.
`(^|\.)google\.`), `utmSources` (exact tokens, checked first), and
`hostContains` as a last resort. `ownHosts` lists your own domains; the host of
`brand.siteUrl` is added automatically by `analyticsConfigFromPack`.
`botUaPattern` tokens must be bot-specific (`pinterestbot`, not `pinterest`).

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
`competitiveIntel`, `engagementAnalytics`, `entityPresence`, `ideation`, `listening`. Turn on only what
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
