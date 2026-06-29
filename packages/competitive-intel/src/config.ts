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

// Ported verbatim from BoH competitor-scanner.ts::HIGH_VALUE_PATTERNS. The
// health-vertical service/condition terms are the part a non-clinic domain
// overrides via pack.competitors.highValuePatterns.
const DEFAULT_HIGH_VALUE_PATTERNS = [
  '/(services?|treatments?|conditions?|specialt(?:y|ies)|care|therapy|therapies)/',
  '/(chiropractic|massage|acupuncture|adjust|spinal|spine|rehab|wellness|injury|pain)\\b',
  '/(back-?pain|neck-?pain|headache|migraine|sciatica|whiplash|sports?-?injur|auto-?accident|pregnan|prenatal|webster|extremit|shoulder|knee|hip|tmj|carpal|plantar|posture)',
  '/(blog|articles?|news|posts?|resources?|education)/',
];

// Ported verbatim from BoH competitor-scanner.ts::SKIP_PATTERNS.
const DEFAULT_SKIP_PATTERNS = [
  '/(contact|location|hours|appointment|book|schedule|privacy|terms|sitemap|search|tag|category|author|404|test)',
  '\\.(pdf|jpg|jpeg|png|gif|webp|svg|xml|css|js|ico)(\\?|$)',
  '^https?://[^/]+/?$', // homepage itself
];

// Ported from BoH competitor-scanner.ts::detectTemplateVendor's fingerprint
// matchers. The original had bespoke per-vendor logic (raw-html vs lowercased
// match); we normalize to "regex source against the raw homepage HTML", which
// reproduces every original match (the lowercased ones are folded in with `i`).
const DEFAULT_TEMPLATE_VENDORS = [
  { name: 'chiromatrix', fingerprints: ['cdcssl\\.ibsrv\\.net', 'chiromatrix'] },
  {
    name: 'solutionreach',
    fingerprints: [
      '<meta[^>]+(?:name|property)=["\']generator["\'][^>]+(?:solutionreach|sr-pulse)',
      'solutionreach\\.com',
      'sr-cdn',
    ],
  },
  { name: 'ihealth-spot', fingerprints: ['ihealthspot\\.com', 'ihealthspot-cdn'] },
];

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
