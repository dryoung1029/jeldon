import type { CompetitorsConfig } from '@jeldon/config';

/**
 * Scanner tuning resolved from the Domain Pack's `competitors` block, with
 * package-local defaults for the knobs the pack contract doesn't carry. Every
 * regex here was a literal in BoH `competitor-scanner.ts` (the HIGH_VALUE_PATTERNS,
 * SKIP_PATTERNS, the vendor fingerprints, the thin-page floor). A non-clinic
 * domain re-points `highValuePatterns` / `skipPatterns` / `templateVendors` via
 * `pack.competitors` and gets the same engine.
 */
export interface ScannerConfig {
  /** Regex sources: URL paths where a competitor's marketing positioning lives
   *  (service/treatment/condition/blog pages). Compiled case-insensitively. */
  highValuePatterns: string[];
  /** Regex sources: URL paths to skip when sampling (contact/legal/assets/homepage). */
  skipPatterns: string[];
  /** Named vendor template fingerprints. Each fingerprint is a regex source
   *  matched against the homepage HTML; any hit labels the competitor with the
   *  vendor name. The generic structural heuristic is built-in, not here. */
  templateVendors: Array<{ name: string; fingerprints: string[] }>;
  /** Word count below which a sampled page counts as a thin stub. Default 300. */
  thinPageWordFloor: number;
  /** Generic-template heuristic: homepage must be >= this multiple of the
   *  service-page average word count. Default 3. */
  genericHomepageWordRatio: number;
  /** Generic-template heuristic: this fraction of sampled pages must be thin
   *  stubs. Default 0.5. */
  genericThinPageFraction: number;
  /** Min sampled pages before the generic-template heuristic can fire. Default 4. */
  genericMinSampledPages: number;
}

// Generic high-value paths: service/offering pages and the content hub. A
// domain adds its own vertical terms (product names, conditions, practice
// areas) via pack.competitors.highValuePatterns; `jeldon doctor` warns when
// capabilities.competitiveIntel is on and that field is unset. The original
// clinic-tuned list lives in fixtures/domain-packs/body-of-health.media.ts.
const DEFAULT_HIGH_VALUE_PATTERNS = [
  '/(services?|solutions?|products?|offerings?|specialt(?:y|ies))/',
  '/(blog|articles?|news|posts?|resources?|education|guides?)/',
];

// Ported verbatim from BoH competitor-scanner.ts::SKIP_PATTERNS.
const DEFAULT_SKIP_PATTERNS = [
  '/(contact|location|hours|appointment|book|schedule|privacy|terms|sitemap|search|tag|category|author|404|test)',
  '\\.(pdf|jpg|jpeg|png|gif|webp|svg|xml|css|js|ico)(\\?|$)',
  '^https?://[^/]+/?$', // homepage itself
];

// Named vendor fingerprints are vertical-specific (website builders that serve
// one industry), so the default is empty and only the built-in generic-template
// heuristic runs. A domain lists its vendors via pack.competitors.templateVendors;
// see fixtures/domain-packs/body-of-health.media.ts for a filled list.
const DEFAULT_TEMPLATE_VENDORS: Array<{ name: string; fingerprints: string[] }> = [];

export function resolveScannerConfig(competitors?: CompetitorsConfig): ScannerConfig {
  return {
    highValuePatterns: competitors?.highValuePatterns ?? DEFAULT_HIGH_VALUE_PATTERNS,
    skipPatterns: competitors?.skipPatterns ?? DEFAULT_SKIP_PATTERNS,
    templateVendors: competitors?.templateVendors ?? DEFAULT_TEMPLATE_VENDORS,
    thinPageWordFloor: 300,
    genericHomepageWordRatio: 3,
    genericThinPageFraction: 0.5,
    genericMinSampledPages: 4,
  };
}

export const defaultScannerConfig: ScannerConfig = resolveScannerConfig();
