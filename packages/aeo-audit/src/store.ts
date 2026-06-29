import { readFile, writeFile } from 'node:fs/promises';
import type { Snapshot, SnapshotStoreData } from './types.js';

/**
 * I/O boundary for the rolling snapshot window. The audit run reads the
 * current store, upserts today's snapshot (replacing a same-date row), trims
 * to `maxSnapshots`, and writes back. Defaults below: `FsSnapshotStore` for the
 * cron, `NullSnapshotStore` (in-memory, no persistence) for tests/dry-runs.
 * A host backed by GitHub/S3 implements the same two methods.
 */
export interface SnapshotStore {
  read(): Promise<SnapshotStoreData>;
  write(data: SnapshotStoreData): Promise<void>;
}

const EMPTY = (maxSnapshots: number): SnapshotStoreData => ({
  lastUpdated: null,
  maxSnapshots,
  snapshots: [],
});

/** JSON-file store (the cron default — `src/data/aeo-audits.json` in BoH). */
export class FsSnapshotStore implements SnapshotStore {
  constructor(
    private readonly path: string,
    private readonly maxSnapshots = 52,
  ) {}

  async read(): Promise<SnapshotStoreData> {
    try {
      const raw = await readFile(this.path, 'utf8');
      const parsed = JSON.parse(raw) as Partial<SnapshotStoreData>;
      return {
        lastUpdated: parsed.lastUpdated ?? null,
        maxSnapshots: parsed.maxSnapshots ?? this.maxSnapshots,
        snapshots: parsed.snapshots ?? [],
      };
    } catch {
      return EMPTY(this.maxSnapshots);
    }
  }

  async write(data: SnapshotStoreData): Promise<void> {
    await writeFile(this.path, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }
}

/** In-memory store — holds whatever was last written, persists nothing. */
export class NullSnapshotStore implements SnapshotStore {
  private data: SnapshotStoreData;
  constructor(maxSnapshots = 52, seed?: SnapshotStoreData) {
    this.data = seed ?? EMPTY(maxSnapshots);
  }
  async read(): Promise<SnapshotStoreData> {
    return this.data;
  }
  async write(data: SnapshotStoreData): Promise<void> {
    this.data = data;
  }
}

/**
 * Upsert a snapshot into the store data (pure). Replaces any same-date row,
 * sorts by date ascending, trims to `maxSnapshots`, stamps `lastUpdated`.
 * Ported from `scripts/aeo-audit.mjs::main`'s store-merge block.
 */
export function upsertSnapshot(
  store: SnapshotStoreData,
  snapshot: Snapshot,
  now: Date = new Date(),
): SnapshotStoreData {
  const snapshots = store.snapshots.filter((s) => s.date !== snapshot.date);
  snapshots.push(snapshot);
  snapshots.sort((a, b) => a.date.localeCompare(b.date));
  const max = store.maxSnapshots || 52;
  const trimmed = snapshots.length > max ? snapshots.slice(-max) : snapshots;
  return {
    lastUpdated: now.toISOString(),
    maxSnapshots: max,
    snapshots: trimmed,
  };
}
