import type { AeoConfig, DomainPack } from '@jeldon/config';
import { buildEngines, type EngineKeys } from './engines.js';
import type { BrandMatch, Engine } from './types.js';

/**
 * Derive the audit's runtime inputs from a loaded Domain Pack. Keeps every
 * domain literal (brand URL, mentions, query set, engine list, location) read
 * from `pack` rather than hardcoded — the whole point of the port.
 */

/** Brand-match contract from the pack: site host + prose mentions. */
export function brandMatchFromPack(pack: Pick<DomainPack, 'brand' | 'aeo'>): BrandMatch {
  return {
    url: hostOf(pack.brand.siteUrl),
    mentions: pack.aeo.brandMentions,
  };
}

/** Strip scheme + path so a citation URL on any subpath/scheme still matches.
 *  `https://www.example.com/x` -> `example.com` (www dropped for tolerance). */
function hostOf(siteUrl: string): string {
  try {
    const host = new URL(siteUrl).host.toLowerCase();
    return host.replace(/^www\./, '');
  } catch {
    // Already a bare host or malformed — normalize best-effort.
    return siteUrl.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] ?? siteUrl;
  }
}

/** Build the active engine registry for a pack + the keys present in env. */
export function enginesFromPack(aeo: AeoConfig, keys: EngineKeys): Engine[] {
  return buildEngines(aeo.engines, keys, aeo.localSearchLocation);
}

/** Read engine API keys from a process-env-like record (no direct process
 *  coupling — pass `process.env` at the host). Mirrors the BoH cron's env names. */
export function engineKeysFromEnv(env: Record<string, string | undefined>): EngineKeys {
  return {
    perplexity: env.PERPLEXITY_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
    serpapi: env.SERPAPI_KEY,
    openai: env.OPENAI_API_KEY,
  };
}
