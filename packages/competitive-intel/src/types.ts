import type { CompetitorEntry, CompetitorsConfig } from '@jeldon/config';

export type { CompetitorEntry, CompetitorsConfig };

// ---------------------------------------------------------------------------
// HTTP boundary (the I/O interface — see docs/DECOUPLING-NOTES.md)
// ---------------------------------------------------------------------------

/** What `fetchHtml` returns. `via` records whether a JS-rendering proxy
 *  (ScrapingBee) served the page or it came back via plain fetch. */
export interface FetchResult {
  ok: boolean;
  status: number;
  finalUrl: string;
  html: string;
  error?: string;
  via: 'proxy' | 'plain';
  /** Proxy error reason when the proxy was tried but fell back to plain fetch. */
  proxyError?: string;
}

/**
 * The network boundary. The scanner never calls `fetch` directly — it reaches
 * through a `Fetcher` so a host can swap in a rendering proxy, a cache, or a
 * test double. `defaultFetcher` (in `fetcher.ts`) wraps global `fetch` with the
 * optional ScrapingBee path, faithfully porting BoH `competitor-scanner.ts::fetchHtml`.
 */
export interface Fetcher {
  fetchHtml(url: string): Promise<FetchResult>;
}

// ---------------------------------------------------------------------------
// Audit signal shapes (ported verbatim from competitor-scanner.ts)
// ---------------------------------------------------------------------------

export type HomepageAudit = {
  url: string;
  finalUrl: string;
  status: number;
  fetchedVia?: 'proxy' | 'plain';
  proxyError?: string;
  htmlBytes: number;
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  lang: string | null;
  viewport: boolean;
  h1: string[];
  h2Count: number;
  wordCount: number;
  imageCount: number;
  imagesWithAlt: number;
  internalLinks: number;
  externalLinks: number;
  ogTags: { title: boolean; description: boolean; image: boolean; url: boolean; type: boolean };
  twitterTags: { card: boolean; title: boolean; image: boolean };
  favicon: boolean;
  hasBlogHint: boolean;
  hasFaqHint: boolean;
  hasTeamHint: boolean;
  /** GEO ("citability") score for the homepage, computed via @jeldon/core-scoring's
   *  `calculateGeo()` against a markdown-ish projection of the HTML. Same checks
   *  the article scorer uses; same 0-100 scale, driven by `pack.scoring.geo`. */
  geoScore: number;
  geoBadCount: number;
  geoMehCount: number;
};

export type SchemaAudit = {
  types: string[];
  raw: unknown[];
  count: number;
  /** Per-type set of populated top-level field names — lets the gap report tell
   *  "Organization exists with full NAP" from "Organization exists but bare". */
  fieldsByType?: Record<string, string[]>;
};

export type SitemapAudit = {
  found: boolean;
  url: string | null;
  urlCount: number;
  lastmod: string | null;
};

export type RobotsAudit = {
  found: boolean;
  blocksRoot: boolean;
};

export type PageSpeedScores = {
  performance: number | null;
  seo: number | null;
  accessibility: number | null;
  bestPractices: number | null;
};

export type PageSpeedAudit = {
  mobile: PageSpeedScores | null;
  desktop: PageSpeedScores | null;
  lcp: number | null;
  cls: number | null;
  fcp: number | null;
  error?: string;
  partial?: string;
};

export type GbpAudit = {
  rating: number | null;
  reviewCount: number | null;
  responseRate: number | null;
  photoCount: number | null;
  hoursComplete: boolean | null;
  category: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  lastReviewAt: string | null;
  error?: string;
};

export type SampledPage = {
  url: string;
  title: string | null;
  h1: string[];
  h2: string[];
  excerpt: string;
  schemaTypes: string[];
  wordCount: number;
  h2Count: number;
  internalLinks: number;
  externalLinks: number;
};

/** Aggregate structural signals across the sampled pages. */
export type PageStats = {
  count: number;
  avgWordCount: number;
  medianWordCount: number;
  minWordCount: number;
  maxWordCount: number;
  /** Pages < `thinPageWordFloor` words — template-stub signal. */
  thinPageCount: number;
  avgH2Count: number;
  avgInternalLinks: number;
  /** Union of schema types from all sampled pages. */
  sitewideSchemaTypes: string[];
};

/** Detected template/CMS fingerprint, or null. The vendor names come from
 *  config (`pack.competitors.templateVendors`); `generic-template` is the
 *  built-in structural heuristic (polished homepage + thin service pages). */
export type TemplateVendor = string | null;

export type Positioning = {
  generatedAt: string;
  model: string;
  keywords: Array<{ phrase: string; weight: number; intent: 'commercial' | 'informational' | 'navigational' | 'local' }>;
  marketingSegments: string[];
  differentiators: string[];
  contentThemes: string[];
  summary: string;
};

export type CompetitorAudit = {
  fetchedAt: string;
  homepage: HomepageAudit | null;
  homepageText: string | null;
  schemaOrg: SchemaAudit | null;
  sitemap: SitemapAudit | null;
  robots: RobotsAudit | null;
  pageSpeed: PageSpeedAudit | null;
  gbp: GbpAudit | null;
  pages: SampledPage[];
  pageStats: PageStats | null;
  templateVendor: TemplateVendor;
  positioning: Positioning | null;
  errors: string[];
};

export type GapSignal = { label: string; us: string; them: string; advantage: 'us' | 'them' | 'tie' };

// ---------------------------------------------------------------------------
// Gap report (ported from competitor-gap-report.ts)
// ---------------------------------------------------------------------------

export type GapReport = {
  summary: string;
  quickWins: Array<{ action: string; rationale: string; effort: 'low' | 'medium' | 'high' }>;
  contentGaps: Array<{
    suggestedTitle: string;
    targetQuery: string;
    keyPoints: string[];
    category: string;
    priority: 'high' | 'medium' | 'low';
    rationale: string;
  }>;
  gbpGaps: Array<{ action: string; rationale: string }>;
  ourAdvantages: Array<{ advantage: string; howToLeanIn: string }>;
  generatedAt: string;
  model: string;
};

// ---------------------------------------------------------------------------
// Local-pack rank tracking (ported from keyword-ranks.ts)
// ---------------------------------------------------------------------------

export type RankMethod = 'serpapi-local' | 'places';

export type KeywordRank = {
  keyword: string;
  /** 1-based position in the results, or null if not in the returned top N. */
  rank: number | null;
  totalReturned: number;
  topCompetitors: Array<{ name: string; rank: number; isUs: boolean }>;
  /** Maps competitor id → 1-based rank if seen in the top N, else null. */
  competitorRanks?: Record<string, number | null>;
  sampledAt: string;
  method?: RankMethod;
};

export type RanksFile = {
  ranks: Record<string, KeywordRank>;
  lastRun: string | null;
  method?: RankMethod;
  /** The local-pack location string used (SerpApi runs). */
  location?: string;
};

/** I/O boundary for the rolling rank cache (the `keyword-ranks.json` file in
 *  BoH). `FsRanksStore` is the cron default, `NullRanksStore` for tests/dry-runs;
 *  a host backed by GitHub/S3 implements the same two methods. */
export interface RanksStore {
  read(): Promise<RanksFile>;
  write(data: RanksFile): Promise<void>;
}

/** API keys + the localized search location for rank tracking. */
export interface RankKeys {
  serpapi?: string;
  places?: string;
}
