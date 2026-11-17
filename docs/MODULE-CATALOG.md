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
`jeldon validate | doctor [--pre] [--json]`. `check-geo-floor`, `audit`,
`migrate`, and Copier-backed `init` are 🟡. Extracts `check-geo-floor.ts` +
new code.

## Growth modules (v2+)

| Package | Status | Extracts from | Capability flag |
|---|---|---|---|
| `@jeldon/drafting` | ✅ | `author.ts`, `site-knowledge.ts`, `voice-memory.ts`, `priority-keywords.ts`, `chat.ts` | `drafting` |
| `@jeldon/amplify` | ✅ | amplify/carousel/newsletter endpoints, `brevo-campaigns.ts`, `auto-newsletter.mjs` | `amplify` |
| `@jeldon/media` | ✅ | `narration.ts`, audio/image routes, `podcast.xml.ts`, R2 proxies | `audio`, `heroImages` |
| `@jeldon/competitive-intel` | ✅ | `competitor-scanner.ts`, `audit-competitors.mjs`, `competitor-gap-report.ts`, `keyword-ranks.ts` | `competitiveIntel` |
| `@jeldon/crawler-analytics` | ✅ | `ai-crawlers.ts`, `fetch-cf-analytics.mjs`, `article-analytics.ts`, `api/track.ts` | `engagementAnalytics` |
| `@jeldon/leads` | ✅ | `request-context.ts`, BaseLayout first-touch block, `api/contact.ts` sanitising, `api/admin/leads.ts`, `lead-trends.ts`, `reach/conversion-map.ts`, `leads/import-bookings.ts` + the leads page hashing | `leads`, `conversionMap` |
| `@jeldon/google` | ✅ | `google-auth.ts`, `gmail.ts` (send half) | — |
| `@jeldon/entity-presence` | ✅ (scaffold) | NEW — off-site brand-mention + per-engine citation-pattern signals | `entityPresence` |

> `@jeldon/entity-presence` is the one module **not** in the source system. The
> audit flags off-site mentions as correlating ~3× stronger with AI citation
> than backlinks — the biggest lever on-page-only optimization can't reach. See
> `docs/AEO-PLAYBOOK.md`.

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

Before extending a package or finishing a `TODO(port)`, read
`docs/DECOUPLING-NOTES.md` first — it names the exact coupling each module breaks
and the adapter that replaces it.
