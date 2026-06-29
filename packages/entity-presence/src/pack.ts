import { defaultEntityPresenceConfig, type DomainPack, type EntityPresenceConfig } from '@jeldon/config';
import type { BrandContract } from './types.js';

/**
 * Derive the module's runtime inputs from a loaded Domain Pack. Every domain
 * literal (brand name, NAP, source set, engine affinities) is read from `pack`
 * rather than hardcoded — the whole point of the engine being domain-agnostic.
 */

/** The entity-presence config for a pack, falling back to the default set when
 *  `pack.entityPresence` is omitted (same fallback contract as the other
 *  optional growth modules). */
export function entityPresenceConfigFromPack(
  pack: Pick<DomainPack, 'entityPresence'>,
): EntityPresenceConfig {
  return pack.entityPresence ?? defaultEntityPresenceConfig;
}

/**
 * Build the brand-consistency contract. Precedence per field:
 * `entityPresence.consistencyTargets` (explicit) wins; otherwise the canonical
 * value is synthesized from `pack.brand` (name + NAP). This mirrors the
 * env→config→default precedence the source system's `site-config.ts` used.
 */
export function consistencyTargetsFromPack(
  pack: Pick<DomainPack, 'brand' | 'entityPresence'>,
): BrandContract {
  const cfg = entityPresenceConfigFromPack(pack);
  const targets = cfg.consistencyTargets;
  const name = targets?.name ?? pack.brand.name;

  // Explicit targets win wholesale; else assemble NAP from the brand block.
  if (targets?.nap && Object.keys(targets.nap).length > 0) {
    return { name, nap: { ...targets.nap } };
  }

  const nap: Record<string, string> = {};
  const b = pack.brand.nap;
  if (b?.address) nap.address = b.address;
  if (b?.phone) nap.phone = b.phone;
  if (pack.brand.siteUrl) nap.url = pack.brand.siteUrl;
  return { name, nap };
}
