# Port Map — Body of Health catch-up (2026-11)

Gap analysis of Body of Health `main` (c5712f0, 2026-11-17) against Jeldon
(a9ab4db). One row per item in the catch-up brief. Status: **have / partial /
missing / skip**. Effort: S (< half a day), M (1–2 days), L (multi-day).
Body of Health is the origin, not a consumer: no reuse edges are recorded for
these ports.

Delete this file when the last row ships; history belongs in changesets.

## Correction to the brief

The brief says Jeldon shipped "search analytics for ChiroSmarts" since June.
Nothing in this repo matches (no Search Console code, no commit). If it
exists, it lives in the ChiroSmarts repo and has to be ported in, not reused.
Section 4 below is therefore all **missing**.

## 1. Model layer (breaks API calls today)

| Item | Status | Target | Effort | New pack fields |
|---|---|---|---|---|
| 1a One source of model IDs + picker labels | **done** | config, amplify, aeo-audit | S | `drafting.modelLabels`; amplify + aeo resolve through `drafting.models` |
| 1b No forced `tool_choice` (5.5 returns 400) | **done** | drafting, amplify, competitive-intel | M | — |
| 1c Explicit `output_config.effort`; headroom for thinking | **done** | config, all LLM callers | S–M | `drafting.effort` per mode; raised `maxTokens` defaults |
| 1d Replay `thinking`/`redacted_thinking` with signature | **done** | drafting | S | — |
| 1e `web_search_20260209` | **done** | aeo-audit | S | — (engine constant) |

## 2. AEO audit

| Item | Status | Target | Effort | New pack fields |
|---|---|---|---|---|
| 2a Word-boundary brand match + generic-phrase exclusion | **done** (`@jeldon/config` match + aeo-audit) | aeo-audit | S | `aeo.brandMentionExclusions` |
| 2b Per-engine `redditCitations` | **done** (aeo-audit) | aeo-audit | S | `aeo.trackedCitationHosts` (default `['reddit.com']`) |
| 2c `citations[]` classified who-was-cited | **done** (aeo-audit; source e09c9a7 still unmerged in BoH) | aeo-audit (+ competitive-intel roster) | M | `aeo.citations { topN, directoryHosts, listUrlPattern, listUrlExclusions }` |
| 2d Extraction-first playbook (answer in 1–3, literal nouns in title/H1, liftable block) | **done** (docs, drafting prompts, aeo-audit copy) | docs/AEO-PLAYBOOK, drafting prompts, aeo-audit action copy | S | `strategy.briefChecklist` (optional) |

## 3. Analytics correctness

| Item | Status | Target | Effort | New pack fields |
|---|---|---|---|---|
| 3a Hostname-anchored referrers; Reddit/ChatGPT/Claude/Copilot/Pinterest/Nextdoor | **done** (config + crawler-analytics + strategy) | config, crawler-analytics, strategy (`sumWhere`) | S–M | `RefererChannelRule` → `{ hosts, hostPatterns?, utmSources? }` replacing `needles` (breaking; ship a migrate step) |
| 3b Anchored bot tokens | **done** | config (default value) | S | — |
| 3c Per-route traffic + shared `normalizeSitePath()` | **done** (crawler-analytics) | crawler-analytics | M | `analytics.sitePath { excludePrefixes, excludeFilePattern, maxLength }` |
| 3d Path-keyed engagement beacon | **done** (crawler-analytics + template) | crawler-analytics, template | S–M | `analytics.engagement.pathPattern` |
| 3e Coverage counts live content only | skip for now: no coverage surface exists; rule recorded for when one does | — | — | — |
| 3f Web Vitals diagnostics | **done** (crawler-analytics) | crawler-analytics | M | `analytics.webVitals { rumTypeName, days }` |

Also found: `entity-presence/consistency.ts:32` uses `host.includes()`, the same bug class. Fix it alongside 3a.

## 4. Search Console

| Item | Status | Target | Effort | New pack fields |
|---|---|---|---|---|
| 4a Striking distance (pos 5–15) + low CTR for position | **done** (`@jeldon/search-console`, cli doctor) | new `@jeldon/search-console` + strategy rule | M | `searchConsole { propertyEnv, saKeyEnv, rangeDays, strikingDistance, lowCtr { expectedCtrCurve, ratio } }` |
| 4b Doctor checks for the four look-alike setup failures | **done** (`@jeldon/search-console`, cli doctor) | cli (`doctor --online`) | M | — |
| 4c Snippet lab | **done** (`@jeldon/search-console`, cli doctor) | search-console + store | S–M | `searchConsole.snippetLab { logPath, maxEntries }` |

## 5. Ops observability

| Item | Status | Target | Effort | New pack fields |
|---|---|---|---|---|
| 5a Pipeline freshness ok/late/stale/never + `checkedAt` | done (`@jeldon/ops`; adds `unattestable`) | new `@jeldon/ops` | S | `ops.pipelines[]`, `ops.grading` |
| 5b `::warning` on secret-skip | done (`@jeldon/ops` `skipWithWarning`; template has no crons yet) | ops helper + template | S | — |
| 5c Push retry ×3 with `pull --rebase` | done (`template/.github/actions/commit-and-push`) | template composite action | S | — |
| 5d Attention feed + cadence alerts | done (`@jeldon/ops`) | ops | M | `ops.cadence { articleDays, newsletterDays?, newsletterStuckDays? }`, `ops.links` |
| 5e Dispatch pipeline from dashboard | done (`@jeldon/ops` + static doctor check; no admin route in template) | ops (Actions client) + doctor permission check | M | `ops.dispatch { allowlist, pollSeconds, timeoutMinutes, createdAtSlackSeconds }` |
| 5f `getArticlesBulk` (6 lanes, transient-only retry, partial results) | **done** (store) | store (interface + both adapters) | S | `store.bulk { concurrency, attempts }` (optional) |
| 5g Monthly accuracy-audit prompt | done (`template/docs/accuracy-audit-prompt.md`) | template/docs | S | — |

## 6. Content model, SEO, schema

| Item | Status | Target | Effort | New pack fields |
|---|---|---|---|---|
| 6a Topic clusters (CollectionPage + ItemList, hyphen-boundary hints, ≥2 live, back-links) | **done** (content-model + schema-graph + template) | content-model (matcher), schema-graph (`collectionPageGraph`), template route | M | `content.topicClusters { pathPrefix, minLiveArticles, clusters[] }` |
| 6b `autonomous` provenance; retire `docReviewed` | **done** (docReviewed deprecated, still parsed) | content-model, cli, template | S | frontmatter `autonomous`; deprecate `docReviewed`/`docNotes` (still parsed) |
| 6c Meta-length gate for hand-coded pages | **done** (cli `check-meta-length` + template workflow) | cli `check-meta-length` + template workflow | S | `scoring.seo.staticPages { roots, exclude }` |
| 6d VideoObject (uploadDate required), YouTube facade, `parseYouTubeUrl` | **done** | content-model, schema-graph, template component | S–M | frontmatter `videoUrl`/`videoTitle`/`videoUploadDate` |
| 6e Validate hero image paths on save | **done** | content-model validate + frontmatter guard | S | `content.heroImagePathPrefix` |

## 7. Drafting and ideation

| Item | Status | Target | Effort | New pack fields |
|---|---|---|---|---|
| 7a Transcript miner (URL or paste; private-source prompt; conditional timestamp) | done (`@jeldon/ideation`) | new `@jeldon/ideation` | M | `ideation.transcriptMiner { maxChars, privateSourceGuidance }` |
| 7b Reddit listening → briefs | done (`@jeldon/ideation`) | ideation (+ 2b) | M–L | `listening.reddit { subreddits, brandTerms, genericPhraseExclusions, recency, archivedAfterDays }` |
| 7c Autonomous drafting from a research digest | done (`@jeldon/drafting` runner, `@jeldon/verify` digest adapter; template cron not added) | drafting runner + verify digest adapter + template cron | M | `drafting.autonomous { source, maxDraftsPerRun, relevance }` |
| 7d Backlink finder | done (`@jeldon/drafting`) | drafting (`backlinks.ts`) | M | `drafting.backlinks { chunkSize, internalPathPrefix }` |
| 7e Backlog whitelist lesson | done (`@jeldon/ideation`) | ideation: one Zod `TopicEntry` schema for reader and writer | S | — |

## 8. Amplify

| Item | Status | Target | Effort | New pack fields |
|---|---|---|---|---|
| 8a Reel-script channel | **done** | amplify + config defaults | S | `AmplifyChannel.wordRange`, `hookOptions`, `spokenOnly`; `amplify.ctaPolicy` |
| 8b Retire in-page carousel → Carousel Studio handoff | **done** (builder removed) | amplify (deprecate, add `importToCarouselStudio`) | M | `amplify.carouselHandoff { endpoint, brandId, projectIdPrefix, serviceTokenEnv }`; deprecate `carouselSchemes`/`carouselGuidance`/`carouselStateDir` |
| 8c "Queue in Brevo" | **done** | amplify `scheduleArticleNewsletter()` | M | `amplify.newsletter { sendHour, floorHours }` |

## 9. Talking-head video editor

| Item | Status | Target | Effort | New pack fields |
|---|---|---|---|---|
| Editor (~2,900 lines, mostly browser) | missing; **defer** | new `@jeldon/video` (pure filter/caption/split math + server proxies) | L | `video { transcription, fillers, pauseKeepMs }`, `capabilities.videoEditor`; persona from `voice` |
| Lessons (afade per segment, `is:global`, iOS tap, WORKERFS, 2-min parts + NDJSON keepalive, fixed total gap) | record now | `docs/DECOUPLING-NOTES.md` | S | — |

## 10. Conversion and leads

| Item | Status | Target | Effort | New pack fields |
|---|---|---|---|---|
| First-touch attribution | done (`@jeldon/leads`) | new `@jeldon/leads` + template snippet | S | — |
| Conversion map (greyed < 3 leads) | done (`@jeldon/leads`) | leads | M | `capabilities.leads` |
| Lead trends (date basis, maturing flag) | done (`@jeldon/leads`) | leads | M | uses business timezone |
| Booking import with client-side hashing, generic column automap (Jane = one preset) | done (`@jeldon/leads`) | leads | M | `leads.bookingImport { presets, headerPatterns }` |
| WebCrypto service-account JWT; header flattening | done (`@jeldon/google`) | new `@jeldon/google` | S | — |
| Mailbox response tracking | done (`@jeldon/leads/compliance`) | **compliance pack only** | L | `compliance.mailbox` |
| RequestSheet / StickyActions / EndCap / OpenNow | partial: pack data + `requestContextFor` done (`@jeldon/leads`); template components not built | template components + pack data | M | `conversion.requestContexts` |

## 11. Template and site ops

| Item | Status | Target | Effort | New pack fields |
|---|---|---|---|---|
| 11a Site alert | **done** (`@jeldon/site-alert` + template `SiteAlert.astro`); admin page + save API still to port | new `@jeldon/site-alert` + template component + admin page | M | `brand.contact { email, phoneDisplay? }`, `siteAlert { limits, presets?, pollTimeoutMinutes, … }`; timezone = `content.timezone` |
| 11b Holiday hours merge | **done** (`@jeldon/business-info`, schema-graph `openingHoursSpecification`, template `OpenNow.astro` + `scripts/fetch-hours.mjs`) | schema-graph `openingHoursSpecification` + fetch/merge | M | `brand.hours`, `services.places { apiKeyEnv, placeIdEnv }` |
| 11c Middleware hardening (fail-closed, canonical path, route pattern) | **done** (`@jeldon/access` + template `src/middleware.ts`) | new `@jeldon/access` + template `middleware.ts` | S–M | `security { adminPrefixes, access { teamDomain, aud } }` |
| 11d Astro findings | **done** (template astro `^5.18.0`, cloudflare `^12.6.13`, Node `>=22.18`, Workers `wrangler.toml`; Astro 6/7 notes in `docs/MIGRATION.md`) | template | S | — |

## Skip

Imaging-request PDF form, staff roster, award copy, Jane-only field names,
individual article edits. The client-side PDF pattern is flagged as a possible
future compliance-pack recipe; not built.

## Proposed order

1. **Model layer (1a–1e).** One changeset per affected package. Calls fail against 5.5 today.
2. **Matching correctness (2a, 2b, 3a, 3b + entity-presence host match).** Same bug class; 3a changes the `RefererChannelRule` shape, so it is a minor bump with a migrate note.
3. **Cheap content/schema wins (6b, 6c, 6e, 5f, 1e-adjacent 2d copy).**
4. **Analytics depth (3c, 3d, 3f).**
5. **Ops package + template crons (5a–5e, 5g).**
6. **Search Console (4a–4c),** after Codey confirms whether a ChiroSmarts version exists.
7. **Content features (6a, 6d), amplify (8a–8c), AEO `citations[]` (2c, once merged).**
8. **New modules (7a–7e ideation, 10 leads, 11a–11c).**
9. **Video editor (9):** deferred; lessons recorded in step 3.
