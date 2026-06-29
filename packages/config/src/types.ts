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
  /** Host substrings that identify a citation/mention as living on this source
   *  (lowercased, matched as substrings against a URL host). e.g. ["reddit.com"]. */
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

/** Referer-source needle groups, lowercased substring matches. Domain-agnostic
 *  — a non-social-media business overrides these. */
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

/** One high-contrast carousel color scheme (BoH `COLOR_SCHEMES`). */
export interface CarouselScheme {
  id: string;
  label: string;
  bg: string;
  fg: string;
  accent: string;
}

/** Config for the amplification kit + IG carousel + newsletter content gen.
 *  Optional on the pack — `@jeldon/amplify` falls back to `defaultAmplifyConfig`. */
export interface AmplifyConfig {
  /** Distribution channels the full kit produces. */
  channels: AmplifyChannel[];
  /** Extra preamble lines about the brand/role for the kit system prompt.
   *  The voice block itself comes from `pack.voice` — this is just the
   *  "you are a content distribution editor for X" framing. */
  systemPreamble: string;
  /** IG carousel color schemes (the model picks one, the host renders it). */
  carouselSchemes: CarouselScheme[];
  /** The carousel design system prompt (hook/reveal/payoff playbook). Domain
   *  voice still injected from `pack.voice`; this is the structural craft. */
  carouselGuidance: string;
  /** Newsletter content spec: the subject/body shape paragraph. */
  newsletterGuidance: string;
  /** Repo-relative dir holding `<slug>.json` carousel sidecars. Default
   *  `src/data/carousel-state`. */
  carouselStateDir?: string;
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
export interface DraftingConfig {
  /** Alias → provider model id. BoH: sonnet/opus/haiku. The default-draft model
   *  alias is `defaultModel`; the cheap claim-extraction model is `utilityModel`. */
  models: Record<string, string>;
  defaultModel: string;
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
 *  `needles` are lowercased substrings; the first rule whose any-needle matches
 *  the (lowercased) host/source wins. `drop:true` suppresses the source
 *  entirely (e.g. internal nav, an auth redirect). */
export interface RefererChannelRule {
  /** Friendly channel label, e.g. "Google Search". Ignored when `drop` is set. */
  label?: string;
  /** Lowercased substrings; any match selects this rule. */
  needles: string[];
  /** When true, a matching host is excluded from the source breakdown. */
  drop?: boolean;
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
    defaultAuthorSlug: string;
    timezone: string;
    lifecycle?: { docReviewed?: boolean };
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
  };
}
