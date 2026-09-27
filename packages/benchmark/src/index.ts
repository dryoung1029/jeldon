/**
 * @jeldon/benchmark — "better in every way that can be measured, worse in none".
 *
 *   runBenchmark({ oldUrl, newUrl })       → Scorecard (old vs new, live)
 *   runBenchmark({ newUrl, baseline })     → Scorecard vs a stored baseline (--ci)
 *   snapshotSite(url) + measureAll(snap)   → the pieces
 *   measurementsToBaseline(...)            → what `jeldon init` stores on day one
 *
 * Fetching and GEO scoring reuse @jeldon/competitive-intel; nothing is
 * re-implemented. Every dimension applies the SAME method to both sites.
 */
import type { GeoConfig } from '@jeldon/config';
import type { Fetcher } from '@jeldon/competitive-intel';
import { measureAll, type MeasureOptions } from './dimensions.js';
import { buildScorecard, measurementsToBaseline } from './scorecard.js';
import { snapshotSite, type SnapshotOptions } from './snapshot.js';
import type { Baseline, Measurement, Scorecard, SiteSnapshot } from './types.js';

export interface RunBenchmarkOptions {
  oldUrl?: string;
  newUrl: string;
  /** Stored baseline of the old site (used when `oldUrl` is omitted). */
  baseline?: Baseline | null;
  psi?: boolean;
  psiKey?: string;
  geo?: GeoConfig;
  geoTargets?: { home?: number; article?: number };
  gbp?: MeasureOptions['gbp'];
  /** Test the new site's contact form (POSTs a test lead). */
  testContact?: boolean;
  fetcher?: Fetcher;
  fetchImpl?: typeof fetch;
  servicePrefixHints?: string[];
  articlePrefix?: string;
  maxPages?: number;
  log?: (line: string) => void;
}

export interface RunBenchmarkResult {
  scorecard: Scorecard;
  oldSnapshot: SiteSnapshot | null;
  newSnapshot: SiteSnapshot;
  oldMeasurements: Measurement[] | null;
  newMeasurements: Measurement[];
}

export async function runBenchmark(opts: RunBenchmarkOptions): Promise<RunBenchmarkResult> {
  const snapOpts: SnapshotOptions = {
    fetcher: opts.fetcher, fetchImpl: opts.fetchImpl, geo: opts.geo, psi: opts.psi, psiKey: opts.psiKey,
    servicePrefixHints: opts.servicePrefixHints, articlePrefix: opts.articlePrefix, maxPages: opts.maxPages, log: opts.log,
  };
  let oldSnapshot: SiteSnapshot | null = null;
  let oldMeasurements: Measurement[] | null = null;
  if (opts.oldUrl) {
    oldSnapshot = await snapshotSite(opts.oldUrl, snapOpts);
    oldMeasurements = measureAll(oldSnapshot, { gbp: opts.gbp, geoTargets: opts.geoTargets });
  } else if (opts.baseline) {
    oldMeasurements = opts.baseline.measurements;
  }
  const newSnapshot = await snapshotSite(opts.newUrl, snapOpts);
  let contactOk: boolean | null = null;
  if (opts.testContact) {
    try {
      const { sendTestContact } = await import('@jeldon/kit-local-business/node');
      const r = await sendTestContact(opts.newUrl, { fetchImpl: opts.fetchImpl });
      contactOk = r.status === 200;
      newSnapshot.contactTest = { status: r.status, ok: contactOk };
    } catch {
      contactOk = false;
    }
  }
  const newMeasurements = measureAll(newSnapshot, { gbp: opts.gbp, geoTargets: opts.geoTargets, contactOk });
  const scorecard = buildScorecard({ oldUrl: opts.oldUrl ?? opts.baseline?.url ?? null, newUrl: opts.newUrl, oldMeasurements, newMeasurements });
  return { scorecard, oldSnapshot, newSnapshot, oldMeasurements, newMeasurements };
}

/** Snapshot + measure ONE site (the day-one baseline of the site being replaced). */
export async function captureBaseline(url: string, opts: Omit<RunBenchmarkOptions, 'newUrl' | 'oldUrl'> = {}): Promise<{ baseline: Baseline; snapshot: SiteSnapshot; measurements: Measurement[] }> {
  const snapshot = await snapshotSite(url, { fetcher: opts.fetcher, fetchImpl: opts.fetchImpl, geo: opts.geo, psi: opts.psi, psiKey: opts.psiKey, servicePrefixHints: opts.servicePrefixHints, articlePrefix: opts.articlePrefix, maxPages: opts.maxPages, log: opts.log });
  const measurements = measureAll(snapshot, { gbp: opts.gbp, geoTargets: opts.geoTargets });
  return { baseline: measurementsToBaseline(snapshot, measurements), snapshot, measurements };
}

export { snapshotSite, type SnapshotOptions } from './snapshot.js';
export { analyzePage, type PageOptions } from './page.js';
export { runPsi } from './psi.js';
export {
  measureAll, compare, duplicateIntentGroups, measureSpeed, measureSearchHygiene, measureDuplicateUrls, measureStructuredData,
  measureCitability, measureContentDepth, measureConversionPath, measureAccessibility, measureHonesty, measureLocal,
  DIMENSION_ORDER, type MeasureOptions,
} from './dimensions.js';
export { buildScorecard, renderScorecardMarkdown, measurementsToBaseline } from './scorecard.js';
export { DIMENSION_IDS, DIMENSION_LABELS } from './types.js';
export type { Verdict, DimensionId, Measurement, PageFacts, PsiResult, SiteSnapshot, DimensionRow, Scorecard, Baseline } from './types.js';
