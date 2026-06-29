/**
 * @jeldon/competitive-intel — local-competitor intelligence.
 *
 * - `runAudit(opts)` audits one site (homepage + schema + sitemap + PSI + GBP +
 *   sampled-page stats + template-vendor detection + a homepage GEO citability
 *   score reused from @jeldon/core-scoring). ONE bundled core — the Astro
 *   Function and the Node cron both import it, killing the TS-lib ↔ JS-cron
 *   mirror that drifted in BoH.
 * - `extractPositioning(opts)` derives a competitor's keyword/segment/
 *   differentiator/theme positioning via Claude.
 * - `gapReport(opts)` streams a structured strategic memo (quick wins / content
 *   gaps / GBP gaps / our advantages) comparing us to a competitor.
 * - `trackLocalRanks(opts)` refreshes Google local-pack ranks per keyword via
 *   SerpApi (real local pack) with a Places-Text-Search fallback.
 *
 * Roster + target keywords come from `pack.competitors`; brand/voice +
 * template-vendor fingerprints come from the Domain Pack. The GEO score reuses
 * @jeldon/core-scoring (never re-implemented here). I/O is behind `Fetcher` /
 * `RanksStore` with fs/null defaults.
 *
 * Ported from Body of Health `competitor-scanner.ts`, `audit-competitors.mjs`,
 * `competitor-positioning.ts`, `competitor-gap-report.ts`, `keyword-ranks.ts`.
 */

// Scanner (the single source for both the Function and the cron)
export {
  runAudit,
  auditHomepage,
  auditSitemap,
  auditRobots,
  auditPageSpeed,
  auditGbp,
  samplePages,
  computePageStats,
  detectTemplateVendor,
  compareAudits,
  geoScoreHtml,
  type RunAuditOptions,
} from './scanner.js';

// HTML mechanics (re-exported for hosts that need the projection/extraction)
export {
  htmlToScorableMarkdown,
  extractSchema,
  stripTags,
  decode,
  pick,
  originOf,
  type SchemaAuditResult,
} from './html.js';

// Fetcher (the network boundary + default)
export { DefaultFetcher, defaultFetcher, type FetcherOptions } from './fetcher.js';

// Positioning extractor
export { extractPositioning, type ExtractPositioningOptions } from './positioning.js';

// Gap report (streaming)
export { gapReport, type GapReportOptions } from './gap-report.js';

// Local-pack rank tracking
export {
  trackLocalRanks,
  rankOneSerpApi,
  rankOnePlaces,
  aggregatePriorityKeywords,
  FsRanksStore,
  NullRanksStore,
  type TrackLocalRanksOptions,
  type TrackLocalRanksResult,
  type PriorityKeyword,
} from './ranks.js';

// Prompt builders (brand/voice → SYSTEM prompts)
export {
  buildPositioningSystem,
  buildGapReportSystem,
  type PromptBrand,
} from './prompts.js';

// Pack adapters
export {
  scannerConfigFromPack,
  geoConfigFromPack,
  competitorsFromPack,
  rankKeysFromEnv,
  scannerKeysFromEnv,
} from './pack.js';

// Scanner config
export {
  resolveScannerConfig,
  defaultScannerConfig,
  type ScannerConfig,
} from './config.js';

// Types
export type {
  Fetcher,
  FetchResult,
  HomepageAudit,
  SchemaAudit,
  SitemapAudit,
  RobotsAudit,
  PageSpeedAudit,
  PageSpeedScores,
  GbpAudit,
  SampledPage,
  PageStats,
  TemplateVendor,
  Positioning,
  CompetitorAudit,
  GapSignal,
  GapReport,
  KeywordRank,
  RanksFile,
  RanksStore,
  RankKeys,
  RankMethod,
  CompetitorEntry,
  CompetitorsConfig,
} from './types.js';
