/**
 * @jeldon/aeo-audit — answer-engine citation-presence audit.
 *
 * `runAudit(querySet, engines, { brand })` queries each engine, parses
 * citations against the brand contract, and returns one snapshot.
 * `aggregate(store, { queries })` rolls the snapshot window into engine stats,
 * wins/drops, trend, and deterministic action items. Pure of host coupling:
 * engines are a pluggable registry, persistence is behind `SnapshotStore`, and
 * every domain literal is read from the Domain Pack (see `pack.ts`).
 *
 * Ported from Body of Health `scripts/aeo-audit.mjs` + `command/aeo.ts`.
 */

export { runAudit, parseCitations, dateKey, type RunAuditOptions } from './run.js';
export { aggregate, buildActionItems, type AggregateOptions } from './aggregate.js';
export {
  buildEngines,
  queryPerplexity,
  queryAnthropic,
  queryGoogleAio,
  type EngineKeys,
} from './engines.js';
export {
  type SnapshotStore,
  FsSnapshotStore,
  NullSnapshotStore,
  upsertSnapshot,
} from './store.js';
export {
  brandMatchFromPack,
  enginesFromPack,
  engineKeysFromEnv,
} from './pack.js';
export type {
  AeoQuery,
  EngineName,
  EngineRaw,
  EngineFn,
  Engine,
  BrandMatch,
  EngineResult,
  QueryResult,
  Snapshot,
  SnapshotStoreData,
  EngineStat,
  Delta,
  QueryRow,
  WinDrop,
  TrendPoint,
  ActionItem,
  AggregateResult,
} from './types.js';
