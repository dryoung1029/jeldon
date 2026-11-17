/**
 * The two decision signals derived from Search Console, ported from Body of
 * Health `src/pages/api/admin/command/search.ts`. Pure; every threshold and
 * the CTR curve come from `pack.searchConsole`.
 *
 *  - strikingDistance: queries ranking just off page 1 (default 5–15) with
 *    real impressions — demand exists, one good edit moves them up. Sorted by
 *    impressions, biggest upside first.
 *  - lowCtr: rows already on page 1 whose CTR is well below the expected
 *    curve for their position — a title/meta rewrite buys clicks with no new
 *    content.
 */
import type { LowCtrConfig, SearchConsoleConfig, StrikingDistanceConfig } from '@jeldon/config';

export interface MetricRow {
  clicks: number;
  impressions: number;
  /** 0–1, not a percentage. */
  ctr: number;
  /** Average position, 1 = top. 0 means Google reported no position. */
  position: number;
}

/**
 * Expected CTR at a position. Rounds, then clamps into the curve: position
 * below 1 reads as 1, past the end reads as the last entry.
 */
export function expectedCtr(position: number, curve: number[]): number {
  if (!curve.length) throw new Error('expectedCtrCurve is empty');
  const p = Math.max(1, Math.min(curve.length, Math.round(position)));
  return curve[p - 1] as number;
}

const byImpressions = (a: MetricRow, b: MetricRow) => b.impressions - a.impressions;

export function strikingDistance<T extends MetricRow>(rows: readonly T[], cfg: StrikingDistanceConfig): T[] {
  return rows
    .filter((r) => r.position >= cfg.minPosition && r.position <= cfg.maxPosition && r.impressions >= cfg.minImpressions)
    .sort(byImpressions)
    .slice(0, cfg.limit);
}

export type LowCtrRow<T extends MetricRow> = T & { expectedCtr: number; ctrRatio: number };

export function lowCtr<T extends MetricRow>(rows: readonly T[], cfg: LowCtrConfig): LowCtrRow<T>[] {
  return rows
    .filter((r) => r.position > 0 && r.position <= cfg.maxPosition && r.impressions >= cfg.minImpressions)
    .map((r) => {
      const exp = expectedCtr(r.position, cfg.expectedCtrCurve);
      return { ...r, expectedCtr: exp, ctrRatio: exp > 0 ? r.ctr / exp : 0 };
    })
    .filter((r) => r.ctr < r.expectedCtr * cfg.ratio)
    .sort(byImpressions)
    .slice(0, cfg.limit);
}

/**
 * Both signals off a snapshot, with an explicit state instead of empty lists
 * that would read as "nothing to fix": `no_snapshot` when the cron has never
 * written one, `no_data` when it wrote one with no rows.
 */
export type SearchSignals<Q extends MetricRow, P extends MetricRow> =
  | { status: 'no_snapshot'; reason: string }
  | { status: 'no_data'; reason: string; lastUpdated: string | null }
  | { status: 'ok'; lastUpdated: string | null; strikingDistance: Q[]; lowCtr: LowCtrRow<P>[] };

export function searchSignals<Q extends MetricRow, P extends MetricRow>(
  snapshot: { lastUpdated?: string | null; queries?: Q[]; pages?: P[] } | null | undefined,
  cfg: Pick<SearchConsoleConfig, 'strikingDistance' | 'lowCtr'>,
): SearchSignals<Q, P> {
  if (!snapshot) return { status: 'no_snapshot', reason: 'no Search Console snapshot has been written yet' };
  const queries = snapshot.queries ?? [];
  const pages = snapshot.pages ?? [];
  if (!snapshot.lastUpdated || (!queries.length && !pages.length)) {
    return {
      status: 'no_data',
      reason: 'snapshot has no query or page rows',
      lastUpdated: snapshot.lastUpdated ?? null,
    };
  }
  return {
    status: 'ok',
    lastUpdated: snapshot.lastUpdated,
    strikingDistance: strikingDistance(queries, cfg.strikingDistance),
    lowCtr: lowCtr(pages, cfg.lowCtr),
  };
}
