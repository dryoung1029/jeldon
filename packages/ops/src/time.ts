export const DAY_MS = 86_400_000;

/** Parse an ISO timestamp; null when absent or unparseable (never NaN). */
export function parseTime(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

export function toMs(now: Date | number): number {
  return typeof now === 'number' ? now : now.getTime();
}

export const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Whole days since a `YYYY-MM-DD` date key, anchored at 12:00 UTC so a date
 *  never flips a day early or late across time zones. */
export function daysSinceDateKey(dateKey: string, now: Date | number): number {
  return Math.floor((toMs(now) - new Date(`${dateKey.slice(0, 10)}T12:00:00Z`).getTime()) / DAY_MS);
}

/** A value the engine could not establish. Distinct from `null` ("none
 *  exists") so a failed read never reads as an answer. */
export interface Unattestable {
  unattestable: true;
  reason: string;
}

export function unattestable(reason: string): Unattestable {
  return { unattestable: true, reason };
}

export function isUnattestable(v: unknown): v is Unattestable {
  return typeof v === 'object' && v !== null && (v as Unattestable).unattestable === true;
}
