import type { CrawlerSnapshot } from './provider.js';

/**
 * Rolling AI-crawler snapshot store — the shape BoH's 🤖 Command Center panel
 * reads (`src/data/ai-crawler-snapshots.json`). Ported from the upsert in
 * `fetch-cf-analytics.mjs::main` (the crawler-store section). Pure: the host
 * reads/writes the JSON; this owns the upsert/sort/cap so the contract can't
 * drift.
 */
export interface CrawlerSnapshotStore {
  lastUpdated: string | null;
  thresholdDays?: number;
  lastCheckedDate?: string;
  source?: string;
  snapshots: CrawlerSnapshot[];
}

export const emptyCrawlerSnapshotStore: CrawlerSnapshotStore = {
  lastUpdated: null,
  thresholdDays: 90,
  snapshots: [],
};

/** Replace any same-date snapshot, push, sort ascending, cap at `maxDaily`, and
 *  stamp the heartbeat fields the panel understands. Returns a new store. */
export function upsertCrawlerSnapshot(
  store: CrawlerSnapshotStore,
  snapshot: CrawlerSnapshot,
  maxDaily = 365,
  now = new Date(),
): CrawlerSnapshotStore {
  const snapshots = (store.snapshots || []).filter((s) => s.date !== snapshot.date);
  snapshots.push(snapshot);
  snapshots.sort((a, b) => a.date.localeCompare(b.date));
  return {
    ...store,
    snapshots: snapshots.length > maxDaily ? snapshots.slice(-maxDaily) : snapshots,
    lastCheckedDate: snapshot.date,
    lastUpdated: now.toISOString(),
    source: 'cloudflare',
  };
}
