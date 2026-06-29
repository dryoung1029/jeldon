/**
 * @jeldon/crawler-analytics — domain-agnostic AI-crawler detection, Cloudflare
 * edge-analytics ingestion, referer classification, and a first-party
 * engagement beacon.
 *
 * The couplings this package breaks (see docs/DECOUPLING-NOTES.md):
 *   - AI bot list ×2  → one injected `aiBotList` into `detectAiCrawler`.
 *   - Referer map ×3  → one injected `refererChannelMap` into `classifyReferer`.
 *   - Cloudflare       → `AnalyticsProvider` (CF adapter + `NullAnalytics`),
 *                        CF zone/account ids are config.
 *   - D1 `api/track`   → `EventStore` (D1 adapter + in-memory/null defaults).
 *
 * Gated by `capabilities.engagementAnalytics`. All config reads default to
 * `@jeldon/config`'s `defaultAnalyticsConfig` so callers can pass `pack.analytics`
 * (or nothing) without code changes.
 */

// AI-crawler detection + UA heuristics
export { detectAiCrawler, looksLikeBot, localDateKey, type DetectedCrawler } from './crawlers.js';

// Referer / source classification
export { classifyReferer, aggregateReferrers } from './referer.js';

// Edge-analytics provider
export {
  type AnalyticsProvider,
  NullAnalytics,
  CloudflareAnalytics,
  type CloudflareAnalyticsOpts,
  aggregateDayDetail,
  type RawHitRow,
  type TrafficSummary,
  type DailyTrafficRow,
  type ReferrerSummary,
  type DayDetail,
  type CrawlerSnapshot,
  type BotSnapshot,
} from './provider.js';

// Engagement beacon + event store
export {
  type EventStore,
  NullEventStore,
  InMemoryEventStore,
  D1EventStore,
  type D1Like,
  type EngagementEvent,
  parseEngagementBeacon,
  collectBeacon,
} from './engagement.js';

// Per-article traffic reader + writeback
export {
  type ArticleTraffic,
  type ArticleTrafficDay,
  type ArticleTrafficStore,
  emptyArticleTrafficStore,
  hasTrafficData,
  trafficLastUpdated,
  trafficWindowCovered,
  getArticleTraffic,
  getArticleTrafficFor,
  upsertArticleTrafficDay,
} from './article-traffic.js';

// AI-crawler snapshot store
export {
  type CrawlerSnapshotStore,
  emptyCrawlerSnapshotStore,
  upsertCrawlerSnapshot,
} from './snapshots.js';

// Re-export the config contract this package consumes, for convenience.
export {
  defaultAnalyticsConfig,
  type AnalyticsConfig,
  type AiBot,
  type RefererChannelRule,
} from '@jeldon/config';
