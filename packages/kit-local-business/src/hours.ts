import { DAY_KEYS, type DayKey } from './kit-config.js';

const DAY_NAMES: Record<DayKey, string> = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
};

/** '5:30 AM' → '05:30'; '7 PM' → '19:00'; null if unparseable. */
export function to24h(t: string): string | null {
  const m = t.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!m) {
    const h24 = t.trim().match(/^(\d{1,2}):(\d{2})$/);
    return h24 ? `${h24[1]!.padStart(2, '0')}:${h24[2]}` : null;
  }
  let h = Number(m[1]) % 12;
  if (m[3]!.toUpperCase() === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`;
}

export interface OpeningHoursSpecification {
  '@type': 'OpeningHoursSpecification';
  dayOfWeek: string;
  opens: string;
  closes: string;
}

/**
 * `{ Mon: '5:30 AM – 7:00 PM', … }` → schema.org OpeningHoursSpecification[].
 * Blank days are closed and omitted. Only call this once the owner has
 * CONFIRMED the hours (`site.hoursConfirmed`) — publishing guessed hours is
 * the "no invented business facts" rule in action.
 */
export function openingHoursSpec(hours: Partial<Record<DayKey, string>> | undefined): OpeningHoursSpecification[] {
  if (!hours) return [];
  const out: OpeningHoursSpecification[] = [];
  for (const day of DAY_KEYS) {
    const v = hours[day];
    if (!v) continue;
    const [open, close] = String(v).split(/\s*[–—-]\s*/);
    const o = to24h(open ?? '');
    const c = to24h(close ?? '');
    if (o && c) out.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: DAY_NAMES[day], opens: o, closes: c });
  }
  return out;
}
