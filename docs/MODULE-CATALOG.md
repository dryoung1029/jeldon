# Module Catalog

Per-package reference: what it does, what BoH source it extracts from, its public
API, the config it reads, and the capability flag it sits behind. Status legend:
**✅ built** (compiles + typechecks + tests; a real port) · **🟡 partial** · **⬜ planned**.

> All 15 packages build + typecheck + test green, integration-verified against
> the `jeldon-core` workspace. Remaining `TODO(port)` markers are intentional
> gaps (named per package below), not unfinished scaffolding.

## Ranking Core (v1)

### `@jeldon/config` — ✅ built
The Domain Pack contract: types, Zod schema, defaults, loader (`loadDomainPack`,
`validateDomainPack`, `defineDomainPack`). Depends only on `zod` + `jiti`.
Extracts the `site-config.ts` env→JSON→default precedence pattern.

### `@jeldon/core-scoring` — ✅ built
`calculateSeo(input, cfg)`, `calculateGeo(input, cfg)`, `fleschKincaidGrade`,
`scoreArticle(input, scoring)`. Isomorphic (browser + Node) — kills the
scorer-mirror drift. Extracts `seo.ts` + the inline editor mirror +
`check-geo-floor.ts`.

### `@jeldon/content-model` — ✅ built
Frontmatter codec, lifecycle state machine (draft→docReviewed→ready→
scheduled→live), Zod article schema built from `content.categories`,
`validateArticle`, `publishScheduled`. Extracts `frontmatter.ts`, `articles.ts`,
`content/config.ts`, `publish-scheduled.mjs`. Consolidates the triple-implemented
parser.

### `@jeldon/schema-graph` — ✅ built
`organizationGraph`, `personGraph`, `articleGraph`, `breadcrumbList`,
`extractFaqs` (verbatim-portable), `faqPage`, `emitLlmsTxt`. Reads `pack.schema`
+ author profiles. Extracts `schema.ts` + inline `BaseLayout`/page literals.

### `@jeldon/store` — ✅ built
`interface Store` + `GitHubStore` (SHA-conflict re-fetch/merge preserving
out-of-band frontmatter) + `FsStore`. Extracts `github.ts` + the `[slug]` PUT
merge logic. Reads `services.store` + GitHub env.

### `@jeldon/aeo-audit` — ✅ built
`runAudit(querySet, brandMatch, engines)` with a pluggable engine registry
(Perplexity / Anthropic web_search / Google AIO) + `aggregate(store)`. Extracts
`aeo-audit.mjs` + `command/aeo.ts`. Pure Node, zero host coupling — the
highest-value portable asset. Reads `pack.aeo`. `TODO(port)`: the OpenAI engine
(`ENGINE_BUILDERS.openai`) returns null — it was never implemented in BoH either.

### `@jeldon/verify` — ✅ built
`interface ClaimVerifier` + `Cite8Verifier` (health plugin) + `NullVerifier`
(default) + `PrimarySourceVerifier` (generic resolvable-link). `lintCitations`
reads `citation.forbiddenPatterns`. Extracts `cite8.ts`, `lint-citations.mjs`.

### `@jeldon/strategy` — ✅ built
`buildRecommendations(inputs, ruleSet, cfg)` — deterministic, evidence-backed.
Thresholds/copy/deep-links/category-targets externalized; audio/podcast/AEO
rules opt-in. Extracts `strategy.ts`.

### `@jeldon/cli` — ✅ built (validate + doctor; init/audit/migrate pending)
`jeldon validate | doctor [--pre] [--online] [--json] | fetch-search-console`. `check-geo-floor`, `audit`,
`migrate`, and Copier-backed `init` are 🟡. Extracts `check-geo-floor.ts` +
new code.

## Growth modules (v2+)

| Package | Status | Extracts from | Capability flag |
|---|---|---|---|
| `@jeldon/drafting` | ✅ | `author.ts`, `site-knowledge.ts`, `voice-memory.ts`, `priority-keywords.ts`, `chat.ts` | `drafting` |
| `@jeldon/amplify` | ✅ | amplify, carousel-import and newsletter-schedule endpoints, `brevo-campaigns.ts`, `auto-newsletter.mjs` | `amplify` |
| `@jeldon/media` | ✅ | `narration.ts`, audio/image routes, `podcast.xml.ts`, R2 proxies | `audio`, `heroImages` |
| `@jeldon/competitive-intel` | ✅ | `competitor-scanner.ts`, `audit-competitors.mjs`, `competitor-gap-report.ts`, `keyword-ranks.ts` | `competitiveIntel` |
| `@jeldon/crawler-analytics` | ✅ | `ai-crawlers.ts`, `fetch-cf-analytics.mjs`, `article-analytics.ts`, `api/track.ts` | `engagementAnalytics` |
| `@jeldon/leads` | ✅ | `request-context.ts`, BaseLayout first-touch block, `api/contact.ts` sanitising, `api/admin/leads.ts`, `lead-trends.ts`, `reach/conversion-map.ts`, `leads/import-bookings.ts` + the leads page hashing | `leads`, `conversionMap` |
| `@jeldon/google` | ✅ | `google-auth.ts`, `gmail.ts` (send half) | — |
| `@jeldon/entity-presence` | ✅ (scaffold) | NEW — off-site brand-mention + per-engine citation-pattern signals | `entityPresence` |
| `@jeldon/search-console` | ✅ | `fetch-search-console.mjs`, `api/admin/command/search.ts`, `api/admin/snippets*.ts` | `searchConsole` |

> `@jeldon/entity-presence` is the one module **not** in the source system. The
> audit flags off-site mentions as correlating ~3× stronger with AI citation
> than backlinks — the biggest lever on-page-only optimization can't reach. See
> `docs/AEO-PLAYBOOK.md`.

### `@jeldon/ops` — ✅ built (capability `ops`)
Ops observability. `pipelineStatus(entry, now, grading)` grades a cron-fed file
ok / late / stale / never against its cadence (ok ≤ 1.5×, late ≤ 3×, from
`ops.grading`), plus `unattestable` when a timestamp does not parse or a
change-gated file has no `checkedAt`. Change-gated files are graded on the
check stamp, which `gradePipelines(ops.pipelines, read)` always reads from the
pipeline's own file (the proof must come from the step that owns it).
`buildAttention(producers)` merges injected producers into one bad → warn →
info list; a throwing producer becomes a `bad` item. Producers:
`pipelineAttention`, `cadenceAttention` (+ `lastPublishedArticle`,
`lastNewsletterSent`), `autonomousDraftAttention`, `missingHeroAttention` (live
only), `stuckNewsletterAttention`, `readFailureAttention`.
`createActionsClient` (injected `fetch`, allowlist enforced before any call,
403/404 name the "Actions: Read and write" fix), `findRunAfter` (ignores the
pre-read run and runs created before the click minus slack), `dispatchAndWait`.
`skipWithWarning(name, missing)` prints a `::warning::` for crons that skip.
`checkOpsConfig` backs the doctor check. Extracts `command-stats.ts`
(pipelineStatus, attention, RUNNABLE_WORKFLOWS), `site-config.ts` (cadence),
`github.ts` (dispatch), `api/admin/pipelines/run.ts`, the `/admin` polling
loop, and the cron `::warning` pattern. Template ships
`.github/actions/commit-and-push` (push retry ×3 with `git pull --rebase`) and
`docs/accuracy-audit-prompt.md`.

### `@jeldon/search-console`
Service-account auth signed with WebCrypto (Workers-safe; key raw or base64),
`fetchSearchAnalytics` / `fetchSnapshot` / `listSites` over an injected
`fetch`. Pure `strikingDistance` and `lowCtr` (curve + thresholds from
`pack.searchConsole`). Snippet lab: `applySnippetChange` rewrites title/excerpt
through `Store`, logs the SC numbers at change time (capped), and
`compareSince` diffs them against current rows; limits come from
`scoring.seo`. `diagnoseSearchConsoleError` names the fix for the look-alike
setup failures (empty secret, API not enabled, SA not a user, property-string
mismatch); anything else is `unattestable`. Backs `jeldon doctor [--online]`
and `jeldon fetch-search-console` (template cron `fetch-search-console.yml`).

### `@jeldon/leads` — ✅ built
Pure lead maths. `sanitizeAttribution` (path-only landing, hostname-only
referrer, whitelisted UTMs, clamped phone taps) + `attributionSnippet(cfg)` for
the layout; `leadChannel` via `classifyReferer`; `buildTrends` (date basis
`lead|booking`, buckets in the business timezone, Monday weeks, `maturing` from
the median lead→booking lag, `maturity: 'unknown'` when nothing has booked);
`buildConversionMap` (views → leads → booked per page and channel, `lowSample`
under `conversion.minLeads`); booking import (`normEmail`, `normPhone`,
`hashId`, `hashBookingRow` for the browser, `sanitizeHashedRows` +
`matchBookings` for the server, `automapColumns` over preset DATA);
`requestContextFor`; `leadsOptionsFromPack`. Template request-sheet /
sticky-actions / end-cap / open-now components are not built yet.

**`@jeldon/leads/compliance` — compliance-pack material.** Mailbox response
tracking (`createMailboxTracker`): reply timing with the system's own
notification excluded, keyword outcome rules reduced to codes (text never
returned), decline reasons only after a decline, `reachedVia` (booked > email
> phone tap > worked). Throws `MailboxComplianceError` unless
`compliance.pack` is set and `compliance.mailbox.enabled` is true.

### `@jeldon/google` — ✅ built
`parseServiceAccount` (raw or base64 JSON), `getAccessToken({ sa, scopes, sub,
fetch, cache })` — WebCrypto RS256 JWT-bearer grant with domain-wide delegation,
token cache, named `unauthorized_client` / `invalid_grant` errors.
`buildRawEmail` / `buildMimeMessage` — every header value flattened (CR/LF
stripped), RFC 2047 for non-ASCII, headers and body joined by exactly one
blank line; `sendRawEmail` with an injected fetch. Mailbox reading is not
ported (it belongs with the compliance module's caller).

## Site ops

### `@jeldon/site-alert` — ✅ built (`capabilities.siteAlert`)
One admin-editable site-wide pop-up. Pure + isomorphic: `alertState(alert,
nowInZone)` on wall-clock strings in `content.timezone` (checked in the
browser, so schedules need no rebuild), `messageHtml` (escape all; link only
`https://` + emails), per-revision `dismissalKey`, `normalizeAlert` with
`siteAlert.limits`, `presetAlerts`, and `waitForLiveVersion` for the admin
"poll until live" check. Template: `src/components/SiteAlert.astro` +
`src/data/site-alert.json`. The admin page / save API are not ported yet.
Extracts BoH `site-alert.ts`, `SiteAlert.astro`.

### `@jeldon/access` — ✅ built (always on when the template has admin routes)
`canonicalPath`, `isProtected(path, routePattern, prefixes)`,
`verifyAccessJwt` (RS256 via WebCrypto, JWKS cache, refetch on unknown kid,
iss/aud/exp/nbf), `createAccessMiddleware` — fails closed (500) without
`security.access`. Template: `src/middleware.ts`. Extracts BoH `middleware.ts`.

### `@jeldon/business-info` — ✅ built (`capabilities.businessHours`)
`fetchPlaceHours` (injected fetch), `mergeSpecialHours`, `refreshHoursData`,
`isOpenNow` / `describeOpenStatus` in `content.timezone`. JSON-LD lives in
schema-graph (`openingHoursSpecification`, `specialOpeningHoursSpecification`).
Template: `src/components/OpenNow.astro`, `scripts/fetch-hours.mjs`. Extracts
BoH `fetch-hours.mjs`, `hours.ts`, `OpenNow.astro`.

Before extending a package or finishing a `TODO(port)`, read
`docs/DECOUPLING-NOTES.md` first — it names the exact coupling each module breaks
and the adapter that replaces it.
