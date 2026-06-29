import type { CompetitorsConfig, DomainPack } from '@jeldon/config';
import { resolveScannerConfig, type ScannerConfig } from './config.js';
import type { RankKeys } from './types.js';

/**
 * Derive competitive-intel runtime inputs from a loaded Domain Pack. Keeps every
 * domain literal (roster, target keywords, our place id, local-pack location,
 * vendor fingerprints, the GEO scoring weights) read from `pack` rather than
 * hardcoded — the point of the port.
 */

/** Resolve the scanner tuning (URL patterns, vendor fingerprints, thresholds). */
export function scannerConfigFromPack(pack: Pick<DomainPack, 'competitors'>): ScannerConfig {
  return resolveScannerConfig(pack.competitors);
}

/** The GEO scoring config the homepage citability score uses. */
export function geoConfigFromPack(pack: Pick<DomainPack, 'scoring'>) {
  return pack.scoring.geo;
}

/** The competitors block, or null when the capability is off / unconfigured. */
export function competitorsFromPack(pack: Pick<DomainPack, 'competitors'>): CompetitorsConfig | null {
  return pack.competitors ?? null;
}

/** Read rank-tracking API keys from a process-env-like record (no direct
 *  process coupling — pass `process.env` at the host). Mirrors the BoH env names. */
export function rankKeysFromEnv(env: Record<string, string | undefined>): RankKeys {
  return {
    serpapi: env.SERPAPI_KEY,
    places: env.GOOGLE_PLACES_API_KEY,
  };
}

/** Read scanner API keys (PageSpeed + Places + ScrapingBee) from env. */
export function scannerKeysFromEnv(env: Record<string, string | undefined>): {
  pageSpeedKey?: string;
  placesKey?: string;
  scrapingBeeKey?: string;
} {
  return {
    pageSpeedKey: env.GOOGLE_PAGESPEED_API_KEY,
    placesKey: env.GOOGLE_PLACES_API_KEY,
    scrapingBeeKey: env.SCRAPINGBEE_KEY,
  };
}
