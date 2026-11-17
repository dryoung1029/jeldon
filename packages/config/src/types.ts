/**
 * The Domain Pack — the single typed config bundle that specializes the Jeldon
 * engine for one project. The engine packages hardcode NOTHING about any
 * vertical; every value that was a literal in the source system (Body of Health)
 * becomes a key here.
 *
 * A new project edits exactly one file (`jeldon.config.ts`) that default-exports
 * a `DomainPack`. `jeldon validate` checks it against the Zod schema; `jeldon
 * doctor` checks it against the live environment.
 */

// ---------------------------------------------------------------------------
// Structured-data profiles (consumed by @jeldon/schema-graph)
// ---------------------------------------------------------------------------

export interface OrgProfile {
  name: string;
  url: string;
  logoUrl?: string;
  sameAs?: string[];
  /** Free-form extra schema.org fields merged into the Organization node. */
  extra?: Record<string, unknown>;
}

export interface PersonProfile {
  name: string;
  jobTitle?: string;
  url?: string;
  image?: string;
  knowsAbout?: string[];
  /** e.g. "BS, DC, MS" or "10y on-call at hyperscale". */
  credential?: string;
  alumniOf?: string[];
  memberOf?: string[];
  awards?: string[];
  sameAs?: string[];
  extra?: Record<string, unknown>;
}

/** A curated llms.txt section: a heading and its bullet links. Consumed by
 *  @jeldon/schema-graph's `emitLlmsTxt`. */
export interface LlmsTxtSection {
  heading: string;
  /** Either freeform lines or `[label](url): note` link bullets. */
  items: Array<{ label: string; url?: string; note?: string } | string>;
}

/** The curated content that `emitLlmsTxt` renders (llmstxt.org convention).
 *  Everything domain-specific (the most-cited URLs, scope/policy prose) is
 *  data here, not literals in the engine. */
export interface LlmsTxtConfig {
  /** One-line summary blockquote under the H1. */
  summary?: string;
  /** Intro paragraph(s) after the summary. */
  intro?: string;
  sections?: LlmsTxtSection[];
}

/** Per-domain knobs for the Article schema graph. Generic by default; the
 *  YMYL/medical-review fields are opt-in. Consumed by @jeldon/schema-graph's
 *  `articleGraph`. */
export interface ArticleSchemaPolicy {
  /** Schema @id of the entity that reviewed the article (E-E-A-T). When set,
   *  emits `reviewedBy` + `lastReviewed`. e.g. a credentialed clinician. */
  reviewerSchemaId?: string;
  /** Emit `lastReviewed` (date) alongside `reviewedBy`. Default true when a
   *  reviewer is set. */
  emitLastReviewed?: boolean;
  /** Public URL describing the editorial/review standards (`publishingPrinciples`). */
  publishingPrinciplesUrl?: string;
  /** Hero image intrinsic dimensions for the ImageObject node. */
  heroImageDimensions?: { width: number; height: number };
  /** Name of the podcast series for `isBasedOn` when an article has a source episode. */
  sourceEpisodeSeriesName?: string;
}

// ---------------------------------------------------------------------------
// Scoring (consumed by @jeldon/core-scoring)
// ---------------------------------------------------------------------------

/** One GEO check. Detection is data, not code — this is what makes the scorer
 *  domain-agnostic. `thresholds` is `[good, meh]`. */
export interface GeoCheckDef {
  id: string;
  label: string;
  weight: number;
  kind: 'regexCount' | 'regexPer1k' | 'questionH2';
  /** Regex sources (compiled at runtime). For `questionH2`, these are the
   *  question-starter words (e.g. ["what","why","how"]). */
  patterns?: string[];
  flags?: string;
  /** Which text the patterns run against. Default 'cleaned'. */
  target?: 'cleaned' | 'body';
  thresholds: [number, number];
}

export interface GeoConfig {
  /** CI gate threshold. Must be <= min(content.categoryTargets). */
  floor: number;
  checks: GeoCheckDef[];
}

export interface SeoConfig {
  title: { good: [number, number]; mehMax: number };
  excerpt: { good: [number, number]; meh: [number, number] };
  slugMaxLen: number;
  wordCount: { good: [number, number]; mehMin: number };
  /** Body char ceilings (the TTS/length check). */
  bodyChars: { good: number; meh: number };
  h2: { good: [number, number]; meh: [number, number] };
  internalLinks: { good: number; meh: number };
  tags: { good: [number, number]; mehMin: number };
  heroAltWords: { good: [number, number] };
  /** Acceptable Flesch-Kincaid grade band; `mehMax` is the upper meh bound. */
  reading: { good: [number, number]; mehMax: number };
  /** URL path prefixes that count as internal links, e.g. ["articles","care"]. */
  internalLinkPrefixes: string[];
  /** Section H2 names that satisfy the references requirement. */
  referenceSectionNames: string[];
  /** Words that, when present, require a linked references section. */
  evidenceTriggers: string[];
  /** Regex source flagging camera-dump style image filenames. */
  badFilenameRe: string;
  /** Hand-coded pages checked by `jeldon check-meta-length` against the
   *  `title` / `excerpt` bands above. Default roots `["src/pages"]`, excluding
   *  directories named `admin`, `api`, `preview`. */
  staticPages?: { roots?: string[]; exclude?: string[] };
}

export interface ScoringConfig {
  geo: GeoConfig;
  seo: SeoConfig;
}

// ---------------------------------------------------------------------------
// Citation policy (consumed by @jeldon/verify)
// ---------------------------------------------------------------------------

export interface CitationConfig {
  /** Explicit per-domain choice — resolves the BoH lint-vs-cite8 contradiction. */
  policy: 'direct-source-urls' | 'search-urls-only' | 'verifier-required';
  /** Lint regexes — e.g. a fabricated-PMID guard. */
  forbiddenPatterns: string[];
  referenceFormat: string;
  verifier: {
    kind: 'none' | 'cite8' | 'primary-source';
    baseUrl?: string;
  };
}

// ---------------------------------------------------------------------------
// AEO citation-presence audit (consumed by @jeldon/aeo-audit)
// ---------------------------------------------------------------------------

export interface AeoQuery {
  id: string;
  query: string;
  tags: string[];
}

export interface AeoConfig {
  /** Prose mentions that count as a brand reference even without a link. */
  brandMentions: string[];
  /** Localized search location for engines that support it; omit for non-local. */
  localSearchLocation?: string;
  querySet: AeoQuery[];
  engines: Array<'perplexity' | 'anthropic' | 'google-aio' | 'openai'>;
  /** Tags that bump an action item's priority. */
  highPriorityTags: string[];
  maxSnapshots?: number;
  /** Generic phrasings that contain a brand mention but are not one, keyed by
   *  the mention term. Values are regex sources; matches are removed before
   *  the term is tested. e.g. `{ "body of health": ["\\bgrowing\\s+body of health\\b"] }`. */
  brandMentionExclusions?: Record<string, string[]>;
  /** Model alias (key into `drafting.models`) or raw id for the Anthropic
   *  engine. Default: `drafting.defaultModel`. */
  model?: string;
  /** How cited links are classified (who was cited instead of us). Default
   *  `defaultAeoCitationConfig`. Competitor hosts come from `competitors.roster`. */
  citations?: AeoCitationConfig;
}

export interface AeoCitationConfig {
  /** Links kept per answer. Default 10. */
  topN: number;
  /** Review / listing / directory domains (exact or parent domain). */
  directoryHosts: string[];
  /** Regex source tested against the lowercased URL path to flag "best of" /
   *  numbered-list pages. */
  listUrlPattern: string;
}

// ---------------------------------------------------------------------------
// Off-site entity presence (consumed by @jeldon/entity-presence)
// ---------------------------------------------------------------------------

/**
 * One class of third-party surface where a brand can be mentioned off-site
 * (Reddit, Wikipedia, an industry forum, a comparison/"best-of" listicle, a
 * Q&A site). The audit (AEO-PLAYBOOK §"biggest lever") flags off-site mentions
 * as correlating ~3× stronger with AI visibility than backlinks — and the
 * effect differs per engine (Reddit → Perplexity, Wikipedia/consensus →
 * ChatGPT, structured depth → Claude). Everything here is data so a non-clinic
 * domain re-points its source set without touching engine code.
 */
export interface EntityPresenceSource {
  /** Stable key, e.g. "reddit", "wikipedia", "industry-forum". */
  id: string;
  /** Human label surfaced in the report. */
  label: string;
  /** Domains that identify a citation/mention as living on this source,
   *  matched against the URL host exactly or as a parent domain (never as a
   *  substring). e.g. ["reddit.com"]. */
  hostNeedles: string[];
  /** Relative importance of presence on this source (0-1). Tunable per domain. */
  weight: number;
  /** When true, NAP / name-string consistency is expected to be verifiable on
   *  this source (a listing-style surface) — a mismatch is flagged. Discussion
   *  surfaces (Reddit threads) set this false. Default false. */
  napConsistencyChecked?: boolean;
}

/** Per-answer-engine off-site source affinity. Encodes the playbook finding
 *  that each engine weights different third-party surfaces. `affinity` maps an
 *  `EntityPresenceSource.id` → relative pull (0-1) for THIS engine. */
export interface EnginePresenceAffinity {
  /** Engine id, e.g. "perplexity", "anthropic", "openai". */
  engine: string;
  /** sourceId → how strongly this engine leans on that source (0-1). */
  affinity: Record<string, number>;
  /** One-line note on the engine's documented retrieval behavior. */
  note?: string;
}

/** Which brand identity strings must read identically across listing-style
 *  off-site surfaces. A drift (e.g. an old phone number on a directory) is the
 *  consistency signal AI engines penalize. */
export interface MentionConsistencyTargets {
  /** The canonical brand name string. From `pack.brand.name` when omitted. */
  name?: string;
  /** Canonical NAP fields whose values must match across sources. Keys are
   *  free-form (address/phone/url/…); values are the canonical string. */
  nap: Record<string, string>;
}

export interface EntityPresenceConfig {
  /** The third-party surface set to audit. */
  sources: EntityPresenceSource[];
  /** Per-engine source affinities (the Reddit→Perplexity / Wikipedia→ChatGPT
   *  finding, expressed as data). */
  engineAffinities: EnginePresenceAffinity[];
  /** Identity strings checked for cross-source consistency. */
  consistencyTargets?: MentionConsistencyTargets;
  /** A mention-count at/above which a source counts as "established presence"
   *  (vs a single stray mention). Default 3. */
  establishedThreshold?: number;
}

// ---------------------------------------------------------------------------
// Strategic recommendations (consumed by @jeldon/strategy)
// ---------------------------------------------------------------------------

/** Numeric knobs for the deterministic recommendations engine. Every magic
 *  number that was inline in the BoH `strategy.ts` lives here. */
export interface StrategyThresholds {
  /** Min requests for a 404 on a real site-route to be worth flagging. */
  real404MinRequests: number;
  /** Request count at/above which a 404 rec escalates to high priority. */
  real404HighRequests: number;
  /** Min 5xx count over the window before the server-error rec fires. */
  serverError5xxMin: number;
  /** 5xx count at/above which the server-error rec escalates to high. */
  serverError5xxHigh: number;
  /** How many top content paths to inspect for GEO/audio recs. */
  topContentPaths: number;
  /** A top-N content path (1-based) at/above this rank is "high" for GEO. */
  geoHighTopRank: number;
  /** Margin below the category target before a GEO rec fires (target - margin). */
  geoTargetMargin: number;
  /** Only top-N pages by traffic get an audio-coverage rec. */
  audioTopRank: number;
  /** Min total referrers before the social-gap rec is meaningful. */
  socialMinReferrers: number;
  /** Social share of referrers (0-1) at/below which the gap rec fires. */
  socialGapFraction: number;
  /** Absolute floor for the social gap test (max(this, total*fraction)). */
  socialGapFloor: number;
  /** Keyword rank range that counts as a page-2→1 climb opportunity. */
  climbRankRange: [number, number];
  /** How many climb opportunities to surface. */
  climbMax: number;
  /** Final cap on the number of recommendations returned. */
  maxRecommendations: number;
}

/** Channel-label groups for the strategy rules. Each entry is an exact
 *  channel label as `classifyReferer` emits it (case-insensitive equality, not
 *  a substring: `google` would also count "Google Business"). */
export interface StrategyRefererGroups {
  social: string[];
  search: string[];
}

/** The crawler "purpose" label that means a live answer-engine retrieval (vs
 *  indexing/training). BoH's classifier emits 'live'. */
export interface StrategyConfig {
  thresholds: StrategyThresholds;
  /** Regex sources (anchored, compiled at runtime) for paths that count as
   *  OUR content — a 404 on one of these is actionable; everything else is
   *  bot/scanner noise. e.g. `^/articles/[a-z0-9-]+/?$`. */
  siteRoute404Patterns: string[];
  /** Regex source matching an article-detail path, with the slug as group 1.
   *  e.g. `^/articles/([^/]+)$`. Used to join top-paths to article health. */
  articlePathPattern: string;
  refererGroups: StrategyRefererGroups;
  /** Crawler purpose label denoting live retrieval (vs index/train). */
  liveCrawlPurpose: string;
  /** Deep-links the rendered recs point at (host admin routes). Each is a
   *  `{ link, linkLabel }` pair keyed by a stable slot name. */
  deepLinks: Record<string, { link: string; linkLabel?: string }>;
  /** Copy templates per built-in rule. `{token}` placeholders are filled from
   *  the rule's computed facts. Lets a domain re-voice every line without code. */
  copy: Record<string, { title: string; evidence: string }>;
}

// ---------------------------------------------------------------------------
// Amplification (consumed by @jeldon/amplify)
// ---------------------------------------------------------------------------

/** One distribution channel the amplify kit produces copy for. Everything that
 *  was a hardcoded channel literal in the BoH `amplify/[slug].ts` (the label,
 *  the per-channel rules paragraph, the tool-field description, the UTM string)
 *  is data here so a non-clinic domain re-channels without touching engine code. */
export interface AmplifyChannel {
  /** Stable key, e.g. "gbp", "facebook", "linkedin", "newsletterBody". */
  id: string;
  /** Human label, e.g. "Google Business Profile post". */
  label: string;
  /** The channel-specific guidance paragraph injected into the system prompt. */
  guidance: string;
  /** The tool input_schema field description for this channel's output. */
  fieldDescription: string;
  /** UTM query string (without leading `?`) appended to the article URL for
   *  this channel, e.g. "utm_source=gbp&utm_medium=organic". Omit for channels
   *  that carry no link (e.g. an Instagram "link in bio" caption). */
  utm?: string;
  /** When true this channel is excluded from the full-kit tool's required list
   *  and never URL-tagged (e.g. a subject line). Default false. */
  noUrl?: boolean;
}

/** One curated topic cluster. Membership: any matching tag, a listed series,
 *  or a slug hint matched on whole hyphen-delimited segments ("hip" does not
 *  match "c-hip-ractic"). */
export interface TopicCluster {
  /** URL segment and stable key, e.g. "low-back-spine". */
  id: string;
  /** Short label for chips and breadcrumbs. */
  label: string;
  /** Page <title>. Keep inside `scoring.seo.title`; doctor checks it because
   *  the static-page meta gate cannot see dynamic routes. */
  title: string;
  /** Meta description. Keep inside `scoring.seo.excerpt`. */
  description: string;
  /** Short lead paragraph for the cluster page, in voice. */
  lead?: string;
  tags: string[];
  series?: string[];
  slugHints?: string[];
}

export interface TopicClustersConfig {
  /** Route prefix for cluster pages. Default "/articles/topic/". */
  pathPrefix?: string;
  /** A cluster page only exists with at least this many live members (a
   *  one-article cluster is thin content). Default 2. */
  minLiveArticles?: number;
  clusters: TopicCluster[];
}

/** Rules for a call to action that must stay educational (reel scripts,
 *  short video). Injected into the kit prompt for the listed channels. */
export interface CtaPolicy {
  /** Channel ids the policy applies to, e.g. ["reelScript"]. */
  channels: string[];
  /** Allowed CTA kinds, e.g. "follow for more", "save this", "ask in the comments". */
  allowed: string[];
  /** CTA kinds that are never acceptable, e.g. "book an appointment". */
  banned: string[];
}

/** Hand-off to an external carousel renderer (BoH: Carousel Studio,
 *  docs/carousel-studio-import-contract.md). The engine sends the article; the
 *  studio owns generation, layout and export. Secrets stay in env. */
export interface CarouselStudioConfig {
  /** Studio base URL, e.g. "https://studio.example". */
  baseUrl: string;
  /** Brand id configured on the studio side (voice + palette live there). */
  brandId: string;
  /** Prefix for the upsert key; the project id is `<prefix>-<slug>`. */
  projectIdPrefix: string;
  /** Optional scheme name; omit for the brand default. */
  schemeName?: string;
  /** Env var names for the service-token pair sent as CF-Access-Client-Id / -Secret. */
  clientIdEnv: string;
  clientSecretEnv: string;
  /** Request timeout. Default 88000 (stays under a ~100 s edge ceiling). */
  timeoutMs?: number;
}

/** Config for the amplification kit + newsletter content gen.
 *  Optional on the pack — `@jeldon/amplify` falls back to `defaultAmplifyConfig`. */
export interface AmplifyConfig {
  /** Distribution channels the full kit produces. */
  channels: AmplifyChannel[];
  /** Extra preamble lines about the brand/role for the kit system prompt.
   *  The voice block itself comes from `pack.voice` — this is just the
   *  "you are a content distribution editor for X" framing. */
  systemPreamble: string;
  /** Newsletter content spec: the subject/body shape paragraph. */
  newsletterGuidance: string;
  /** Educational-CTA rules for channels like reel scripts. */
  ctaPolicy?: CtaPolicy;
  /** External carousel studio hand-off. Absent = no carousel surface. */
  carouselStudio?: CarouselStudioConfig;
  /** Newsletter send slot: the next `sendHour`:00 in `content.timezone`, at
   *  least `floorHours` from now. Default 10 / 4. */
  newsletter?: { sendHour?: number; floorHours?: number };
}

// ---------------------------------------------------------------------------
// Competitive intelligence (consumed by @jeldon/competitive-intel)
// ---------------------------------------------------------------------------

export interface CompetitorEntry {
  id: string;
  name: string;
  url: string;
  placeId?: string;
  targetKeywords?: string[];
}

export interface CompetitorsConfig {
  ourPlaceId?: string;
  ourName?: string;
  localPackLocation?: string;
  roster: CompetitorEntry[];
  targetKeywords: string[];
  highValuePatterns?: string[];
  skipPatterns?: string[];
  templateVendors?: Array<{ name: string; fingerprints: string[] }>;
}

// ---------------------------------------------------------------------------
// Drafting + editor chat (consumed by @jeldon/drafting)
// ---------------------------------------------------------------------------

/**
 * Knobs for the drafting/editor-chat orchestration. Optional — the engine
 * falls back to `defaultDraftingConfig`. Everything domain-specific that was a
 * literal in BoH `author.ts` / `chat.ts` (the model alias map, the draft-time
 * floor, the author word-count targets) lives here; the prompt STRINGS are
 * built from `pack.voice` by @jeldon/drafting's PromptPack and can be overridden
 * field-by-field via `promptOverrides`.
 */
/** Model reasoning effort (`output_config.effort`). `low` for mechanical
 *  extraction, `medium` for writing. Sonnet 5.5 defaults to `high`, so the
 *  engine always sends one explicitly. */
export type LlmEffort = 'low' | 'medium' | 'high' | 'max';

export interface DraftingConfig {
  /** Alias → provider model id. BoH: sonnet/opus/haiku. The default-draft model
   *  alias is `defaultModel`; the cheap claim-extraction model is `utilityModel`. */
  models: Record<string, string>;
  defaultModel: string;
  /** Alias → picker label (e.g. `sonnet` → "Sonnet 5.5"). Admin UIs render
   *  their model pickers from this so labels can't drift from the IDs. */
  modelLabels?: Record<string, string>;
  /** Per-purpose effort. `default` applies to any purpose not listed. Purposes:
   *  the drafting modes, `fixPass`, `extractClaims`, `chat`, `heroConcept`,
   *  `amplify`, `newsletter`, `gapReport`, `positioning`, `aeoAudit`. */
  effort?: Record<string, LlmEffort>;
  /** Cheap model for research-claim extraction (BoH used Haiku). */
  utilityModel: string;
  /** SEO/GEO floor at draft time before a fix-pass fires. BoH: 70/70. */
  draftFloor: { seo: number; geo: number };
  /** Author word-count target range surfaced in the draft prompts. BoH: 800–1500. */
  wordCountTarget: [number, number];
  /** Body char ceiling surfaced in the draft prompts (TTS chunk threshold). BoH: 10000. */
  bodyCharCeiling: number;
  /** Per-mode max output tokens. Keyed by drafting mode. */
  maxTokens: {
    brainstorm: number;
    draft: number;
    outline: number;
    'draft-series': number;
    'draft-series-article': number;
    fixPass: number;
    extractClaims: number;
    chat: number;
  };
  /** Optional full-string overrides for any prompt block, by slot name (e.g.
   *  'voice', 'geoPlaybook', 'chatSystem'). When set, replaces the built-from-
   *  voice default verbatim. Lets a domain hand-author a prompt if the
   *  voice-derived default isn't enough. */
  promptOverrides?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Media: narration (TTS) + hero images + podcast feed (consumed by @jeldon/media)
// ---------------------------------------------------------------------------

/** A single IPA pronunciation override the TTS engine wraps in a `<phoneme>`
 *  SSML tag. BoH used these to force American stress on "skeletal" and the
 *  local readings of Corvallis / Willamette. Pure data — a non-clinic domain
 *  ships its own list (or none). */
export interface PronunciationOverride {
  word: string;
  ipa: string;
}

/** An abbreviation the clone otherwise reads letter-by-letter or mispronounces.
 *  Match is case-sensitive + word-bounded. e.g. `{ abbr: "MRI", full: "M R I" }`. */
export interface AbbreviationExpansion {
  abbr: string;
  full: string;
}

/** ElevenLabs voice settings. The numeric trade-offs (stability / style /
 *  similarity) are tuning, not constants — every value is a knob. */
export interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
}

/** TTS / narration config. Everything BoH hardcoded in `narration.ts` +
 *  `audio/[slug].ts` (voice id, model, settings, pronunciation tables, the
 *  spoken outro, the chunk + safety thresholds) is data here. */
export interface NarrationConfig {
  /** Provider voice id (BoH: the Dr. Young clone). */
  voiceId: string;
  /** Provider model id (BoH: `eleven_multilingual_v2`). */
  model: string;
  voiceSettings: VoiceSettings;
  /** Spoken sign-off appended (cached) to every article. */
  outroText: string;
  /** IPA `<phoneme>` overrides applied before synthesis. */
  pronunciationOverrides: PronunciationOverride[];
  /** Abbreviation → spoken-form expansions. */
  abbreviationExpansions: AbbreviationExpansion[];
  /** Max chars per single TTS request (provider cap; BoH chunks at 9000). */
  chunkChars: number;
  /** Hard char ceiling per generation so a runaway article can't burn budget. */
  maxChars: number;
  /** H2 section names whose content (to end-of-doc) is dropped from narration. */
  referenceSectionNames: string[];
}

/** Hero-image generation config. The locked sketchbook style pack + the
 *  art-director system prompt + the gpt-image size/quality knobs. The
 *  `{TOPIC}` / `{CONCEPT}` placeholders in `promptTemplate` are filled by the
 *  proposal tool. */
export interface HeroImageConfig {
  /** Provider model id (BoH: `gpt-image-2`). */
  model: string;
  /** Output size, e.g. `1024x1536` (portrait 2:3). */
  size: string;
  /** Quality tier: `low | medium | high`. */
  quality: string;
  /** The locked style template with `{TOPIC}` + `{CONCEPT}` slots. */
  promptTemplate: string;
  /** The art-director system prompt for the concept-proposal call. */
  proposalSystem: string;
}

/** Podcast trailer episode (a one-time intro). Optional. */
export interface PodcastTrailer {
  title: string;
  /** Site-relative path to the trailer MP3. */
  audioPath: string;
  audioSize: number;
  duration: string;
  /** RFC-822 / UTC date string. */
  pubDate: string;
  summary: string;
}

/** Podcast RSS channel config. Everything BoH hardcoded in `podcast.xml.ts`
 *  (show title, description, author, owner email, category, cover, trailer). */
export interface PodcastConfig {
  title: string;
  subtitle: string;
  description: string;
  author: string;
  ownerEmail: string;
  /** Apple top-level category, e.g. "Health & Fitness". */
  category: string;
  /** Apple sub-category, e.g. "Alternative Health". */
  subcategory?: string;
  copyright?: string;
  language?: string;
  /** Absolute or site-relative cover image URL (Apple wants 1400–3000px square). */
  coverImage: string;
  /** Chars-per-minute estimate for the duration heuristic (BoH: 950). */
  charsPerMinute?: number;
  trailer?: PodcastTrailer;
}

/** The media surface config (@jeldon/media). Optional on the pack — the engine
 *  falls back to `defaultMediaConfig`. Gated by `capabilities.audio` /
 *  `capabilities.heroImages`. */
export interface MediaConfig {
  narration: NarrationConfig;
  heroImage: HeroImageConfig;
  podcast: PodcastConfig;
}

// ---------------------------------------------------------------------------
// Crawler / edge analytics (consumed by @jeldon/crawler-analytics)
// ---------------------------------------------------------------------------

/** One AI-crawler fingerprint. A single injected list kills the 2-file
 *  duplication between BoH `ai-crawlers.ts` (regex) and `fetch-cf-analytics.mjs`
 *  (substring). `match` is a case-insensitive substring of the User-Agent.
 *  More-specific tokens must precede their prefixes (e.g. "Claude-SearchBot"
 *  before "ClaudeBot") so the broad rule doesn't shadow the narrow one. */
export interface AiBot {
  /** Case-insensitive UA substring that identifies the bot. */
  match: string;
  /** Canonical bot name surfaced in analytics. */
  bot: string;
  /** Answer-engine vendor, e.g. "openai", "anthropic". */
  engine: string;
  /** What the crawl is for: model training, search indexing, or a live
   *  answer-engine retrieval on behalf of a user. */
  purpose: 'train' | 'index' | 'live';
}

/** One referer-channel rule. A single injected map kills the 3-file
 *  triplication (`classifyReferer`, `classifySource`, the editor CTA logic).
 *  Exact UTM tokens are checked first; then the hostname is matched against
 *  each rule in order (exact or parent domain, anchored pattern, substring as a
 *  last resort). First match wins. `drop:true` suppresses the source entirely
 *  (e.g. an auth redirect). */
export interface RefererChannelRule {
  /** Friendly channel label, e.g. "Google Search". Ignored when `drop` is set. */
  label?: string;
  /** Domains matched against the referer hostname exactly or as a parent
   *  domain (`reddit.com` matches `old.reddit.com`, never `notreddit.com`). */
  hosts?: string[];
  /** Regex sources tested against the hostname, for families like
   *  `(^|\.)google\.` (every Google ccTLD). Anchor them yourself. */
  hostPatterns?: string[];
  /** Exact UTM source tokens (`newsletter`, `fb`). Checked against the raw
   *  source value before any hostname rule, across all rules. */
  utmSources?: string[];
  /** Plain substrings of the hostname. Last resort for vendor tracking hosts
   *  with no stable domain (e.g. `sendib`); prefer `hosts`. */
  hostContains?: string[];
  /** When true, a matching host is excluded from the source breakdown. */
  drop?: boolean;
  /** @deprecated Removed in 0.3: substring needles misclassified hosts (`t.co`
   *  matched reddit.com). Validation rejects it; use `hosts` / `hostPatterns` /
   *  `utmSources`. */
  needles?: never;
}

/** Config for the crawler + edge-analytics surface (@jeldon/crawler-analytics).
 *  Optional on the pack — the engine falls back to `defaultAnalyticsConfig`.
 *  Everything BoH hardcoded (the AI bot list ×2, the referer map ×3, the CF
 *  zone/account ids, the human/bot UA heuristic, the article-path regex) is
 *  data here so a non-clinic domain re-points it without touching engine code. */
export interface AnalyticsConfig {
  /** AI-crawler fingerprints, longest/most-specific token first. */
  aiBotList: AiBot[];
  /** Referer/source → channel rules, evaluated in order. The label for a host
   *  matching no rule is the bare host. */
  refererChannelMap: RefererChannelRule[];
  /** Our own domains. Referers on these (or their subdomains) are internal
   *  navigation and are dropped. `analyticsConfigFromPack` adds the host of
   *  `brand.siteUrl` automatically. */
  ownHosts?: string[];
  /** Label returned for an empty/absent referer. BoH: "Direct / none". */
  directLabel: string;
  /** Regex source matching an article-detail path with the slug as group 1.
   *  e.g. `^/articles/([a-z0-9-]+)/?$`. Joins edge hits to per-article traffic. */
  articlePathPattern: string;
  /** Regex source for asset/noise paths excluded from "top pages" + per-bot
   *  path lists (anchored at the path start). */
  assetPathPattern: string;
  /** Regex source for UA tokens that mark a request as a bot in the coarse
   *  human/bot split (no paid bot-management on the free plan — directional). */
  botUaPattern: string;
  /** Anchored regex sources for paths that are OUR content (e.g.
   *  `^/articles/[a-z0-9-]+/?$`). A 404 on one of these survives the top-25
   *  truncation so a real broken link is never buried under bot-scanner noise.
   *  LOCKSTEP with `strategy.siteRoute404Patterns` in BoH. */
  siteRoute404Patterns: string[];
  /** Cloudflare GraphQL Analytics ids. Secret token is read from env, not here. */
  cloudflare?: {
    zoneId?: string;
    accountId?: string;
    /** GraphQL endpoint; defaults to the public CF Analytics API. */
    endpoint?: string;
  };
  /** Rolling traffic window (days) the readers sum over. BoH: 30. */
  windowDays: number;
  /** Max daily snapshots retained in the rolling stores. BoH: 365. */
  maxDailySnapshots: number;
  /** How site routes are keyed in per-route traffic and the path-keyed
   *  engagement beacon. Both sides use `normalizeSitePath`, so the keys join.
   *  Default excludes admin/api/build-asset prefixes and caps at 200 chars. */
  sitePath?: { excludePrefixes: string[]; maxLength: number };
  /** Cloudflare Web Analytics (RUM) Web Vitals query. The dataset type name is
   *  a guess that has changed before, so the engine reports which RUM types
   *  the schema exposes when it is wrong. */
  webVitals?: { typeName: string; dataset: string; days: number };
}

// ---------------------------------------------------------------------------
// The Domain Pack
// ---------------------------------------------------------------------------

export interface DomainPack {
  brand: {
    name: string;
    siteUrl: string;
    tagline?: string;
    /** Arbitrary geographic framing, e.g. "Corvallis and Albany". */
    geoFraming?: string;
    nap?: {
      address?: string;
      city?: string;
      region?: string;
      postalCode?: string;
      phone?: string;
      placeId?: string;
    };
    logoUrl?: string;
    brandColors?: Record<string, string>;
    /** Public contact details (site alert "Email us", etc.). */
    contact?: BrandContact;
    /** Opening hours (@jeldon/business-info). Interpreted in
     *  `content.timezone`. */
    hours?: BusinessHoursConfig;
  };

  authors: Array<{
    slug: string;
    name: string;
    title?: string;
    /** @id linked by every Article graph for E-E-A-T consolidation. */
    schemaId: string;
    profile: PersonProfile;
    isPrimary?: boolean;
  }>;

  /** The SINGLE source for all prompt injection. Consumed by @jeldon/drafting,
   *  @jeldon/amplify, @jeldon/competitive-intel. */
  voice: {
    persona: string;
    bannedTopics: string[];
    bannedPhrasings: string[];
    rules: string[];
    voiceAnchorUrls: string[];
    readingGradeBand: [number, number];
  };

  content: {
    categories: string[];
    /** GEO target per category (>= scoring.geo.floor). */
    categoryTargets: Record<string, number>;
    /** Curated tag vocabulary. When set, the article generator
     *  (@jeldon/drafting) draws an article's tags from this list and backfills
     *  by relevance so every draft lands in the SEO `scoring.seo.tags` band —
     *  keeping the site's taxonomy consistent for topic clustering. Omit (or
     *  leave empty) to let the generator invent free-form tags instead. */
    tags?: string[];
    defaultAuthorSlug: string;
    timezone: string;
    /** @deprecated `docReviewed` was retired in BoH (2026-07-10) in favor of
     *  the `autonomous` provenance flag. Still honored when set; will be
     *  removed in a later minor. */
    lifecycle?: { docReviewed?: boolean };
    /** Allowed prefixes for `heroImage` paths, e.g. ["/img/"]. When set,
     *  validation rejects any other path (a model once invented a plausible
     *  `/images/...` path that never existed). Omit to allow any path. */
    heroImagePathPrefixes?: string[];
    /** Curated topic clusters. Each becomes an indexable page listing its
     *  live members, and member articles link back to it (that internal
     *  linking is what makes a cluster rank). Omit for no cluster pages. */
    topicClusters?: TopicClustersConfig;
  };

  scoring: ScoringConfig;

  citation: CitationConfig;

  aeo: AeoConfig;

  competitors?: CompetitorsConfig;

  /** Tuning for the deterministic recommendations engine (@jeldon/strategy).
   *  Optional — engine falls back to `defaultStrategyConfig`. */
  strategy?: StrategyConfig;

  /** Channels/schemes/prompts for the amplification kit (@jeldon/amplify).
   *  Optional — engine falls back to `defaultAmplifyConfig`. */
  amplify?: AmplifyConfig;

  /** Tuning for the drafting + editor-chat orchestration (@jeldon/drafting).
   *  Optional — engine falls back to `defaultDraftingConfig`. */
  drafting?: DraftingConfig;

  /** Narration (TTS) + hero-image + podcast config (@jeldon/media). Optional —
   *  engine falls back to `defaultMediaConfig`. Gated by `capabilities.audio` /
   *  `capabilities.heroImages`. */
  media?: MediaConfig;

  /** AI-crawler + edge-analytics config (@jeldon/crawler-analytics). Optional —
   *  engine falls back to `defaultAnalyticsConfig`. Gated by
   *  `capabilities.engagementAnalytics`. */
  analytics?: AnalyticsConfig;

  /** Off-site brand-mention + per-engine citation-pattern config
   *  (@jeldon/entity-presence). Optional — engine falls back to
   *  `defaultEntityPresenceConfig`. Gated by `capabilities.entityPresence`. */
  entityPresence?: EntityPresenceConfig;

  /** Ops observability: pipeline freshness, the needs-attention feed's
   *  cadence alerts, and on-demand workflow dispatch (@jeldon/ops). Optional —
   *  engine falls back to `defaultOpsConfig`. Gated by `capabilities.ops`. */
  ops?: OpsConfig;
  /** Google Search Console ingestion + derived signals + snippet lab
   *  (@jeldon/search-console). Optional — absent means the module is off and
   *  `jeldon doctor` skips its checks. Gated by `capabilities.searchConsole`.
   *  Start from `defaultSearchConsoleConfig` and override. */
  searchConsole?: SearchConsoleConfig;
  /** First-touch attribution, lead channels, lead trends and the booking
   *  import (@jeldon/leads). Optional — engine falls back to
   *  `defaultLeadsConfig`. Gated by `capabilities.leads`. Trends bucket in
   *  `content.timezone` (the business timezone). */
  leads?: LeadsConfig;

  /** Conversion map + per-topic request copy (@jeldon/leads). Optional —
   *  engine falls back to `defaultConversionConfig`. Gated by
   *  `capabilities.conversionMap`. */
  conversion?: ConversionConfig;

  schema: {
    orgType: string[];
    org: OrgProfile;
    /** e.g. ["Article"] generic, or ["Article","MedicalWebPage"] for YMYL. */
    articleTypes: string[];
    publishingPrinciplesUrl?: string;
    /** Per-domain Article-graph policy (reviewer @id, review dates, etc.). */
    articleGraph?: ArticleSchemaPolicy;
    /** Cheap-to-emit, never a ranking pillar. Default false. */
    emitLlmsTxt?: boolean;
    /** Curated content `emitLlmsTxt` renders. Required when emitLlmsTxt is true. */
    llmsTxt?: LlmsTxtConfig;
  };

  /** Pluggable compliance policy. HIPAA et al are OPT-IN here, never in the
   *  engine. Default `none`. */
  compliance?: {
    pack: 'none' | 'hipaa' | 'legal' | 'finance' | (string & {});
    reviewResponseRules?: string[];
    requireHumanReviewTags?: string[];
    /** Mailbox response tracking (@jeldon/leads/compliance). COMPLIANCE-PACK
     *  MATERIAL: refuses to run unless `pack` is not `none` AND
     *  `mailbox.enabled` is true. Message text is reduced to rule codes inside
     *  the function and never returned or stored. */
    mailbox?: MailboxComplianceConfig;
  };

  /** Which growth surfaces exist for this project. */
  capabilities: {
    drafting?: boolean;
    amplify?: boolean;
    audio?: boolean;
    heroImages?: boolean;
    competitiveIntel?: boolean;
    engagementAnalytics?: boolean;
    entityPresence?: boolean;
    /** Pipeline freshness strip, attention feed, workflow dispatch (@jeldon/ops). */
    ops?: boolean;
    /** Search Console snapshot, striking-distance / low-CTR tables, snippet lab. */
    searchConsole?: boolean;
    /** First-touch attribution, lead channels, trends, booking import. */
    leads?: boolean;
    /** Views → leads → booked per page and channel. */
    conversionMap?: boolean;
    /** Site-wide alert pop-up (@jeldon/site-alert). */
    siteAlert?: boolean;
    /** Opening hours + Places refresh + open-now chip (@jeldon/business-info). */
    businessHours?: boolean;
  };

  /** Required services + env. `jeldon doctor` verifies these. */
  services: {
    store: 'github' | 'fs';
    /** Repo-relative directory holding `<slug>.md` articles. Consumed by
     *  @jeldon/store (was the hardcoded `src/content/articles` literal in BoH).
     *  Defaults to `src/content/articles` when omitted. */
    contentDir?: string;
    analytics?: 'cloudflare' | 'none';
    requiredEnv: string[];
    /** Google Places credentials for the hours refresh (env-var names). */
    places?: PlacesServiceConfig;
  };

  /** One admin-editable pop-up on every public page (@jeldon/site-alert).
   *  Optional — engine falls back to `defaultSiteAlertConfig`. Gated by
   *  `capabilities.siteAlert`. Times are wall clock in `content.timezone`. */
  siteAlert?: SiteAlertConfig;

  /** Admin route protection (@jeldon/access). Optional — engine falls back to
   *  `defaultSecurityConfig`. Protected routes FAIL CLOSED when `access` is
   *  missing. */
  security?: SecurityConfig;
}

// ---------------------------------------------------------------------------
// Site ops: site alert, admin access, business hours
// (@jeldon/site-alert, @jeldon/access, @jeldon/business-info)
// ---------------------------------------------------------------------------

/** Public contact details. Not schema identity (that is `brand.nap`); this is
 *  what the site tells visitors to use, e.g. the "Email us" button on a site
 *  alert. */
export interface BrandContact {
  /** The address visitors should write to. Shown as a `mailto:` link. */
  email: string;
  /** Phone number as it should be displayed, e.g. "(555) 010-0000". */
  phoneDisplay?: string;
}

export type DayName =
  | 'Sunday'
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday';

/** One open interval, 24-hour local wall clock ("08:00" – "17:30"). */
export interface HoursInterval {
  opens: string;
  closes: string;
}

/** One weekday. An empty `intervals` list (or an omitted day) means closed.
 *  Several intervals model split shifts (e.g. a lunch closure). */
export interface DayHours {
  day: DayName;
  intervals: HoursInterval[];
}

/** A date-specific override of the weekly schedule. Empty `intervals` = closed
 *  that date. `source: 'google'` marks an entry copied from the Business
 *  Profile (replaced on every refresh); absent = added by hand (kept until the
 *  date passes, unless Google reports the same date). */
export interface SpecialHours {
  /** YYYY-MM-DD in the business timezone. */
  date: string;
  intervals: HoursInterval[];
  label?: string;
  source?: 'google';
}

/** The hours data file shape (`src/data/hours.json` in the template). */
export interface HoursData {
  /** When the hours DATA last changed. Null for a hand-written seed. */
  fetchedAt: string | null;
  /** When the refresh last successfully reached the provider. Distinguishes
   *  "hours haven't changed" from "the refresh is silently skipping". */
  checkedAt?: string | null;
  /** 'pack' | 'google-places' | … */
  source: string;
  regularHours: DayHours[];
  specialHours: SpecialHours[];
}

/** Opening hours. Interpreted in `content.timezone`. */
export interface BusinessHoursConfig {
  /** Weekly schedule used until a refresh writes the data file. */
  regular: DayHours[];
  /** Hand-entered date overrides (holiday closures, one-off openings). */
  special?: SpecialHours[];
  /** Repo-relative data file the Places refresh writes and the site reads.
   *  Default `src/data/hours.json`. */
  dataFile?: string;
}

/** Google Places (Place Details) credentials, by env-var NAME. The values are
 *  secrets and never live in the pack. */
export interface PlacesServiceConfig {
  apiKeyEnv: string;
  placeIdEnv: string;
}

export interface SiteAlertLimits {
  label: number;
  title: number;
  message: number;
  /** Longest window an alert may run, in days. */
  maxDays: number;
}

/** A quick-start for the admin form. Fills today 00:00–23:59 in the business
 *  timezone. `{email}` / `{phone}` in title or message are replaced from
 *  `brand.contact`. */
export interface SiteAlertPreset {
  /** Button text on the admin page. */
  name: string;
  title: string;
  message: string;
  label?: string;
  messageButton?: boolean;
  emailButton?: boolean;
  phonesDown?: boolean;
}

export interface SiteAlertConfig {
  limits: SiteAlertLimits;
  presets?: Record<string, SiteAlertPreset>;
  /** How long the admin page polls the live homepage for the saved revision
   *  before it says the deploy did not land. */
  pollTimeoutMinutes: number;
  /** Seconds between live checks. Default 15. */
  pollIntervalSeconds?: number;
  /** Repo-relative data file. Default `src/data/site-alert.json`. */
  dataFile?: string;
  /** Prefix for the per-revision dismissal key in localStorage. */
  storageKeyPrefix?: string;
  /** Where the "Send us a message" button points. The button is hidden when
   *  unset. */
  messageHref?: string;
  /** Button copy. Generic English defaults. */
  labels?: { message?: string; email?: string; dismiss?: string; close?: string };
}

/** Cloudflare Access application identifiers. Neither value is a secret (both
 *  appear in the Access login redirect); runtime env vars may override them. */
export interface AccessPolicyConfig {
  /** e.g. `yourteam.cloudflareaccess.com`. */
  teamDomain: string;
  /** The Access application's AUD tag. */
  aud: string;
}

export interface SecurityConfig {
  /** Path prefixes that require a verified Access token, e.g.
   *  `['/admin', '/api/admin']`. Compared lowercase against the canonicalised
   *  path and the matched route pattern. */
  adminPrefixes: string[];
  /** Missing = every protected route answers 500 (fail closed). */
  access?: AccessPolicyConfig;
}

// ---------------------------------------------------------------------------
// Ops observability (@jeldon/ops)
// ---------------------------------------------------------------------------

/** How a dashboard can run a pipeline on demand. `workflow` dispatches a
 *  GitHub Actions workflow (must also be in `ops.dispatch.allowlist`);
 *  `endpoint` POSTs one of the project's own routes; `page` links to a page
 *  that owns a deliberate manual run (e.g. one that burns a paid API quota). */
export type OpsPipelineRun =
  | { kind: 'workflow'; workflow: string }
  | { kind: 'endpoint'; href: string }
  | { kind: 'page'; href: string; label: string };

/** One cron-fed data file and the cadence it is expected to refresh on. */
export interface OpsPipeline {
  /** Stable key (used for dashboard state). */
  id: string;
  /** Human label, e.g. "Search Console". */
  name: string;
  /** Repo-relative data file this entry verifies. */
  file: string;
  /** Who writes it, shown in alerts, e.g. "fetch-search-console.yml (daily)". */
  source: string;
  /** Expected refresh interval in days. */
  cadenceDays: number;
  /** Field in `file` holding the last-write ISO timestamp. Dot path allowed
   *  (`meta.lastUpdated`). */
  timestampField: string;
  /** Set for files whose writer only rewrites the DATA on change. The data's
   *  age then proves nothing about whether the cron ran, so the writer also
   *  stamps a check timestamp on every successful run and liveness is graded
   *  on THAT. The check field is read from the SAME file on purpose: the proof
   *  must come from the step that owns the file. A stamp written by another
   *  step (even in the same workflow, with its own credentials) would keep
   *  reporting healthy while this step silently skipped. */
  changeGated?: {
    /** Field in `file` holding the "ran successfully" stamp. Default `checkedAt`. */
    checkedAtField?: string;
    /** How often that stamp should appear, in days. */
    checkCadenceDays: number;
  };
  /** How to trigger it from the dashboard. Absent = not triggerable. */
  run?: OpsPipelineRun;
}

/** Freshness grading multipliers, applied to a pipeline's cadence.
 *  age <= cadence × lateMultiplier → ok; <= cadence × staleMultiplier → late;
 *  otherwise stale. */
export interface OpsGrading {
  lateMultiplier: number;
  staleMultiplier: number;
}

/** Publishing rhythm the attention feed holds the project to. */
export interface OpsCadence {
  /** Alert when no live article has been published in more than N days. */
  articleDays: number;
  /** Alert when no newsletter has been sent in more than N days. Omit when
   *  the project has no newsletter; no newsletter alert is produced then. */
  newsletterDays?: number;
  /** A newsletter still "queued" more than this many days past its send slot
   *  is stuck. Default 2. */
  newsletterStuckDays?: number;
}

/** On-demand GitHub Actions dispatch from the dashboard. The token used must
 *  be allowed to run workflows (fine-grained PAT: "Actions: Read and write").
 *  Only list workflows that refresh DATA; nothing that publishes, sends or
 *  deploys belongs here. */
export interface OpsDispatch {
  /** The only workflow files (e.g. `fetch-data.yml`) that may be dispatched. */
  allowlist: string[];
  /** Client poll interval after a dispatch. Default 8. */
  pollSeconds?: number;
  /** Give up polling after this long. Default 20. */
  timeoutMinutes?: number;
  /** A run created more than this long before the click is the PREVIOUS run,
   *  not the one the click started (allows for clock skew). Default 90. */
  createdAtSlackSeconds?: number;
}

/** Link shown next to an attention item. */
export interface OpsLink {
  href: string;
  label: string;
}

export interface OpsConfig {
  pipelines: OpsPipeline[];
  grading: OpsGrading;
  cadence: OpsCadence;
  dispatch?: OpsDispatch;
  /** Optional admin links per attention kind (`pipeline`, `cadence`,
   *  `newsletter`, `autonomous`, `hero`, …). The engine has no admin routes of
   *  its own, so items carry no link unless one is set here or by the caller. */
  links?: Record<string, OpsLink>;
}

// ---------------------------------------------------------------------------
// Search Console (consumed by @jeldon/search-console + `jeldon doctor`)
// ---------------------------------------------------------------------------

/** Queries ranking just off page 1, where one good edit moves them up. */
export interface StrikingDistanceConfig {
  /** Inclusive position band. BoH: 5–15. */
  minPosition: number;
  maxPosition: number;
  /** Ignore rows with fewer impressions than this (noise). BoH: 10. */
  minImpressions: number;
  /** Max rows returned, sorted by impressions desc. BoH: 15. */
  limit: number;
}

/** Pages on page 1 whose CTR is well below what their position should earn. */
export interface LowCtrConfig {
  /** Only rows at or above this position (1 = top). BoH: 10 (page 1). */
  maxPosition: number;
  minImpressions: number;
  /** Flag when `ctr < ratio * expectedCtr(position)`. BoH: 0.6. */
  ratio: number;
  /** Expected organic CTR by rounded position: index 0 is position 1. A
   *  position past the end uses the last value. Rough, blended — it flags
   *  anomalies, it does not forecast. */
  expectedCtrCurve: number[];
  limit: number;
}

export interface SnippetLabConfig {
  /** Repo-relative JSON file the change log lives in (via Store.saveDataFile). */
  logPath: string;
  /** Newest entries kept; older ones fall off. BoH: 200. */
  maxEntries: number;
}

export interface SearchConsoleConfig {
  /** Env var holding the property id (`sc-domain:example.com` or
   *  `https://example.com/`). Ignored when `property` is set. */
  propertyEnv: string;
  /** Env var holding the service-account JSON key, raw or base64. */
  saKeyEnv: string;
  /** Property id inline, when it is not a secret. Overrides `propertyEnv`. */
  property?: string;
  /** Lookback window in days. */
  rangeDays: number;
  /** Days to end the window before today (GSC data lags ~2–3 days). */
  lagDays: number;
  /** Rows per dimension query. */
  rowLimit: number;
  /** Repo-relative path the snapshot is written to by the cron. */
  snapshotPath: string;
  strikingDistance: StrikingDistanceConfig;
  lowCtr: LowCtrConfig;
  /** Inline title/excerpt edits logged with the SC numbers at change time.
   *  Title/excerpt limits come from `scoring.seo`, not from here. */
  snippetLab?: SnippetLabConfig;
}

// ---------------------------------------------------------------------------
// Leads + conversion (consumed by @jeldon/leads)
// ---------------------------------------------------------------------------

/** What the first-touch snippet captures and how the server clamps it. The
 *  server keeps a PATH-only landing page (no query, no hash) and a
 *  HOSTNAME-only referrer, so a lead record never carries a full URL that
 *  might hold an email address or a search term. */
export interface LeadAttributionConfig {
  /** sessionStorage key prefix the browser snippet writes under, e.g. "site:". */
  storagePrefix: string;
  /** UTM query keys captured and kept. Anything else is dropped. */
  utmKeys: string[];
  /** Max characters kept for the landing path. BoH: 200. */
  maxLandingChars: number;
  /** Max characters kept for the referrer hostname. BoH: 120. */
  maxReferrerChars: number;
  /** Max characters kept per UTM value (after stripping to `[\w.-]`). BoH: 60. */
  maxUtmChars: number;
  /** Record taps on `tel:` links in the session, so a lead who phoned is not
   *  later counted as "nobody reached them". Default true. */
  capturePhoneTaps?: boolean;
}

/** Column-header patterns for one booking-system export. DATA only: a preset
 *  names no behaviour, just which headers hold the email, phone and first-visit
 *  date. Each list is regex sources tried in order (case-insensitive); the
 *  first header matching the first pattern wins. */
export interface BookingImportPreset {
  id: string;
  label: string;
  columns: {
    email: string[];
    phone: string[];
    date: string[];
  };
}

export interface BookingImportConfig {
  presets: BookingImportPreset[];
  /** Preset id used when the caller names none. */
  defaultPreset: string;
  /** Phone numbers are matched on their last N digits. BoH: 10. */
  phoneDigits: number;
  /** Max rows accepted per import. BoH: 5000. */
  maxRows: number;
}

export interface LeadsConfig {
  attribution: LeadAttributionConfig;
  /** Channel label for a lead with no attribution at all (pre-capture leads).
   *  Distinct from the analytics direct label: "no data" is not "direct". */
  unknownChannelLabel: string;
  /** Which control opened the form (`page`, `sheet`, `sticky`, ...). Values
   *  outside this list are dropped. */
  requestVia: string[];
  bookingImport: BookingImportConfig;
  trends: {
    /** Default bucket for `buildTrends`. */
    defaultBucket: 'week' | 'month';
  };
}

/** What the request sheet / article end-cap says for a topic. */
export interface RequestContext {
  /** Phrase after the request CTA ("for back pain"). Empty = plain. */
  topic: string;
  /** Pre-selected option in the request form. Must match an option exactly. */
  visitType: string;
  /** End-cap headline. */
  headline: string;
  /** End-cap sub-line. */
  sub: string;
}

export interface ConversionConfig {
  /** Rates over fewer leads than this are flagged `lowSample` (shown dimmed,
   *  never hidden, never zeroed). BoH: 3. */
  minLeads: number;
  /** Topic/cluster id → request copy. First cluster id with an entry wins;
   *  `default` fills the rest. */
  requestContexts?: {
    default: RequestContext;
    byCluster: Record<string, Partial<RequestContext>>;
  };
}

/** One keyword rule: a stable code and a regex source (case-insensitive,
 *  wrapped in a leading word boundary by the engine). */
export interface MailboxRule {
  id: string;
  pattern: string;
}

/** Deterministic rules that reduce message text to codes. Keyword rules both
 *  miss and mis-fire; every result is a starting point to check. */
export interface MailboxOutcomeRules {
  /** We said we would phone them. */
  phoneFromUs: MailboxRule[];
  /** They asked us to phone them. */
  phoneFromThem: MailboxRule[];
  /** They declined. Only their messages are checked. */
  decline: MailboxRule[];
  /** Reasons, consulted ONLY after a decline is detected. */
  declineReasons: Array<{ reason: string; label: string; rules: MailboxRule[] }>;
  /** Label for a decline with no matching reason (code `unspecified`). */
  unspecifiedLabel: string;
  /** We confirmed a booking in the thread. Only our messages are checked. */
  bookedInThread: MailboxRule[];
}

/** COMPLIANCE-PACK MATERIAL. Mailbox response tracking reads message text.
 *  Run it only where the mailbox provider is covered by whatever agreement
 *  the compliance pack requires. Read-through: nothing fetched is stored. */
export interface MailboxComplianceConfig {
  /** Must be true, together with a `compliance.pack` other than `none`. */
  enabled: boolean;
  /** The mailbox the system sends its own notifications from. */
  address?: string;
  /** How far from the lead's own timestamp a message from us can be and still
   *  be its notification (not a reply). BoH: 10. */
  notificationWindowMinutes: number;
  /** Replies faster than this are flagged as likely autoresponders. BoH: 2. */
  autoReplyUnderMinutes: number;
  /** Classification rules. Defaults to `defaultMailboxOutcomeRules`. */
  rules?: MailboxOutcomeRules;
}
