import type { AeoQuery } from '@jeldon/config';
import type { CitedInstead, ClassifiedCitation } from './citations.js';

export type { AeoQuery };

/** Engine identifiers the registry knows how to build. OpenAI is structurally
 *  supported (a few lines in `engines.ts`); add its key here when shipped. */
export type EngineName = 'perplexity' | 'anthropic' | 'google-aio' | 'openai';

/** What every engine's raw query function returns BEFORE citation parsing.
 *  `error` short-circuits parsing; `noAiOverview` marks "no citation
 *  opportunity surfaced" (Google AIO didn't render) so it's excluded from the
 *  citation-rate denominator rather than counted as a miss. */
export interface EngineRaw {
  urls?: string[];
  text?: string;
  noAiOverview?: boolean;
  error?: string;
}

/** A query function for one engine — pure given its closed-over API key. */
export type EngineFn = (query: string) => Promise<EngineRaw>;

/** A registered engine: a name + its query function. */
export interface Engine {
  name: EngineName | (string & {});
  fn: EngineFn;
}

/** What the brand-match contract feeds `parseCitations`. `url` is our host;
 *  a citation counts when its hostname is that host or a subdomain of it.
 *  `mentions` are prose terms that count as a brand reference even without a
 *  link, matched as whole terms; `mentionExclusions` (term → regex sources)
 *  strips generic phrasings first ("a growing body of health research"). */
export interface BrandMatch {
  url: string;
  mentions: string[];
  mentionExclusions?: Record<string, string[]>;
}

/** One cited link on a tracked host, with its 1-based rank in the answer. */
export interface RankedCitation {
  url: string;
  rank: number;
}

/** Per-engine result for one query after citation parsing. */
export interface EngineResult {
  cited?: boolean;
  citationRank?: number | null;
  totalCitations?: number;
  brandMentioned?: boolean;
  responseHash?: string;
  urlsCount?: number;
  /** reddit.com threads this engine cited for the query. Absent when none. */
  redditCitations?: RankedCitation[];
  /** The answer's top cited links, classified (who was cited instead of us).
   *  Absent on snapshots recorded before this field existed: read that as
   *  "not recorded", never as "cited nobody". */
  citations?: ClassifiedCitation[];
  noAiOverview?: boolean;
  error?: string;
}

/** Per-query result across all engines run. */
export interface QueryResult {
  queryId: string;
  engines: Record<string, EngineResult>;
}

/** One audit run, persisted to the snapshot store. */
export interface Snapshot {
  date: string;
  engines: string[];
  queryCount: number;
  results: QueryResult[];
}

/** The persisted store shape — a rolling window of weekly snapshots. */
export interface SnapshotStoreData {
  lastUpdated: string | null;
  maxSnapshots: number;
  snapshots: Snapshot[];
}

// ---------------------------------------------------------------------------
// Aggregate output (consumed by the Command Center panel)
// ---------------------------------------------------------------------------

export interface EngineStat {
  engine: string;
  cited: number;
  total: number;
  brandMentions: number;
  errors: number;
  noOpportunity: number;
}

export type Delta = 'gained' | 'lost' | 'same' | null;

export interface QueryRow {
  queryId: string;
  query: string;
  tags: string[];
  engines: Record<string, EngineResult & { delta?: Delta }>;
}

export interface WinDrop {
  queryId: string;
  query: string;
  engine: string;
}

export interface TrendPoint {
  date: string;
  per: Record<string, { cited: number; total: number }>;
}

export interface ActionItem {
  priority: 'high' | 'medium' | 'low';
  action: string;
  why: string;
  /** For "win the query" items: who the engines cited instead (or
   *  'not-recorded' on snapshots without citation data). */
  citedInstead?: CitedInstead[] | 'not-recorded';
}

export interface AggregateResult {
  lastUpdated: string | null;
  hasData: boolean;
  latestDate: string | null;
  engineStats: EngineStat[];
  queryRows: QueryRow[];
  wins: WinDrop[];
  drops: WinDrop[];
  trend: TrendPoint[];
  actionItems: ActionItem[];
}
