/**
 * schema.org OpeningHoursSpecification from the hours data
 * (`pack.brand.hours` or the refreshed data file; see @jeldon/business-info).
 * Ported from Body of Health `src/lib/hours.ts::toSchemaSpecifications`.
 */
import type { DayHours, SpecialHours } from '@jeldon/config';
import type { JsonLd } from './types.js';

type HoursInput = { regularHours: DayHours[]; specialHours?: SpecialHours[] };

/** One entry per day per interval (split shifts → several entries for the
 *  day, which aggregators handle). Closed days are omitted. */
export function openingHoursSpecification(hours: HoursInput): JsonLd[] {
  const out: JsonLd[] = [];
  for (const d of hours.regularHours ?? []) {
    if (!Array.isArray(d.intervals)) continue;
    for (const iv of d.intervals) {
      if (!iv?.opens || !iv?.closes) continue;
      out.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: d.day, opens: iv.opens, closes: iv.closes });
    }
  }
  return out;
}

/**
 * Date-specific overrides for `specialOpeningHoursSpecification`, limited to
 * dates on or after `today` (YYYY-MM-DD in the business timezone) when given.
 * A closed date is emitted as opens = closes = "00:00", the documented
 * schema.org form for "closed all day".
 */
export function specialOpeningHoursSpecification(hours: HoursInput, today?: string): JsonLd[] {
  const out: JsonLd[] = [];
  for (const s of hours.specialHours ?? []) {
    if (typeof s?.date !== 'string' || (today && s.date < today)) continue;
    const ivs = (s.intervals ?? []).filter((iv) => iv?.opens && iv?.closes);
    const base = { '@type': 'OpeningHoursSpecification', validFrom: s.date, validThrough: s.date };
    if (!ivs.length) out.push({ ...base, opens: '00:00', closes: '00:00' });
    for (const iv of ivs) out.push({ ...base, opens: iv.opens, closes: iv.closes });
  }
  return out;
}
