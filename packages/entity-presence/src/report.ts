import type { DomainPack } from '@jeldon/config';
import { checkMentionConsistency } from './consistency.js';
import { allEngineCitationPatterns } from './engine-patterns.js';
import { consistencyTargetsFromPack, entityPresenceConfigFromPack } from './pack.js';
import { NullMentionProvider } from './provider.js';
import type {
  EntityPresenceReport,
  MentionConsistencyReport,
  MentionProvider,
  PresenceActionItem,
} from './types.js';

/** What `entityPresenceReport` needs from the pack — a narrow slice so callers
 *  can pass a partial in tests. */
export type PresencePack = Pick<DomainPack, 'brand' | 'entityPresence'>;

export interface EntityPresenceReportOptions {
  /** Off-site mention discovery. Defaults to `NullMentionProvider` (no I/O) so
   *  the report runs with zero external calls — it then reflects the configured
   *  source set as presence gaps. */
  provider?: MentionProvider;
  /** Discovery query handed to the provider. Defaults to a quoted brand-name
   *  search string built from the pack. */
  query?: string;
}

/**
 * Assemble the off-site entity-presence report for a domain. Joins:
 *   1. discovered off-site mentions → cross-source consistency,
 *   2. the per-engine source-affinity map (Reddit→Perplexity, etc.),
 *   3. deterministic action items (presence gaps on high-weight sources +
 *      NAP mismatches), highest-leverage first.
 *
 * NEW module — designed from docs/AEO-PLAYBOOK.md §"The biggest lever the
 * source system doesn't have yet". The only host coupling (mention discovery)
 * is behind `MentionProvider`; everything else is a pure read of the pack.
 *
 * TODO(port): no source-system code to lift — this surface never existed in
 * Body of Health. The control flow + action-item rules below are the real
 * structure; the live discovery provider is the one stub (see `provider.ts`).
 */
export async function entityPresenceReport(
  pack: PresencePack,
  opts: EntityPresenceReportOptions = {},
): Promise<EntityPresenceReport> {
  const cfg = entityPresenceConfigFromPack(pack);
  const brand = consistencyTargetsFromPack(pack);
  const provider = opts.provider ?? new NullMentionProvider();
  const query = opts.query ?? `"${brand.name}"`;

  const mentions = await provider.discover(query);
  const hasData = mentions.length > 0;

  const consistency = checkMentionConsistency(brand, mentions, cfg);
  const enginePatterns = allEngineCitationPatterns(cfg);
  const actionItems = buildActionItems(consistency, cfg.establishedThreshold ?? 3);

  return {
    brandName: brand.name,
    hasData,
    consistency,
    enginePatterns,
    actionItems,
  };
}

/**
 * Deterministic, evidence-backed action items from the consistency report.
 * Two rule families:
 *   - PRESENCE GAP — a configured source the brand isn't on (or isn't
 *     established on). Priority scales with the source weight, because
 *     high-weight surfaces (Reddit/Wikipedia/listicles) are where the ~3×
 *     correlation lives.
 *   - NAP MISMATCH — a listing-style source whose canonical name/NAP drifted.
 *     Always high — a wrong phone number actively hurts.
 */
export function buildActionItems(
  consistency: MentionConsistencyReport,
  establishedThreshold: number,
): PresenceActionItem[] {
  const items: PresenceActionItem[] = [];

  // NAP mismatches first — they actively mislead AI answers.
  for (const src of consistency.sources) {
    for (const f of src.fields) {
      if (f.status === 'mismatch') {
        items.push({
          priority: 'high',
          sourceId: src.sourceId,
          action: `Correct the ${f.field} on ${src.label}`,
          why: `${src.label} shows a ${f.field} that doesn't match the canonical "${f.expected}" on ${f.offendingUrls.length} page(s). Inconsistent NAP across off-site surfaces erodes the entity-consistency signal answer engines weight.`,
        });
      }
    }
  }

  // Presence gaps — no mention at all on a configured source.
  const sortedMissing = [...consistency.missingSources].sort((a, b) => b.weight - a.weight);
  for (const m of sortedMissing) {
    items.push({
      priority: m.weight >= 0.8 ? 'high' : m.weight >= 0.5 ? 'medium' : 'low',
      sourceId: m.sourceId,
      action: `Establish presence on ${m.label}`,
      why: `No ${m.label} mention found. Off-site mentions correlate ~3× stronger with AI visibility than backlinks; ${m.label} is a weight-${m.weight} surface in this domain's source set.`,
    });
  }

  // Under-established sources — present but below the "established" threshold.
  for (const src of consistency.sources) {
    if (!src.established && src.mentionCount > 0) {
      items.push({
        priority: 'medium',
        sourceId: src.sourceId,
        action: `Deepen presence on ${src.label}`,
        why: `Only ${src.mentionCount} mention(s) on ${src.label} (established = ${establishedThreshold}+). A single stray mention reads as noise to answer engines; a consistent thread of references reads as an established entity.`,
      });
    }
  }

  return items;
}
