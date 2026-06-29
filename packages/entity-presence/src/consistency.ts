import { defaultEntityPresenceConfig, type EntityPresenceConfig } from '@jeldon/config';
import type {
  BrandContract,
  FieldConsistency,
  MentionConsistencyReport,
  OffSiteMention,
  SourceConsistency,
} from './types.js';

/**
 * Cross-source brand-mention consistency. Classifies each discovered mention to
 * a configured source (by host substring), counts presence per source, and on
 * listing-style surfaces (`napConsistencyChecked`) verifies the canonical
 * name + NAP strings appear verbatim. A drift — an old phone number on a stale
 * directory listing — is the consistency signal AI engines penalize.
 *
 * NEW behavior (no source-system equivalent). Designed from
 * docs/AEO-PLAYBOOK.md §"Off-site entity presence". Pure given its inputs;
 * fetching the mentions is the host's job (see `MentionProvider`).
 */
export function checkMentionConsistency(
  brand: BrandContract,
  sources: OffSiteMention[],
  cfg: EntityPresenceConfig = defaultEntityPresenceConfig,
): MentionConsistencyReport {
  const threshold = cfg.establishedThreshold ?? 3;

  // Bucket mentions by the first source whose host needle matches.
  const bySource = new Map<string, OffSiteMention[]>();
  for (const m of sources) {
    const host = hostOf(m.url);
    const src = cfg.sources.find((s) => s.hostNeedles.some((n) => host.includes(n.toLowerCase())));
    if (!src) continue;
    const bucket = bySource.get(src.id) ?? [];
    bucket.push(m);
    bySource.set(src.id, bucket);
  }

  const sourceReports: SourceConsistency[] = [];
  let mismatchCount = 0;

  for (const src of cfg.sources) {
    const mentions = bySource.get(src.id);
    if (!mentions || mentions.length === 0) continue;

    const napChecked = src.napConsistencyChecked === true;
    const fields: FieldConsistency[] = [];

    if (napChecked) {
      for (const [field, expected] of Object.entries(brand.nap)) {
        const offendingUrls: string[] = [];
        let sawAny = false;
        for (const m of mentions) {
          const hay = (m.text ?? '').toLowerCase();
          // Only mentions that carry text can be checked; a bare URL is
          // 'absent' evidence (we can't confirm consistency without the body).
          if (!hay) continue;
          sawAny = true;
          if (!hay.includes(expected.toLowerCase())) offendingUrls.push(m.url);
        }
        const status: FieldConsistency['status'] = !sawAny
          ? 'absent'
          : offendingUrls.length > 0
            ? 'mismatch'
            : 'consistent';
        if (status === 'mismatch') mismatchCount += 1;
        fields.push({ field, expected, status, offendingUrls });
      }
    }

    sourceReports.push({
      sourceId: src.id,
      label: src.label,
      mentionCount: mentions.length,
      established: mentions.length >= threshold,
      napChecked,
      fields,
    });
  }

  const missingSources = cfg.sources
    .filter((s) => !bySource.has(s.id))
    .map((s) => ({ sourceId: s.id, label: s.label, weight: s.weight }));

  return { sources: sourceReports, missingSources, mismatchCount };
}

/** Lowercased host of a URL, www-stripped. Tolerant of bare hosts. */
function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, '');
  } catch {
    return url.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] ?? url;
  }
}
