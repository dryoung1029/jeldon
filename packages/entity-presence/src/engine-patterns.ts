import { defaultEntityPresenceConfig, type EntityPresenceConfig } from '@jeldon/config';
import type { EngineCitationPattern } from './types.js';

/**
 * Resolve the per-engine off-site citation patterns from config. Encodes the
 * AEO-PLAYBOOK finding that each answer engine weights different third-party
 * surfaces (Reddit → Perplexity, Wikipedia/consensus → ChatGPT, structured
 * depth → Claude). Pure read of `entityPresence.engineAffinities` joined to the
 * source labels — the values are data, this is the lookup/ranking.
 */

/** All engines' patterns, ranked. */
export function allEngineCitationPatterns(
  cfg: EntityPresenceConfig = defaultEntityPresenceConfig,
): EngineCitationPattern[] {
  return cfg.engineAffinities.map((a) => rank(a.engine, a.affinity, a.note, cfg));
}

/**
 * The citation pattern for ONE engine. Returns the engine's source affinities
 * sorted strongest-first with labels resolved, plus the single top source to
 * prioritize. Throws nothing — an unknown engine yields an empty, top-null
 * pattern so callers don't have to special-case it.
 */
export function perEngineCitationPatterns(
  engine: string,
  cfg: EntityPresenceConfig = defaultEntityPresenceConfig,
): EngineCitationPattern {
  const found = cfg.engineAffinities.find((a) => a.engine === engine);
  if (!found) {
    return { engine, ranked: [], topSourceId: null };
  }
  return rank(found.engine, found.affinity, found.note, cfg);
}

function rank(
  engine: string,
  affinity: Record<string, number>,
  note: string | undefined,
  cfg: EntityPresenceConfig,
): EngineCitationPattern {
  const labelOf = new Map(cfg.sources.map((s) => [s.id, s.label] as const));
  const ranked = Object.entries(affinity)
    .map(([sourceId, value]) => ({
      sourceId,
      label: labelOf.get(sourceId) ?? sourceId,
      affinity: value,
    }))
    .sort((a, b) => b.affinity - a.affinity);
  return {
    engine,
    note,
    ranked,
    topSourceId: ranked.length > 0 ? (ranked[0]?.sourceId ?? null) : null,
  };
}
