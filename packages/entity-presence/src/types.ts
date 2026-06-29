import type {
  EnginePresenceAffinity,
  EntityPresenceSource,
  MentionConsistencyTargets,
} from '@jeldon/config';

export type { EntityPresenceSource, EnginePresenceAffinity, MentionConsistencyTargets };

/**
 * One discovered off-site mention of the brand on a third-party surface. This
 * is the engine-neutral input shape — a host fetches these (SerpApi "site:"
 * scans, a Reddit search, a brand-monitoring API, a hand-curated list) and
 * hands them in. The engine classifies/scores; it does not fetch.
 */
export interface OffSiteMention {
  /** The page the mention lives on. */
  url: string;
  /** Optional snippet/title — searched for NAP/name strings when present. */
  text?: string;
  /** Optional surface discovery hint, e.g. the query/engine that found it. */
  discoveredVia?: string;
}

/** The brand contract the mention-consistency check matches against. Built from
 *  the pack via `consistencyTargetsFromPack`. */
export interface BrandContract {
  name: string;
  /** Canonical NAP fields (key → canonical value) to verify across sources. */
  nap: Record<string, string>;
}

// ---------------------------------------------------------------------------
// I/O boundary — off-site mention discovery (null/fs default)
// ---------------------------------------------------------------------------

/**
 * The one piece of host coupling this module has: discovering where the brand
 * is mentioned off-site. Behind an interface so the engine never reaches a
 * search API directly. `NullMentionProvider` (zero mentions) is the default;
 * a host wires a SerpApi/Reddit/Bing-search-backed provider, or an
 * `StaticMentionProvider` over a curated list.
 *
 * `discover(query)` runs one off-site discovery pass and returns raw mentions.
 * `query` is typically a brand `site:`-style or plain brand-name search string.
 */
export interface MentionProvider {
  discover(query: string): Promise<OffSiteMention[]>;
}

// ---------------------------------------------------------------------------
// Mention-consistency check output
// ---------------------------------------------------------------------------

export type ConsistencyStatus = 'consistent' | 'mismatch' | 'absent';

/** Per-NAP-field consistency finding on one listing-style source. */
export interface FieldConsistency {
  field: string;
  /** The canonical value expected. */
  expected: string;
  status: ConsistencyStatus;
  /** Mentions on this source that did NOT contain the expected value verbatim. */
  offendingUrls: string[];
}

/** Consistency result for one source the brand appears on. */
export interface SourceConsistency {
  sourceId: string;
  label: string;
  mentionCount: number;
  /** True once `mentionCount >= establishedThreshold`. */
  established: boolean;
  /** Whether this source is a listing-style surface where NAP is checkable. */
  napChecked: boolean;
  /** Per-field findings (empty when `napChecked` is false). */
  fields: FieldConsistency[];
}

export interface MentionConsistencyReport {
  /** Sources the brand was found on, with per-source consistency findings. */
  sources: SourceConsistency[];
  /** Sources in the pack the brand was NOT found on at all (presence gaps). */
  missingSources: Array<{ sourceId: string; label: string; weight: number }>;
  /** Count of NAP fields that mismatched across all checked sources. */
  mismatchCount: number;
}

// ---------------------------------------------------------------------------
// Per-engine citation-pattern output
// ---------------------------------------------------------------------------

/** What sources a given answer engine leans on, sorted strongest-first. The
 *  read of `EnginePresenceAffinity` joined to the pack's source labels. */
export interface EngineCitationPattern {
  engine: string;
  note?: string;
  /** Source affinities for this engine, descending by pull, with the source
   *  label resolved. */
  ranked: Array<{ sourceId: string; label: string; affinity: number }>;
  /** The single highest-affinity source id — the one to prioritize for this
   *  engine. Null when the engine has no affinities configured. */
  topSourceId: string | null;
}

// ---------------------------------------------------------------------------
// Full entity-presence report output
// ---------------------------------------------------------------------------

export interface PresenceActionItem {
  priority: 'high' | 'medium' | 'low';
  action: string;
  why: string;
  /** Source this item is about, when applicable. */
  sourceId?: string;
}

export interface EntityPresenceReport {
  brandName: string;
  /** Whether any mention data was supplied (false when the NullMentionProvider
   *  ran — the report then reflects the configured target set only). */
  hasData: boolean;
  /** Cross-source mention-consistency findings. */
  consistency: MentionConsistencyReport;
  /** Per-engine citation patterns (the Reddit→Perplexity / Wikipedia→ChatGPT map). */
  enginePatterns: EngineCitationPattern[];
  /** Deterministic, evidence-backed next actions (presence gaps + mismatches). */
  actionItems: PresenceActionItem[];
}
