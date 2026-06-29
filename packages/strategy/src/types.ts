// Public types for the strategy engine. Inputs/outputs live here (like
// core-scoring keeps ScorableInput local); the *tuning* (thresholds, copy
// templates, deep-links) lives in @jeldon/config's StrategyConfig so the same
// engine specializes per domain without code edits.

export type Priority = 'high' | 'medium' | 'low';

/** Recommendation categories. Open string union so a domain can introduce its
 *  own buckets via custom rules without an engine change. */
export type RecommendationCategory =
  | 'health'
  | 'content'
  | 'aeo'
  | 'distribution'
  | 'seo'
  | (string & {});

export interface Recommendation {
  id: string;
  priority: Priority;
  category: RecommendationCategory;
  title: string;
  evidence: string;
  link?: string;
  linkLabel?: string;
}

/** Per-article health, joined in by the host (it already reads every article). */
export interface ArticleHealth {
  slug: string;
  title: string;
  /** Content category — keys into `content.categoryTargets`. */
  category: string;
  geo: number;
  seo: number;
  hasAudio: boolean;
}

/** Edge/CDN analytics window. Domain-agnostic shape — the host's analytics
 *  adapter (Cloudflare in BoH, anything else elsewhere) maps into this. */
export interface CfWindow {
  windowDays: number;
  referrersDays: number;
  topPaths: Array<{ path: string; requests: number }>;
  top404Paths?: Array<{ path: string; requests: number }>;
  referrers: Array<{ source: string; requests: number }>;
  statuses: Array<{ status: number; requests: number }>;
}

export interface CrawlerActivity {
  totalHits: number;
  bots: Array<{ purpose: string; count: number }>;
}

export interface StrategyInput {
  cf: CfWindow | null;
  crawlers: CrawlerActivity | null;
  articles: ArticleHealth[];
  keywords: Array<{ keyword: string; ourRank: number | null }>;
}

/** Built-in rule identifiers. A RuleSet toggles these on/off and (optionally)
 *  overrides their per-rule priority. Audio/podcast and AEO rules ship OFF by
 *  default — they only make sense when the host has those surfaces. */
export type BuiltinRuleId =
  | 'health-404'
  | 'health-5xx'
  | 'geo-citability'
  | 'audio-coverage'
  | 'dist-social'
  | 'seo-climb'
  | 'aeo-live-crawl';

export interface RuleToggle {
  /** A built-in rule id, or a host-defined id (ignored by the engine unless a
   *  matching built-in exists — reserved for future custom-rule plugins). */
  id: BuiltinRuleId | (string & {});
  enabled: boolean;
}

/** Which rules run, in what order of definition. The engine evaluates only
 *  enabled rules; final ordering is by priority then definition order. */
export interface RuleSet {
  rules: RuleToggle[];
}
