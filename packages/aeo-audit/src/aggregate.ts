import type {
  ActionItem,
  AggregateResult,
  EngineResult,
  EngineStat,
  QueryRow,
  Snapshot,
  SnapshotStoreData,
  TrendPoint,
  WinDrop,
} from './types.js';
import type { AeoQuery } from '@jeldon/config';

/**
 * Read-only aggregator for the "Answer engine presence" panel. Ported from
 * Body of Health `src/pages/api/admin/command/aeo.ts`. Writes are owned by the
 * audit run; this only reads the snapshot window. Two BoH literals are lifted
 * into config: the high-priority tags (was hardcoded `'local'`/`'discovery'`)
 * and the brand name embedded in action-item copy.
 */
export interface AggregateOptions {
  /** The query set, for joining query text/tags into the per-query rows. */
  queries: ReadonlyArray<AeoQuery>;
  /** Tags that bump a "win the query" item to high priority. From
   *  `pack.aeo.highPriorityTags` (e.g. `['local','discovery']`). */
  highPriorityTags?: string[];
  /** Brand name woven into the brand-mention action-item copy. From
   *  `pack.brand.name`. Defaults to "your brand". */
  brandName?: string;
  /** How many trailing snapshots feed the trend chart. Default 12. */
  trendWindow?: number;
}

function hasNoAiOverview(e?: EngineResult): boolean {
  return !!e && !!e.noAiOverview;
}

export function aggregate(
  store: SnapshotStoreData | { lastUpdated: string | null; snapshots: Snapshot[] },
  opts: AggregateOptions,
): AggregateResult {
  const queries = opts.queries;
  const highPriorityTags = opts.highPriorityTags ?? [];
  const brandName = opts.brandName ?? 'your brand';
  const trendWindow = opts.trendWindow ?? 12;

  const snapshots = store.snapshots ?? [];
  const latest = snapshots[snapshots.length - 1] ?? null;
  const previous = snapshots[snapshots.length - 2] ?? null;

  // Citation rate per engine, latest snapshot. `total` is the denominator for
  // the citation rate and counts only queries where a citation opportunity
  // existed — Google AIO queries that surfaced no AI Overview go to
  // `noOpportunity` instead so they don't drag the rate down (there was
  // nothing to be cited in).
  const engineStats: Record<string, Omit<EngineStat, 'engine'>> = {};
  if (latest) {
    for (const r of latest.results) {
      for (const [name, eng] of Object.entries(r.engines)) {
        engineStats[name] ??= { cited: 0, total: 0, brandMentions: 0, errors: 0, noOpportunity: 0 };
        const s = engineStats[name];
        if (eng.error) {
          s.errors += 1;
        } else if (hasNoAiOverview(eng)) {
          s.noOpportunity += 1;
        } else {
          s.total += 1;
          if (eng.cited) s.cited += 1;
          if (eng.brandMentioned) s.brandMentions += 1;
        }
      }
    }
  }

  // Per-query latest results (joined with query text for display).
  const queryRows: QueryRow[] = latest
    ? latest.results.map((r) => {
        const q = queries.find((qq) => qq.id === r.queryId);
        const prev = previous?.results.find((pr) => pr.queryId === r.queryId);
        const enginesOut: QueryRow['engines'] = {};
        for (const [name, e] of Object.entries(r.engines)) {
          const prevE = prev?.engines[name];
          const noOpp = (x?: EngineResult): boolean => !!x && (!!x.error || hasNoAiOverview(x));
          let delta: QueryRow['engines'][string]['delta'] = null;
          // Only compare snapshots where a citation OPPORTUNITY existed in
          // both. Google AIO renders intermittently for local queries — a flip
          // from "AIO shown + cited" to "no AIO at all" is Google's volatility,
          // not a lost citation. Excluding noAiOverview/error here keeps the
          // drops list free of that false positive.
          if (prevE && prevE.cited !== undefined && e.cited !== undefined && !noOpp(e) && !noOpp(prevE)) {
            if (e.cited && !prevE.cited) delta = 'gained';
            else if (!e.cited && prevE.cited) delta = 'lost';
            else delta = 'same';
          }
          enginesOut[name] = { ...e, delta };
        }
        return {
          queryId: r.queryId,
          query: q?.query ?? r.queryId,
          tags: q?.tags ?? [],
          engines: enginesOut,
        };
      })
    : [];

  // Wins + drops (week-over-week).
  const wins: WinDrop[] = [];
  const drops: WinDrop[] = [];
  for (const row of queryRows) {
    for (const [name, e] of Object.entries(row.engines)) {
      if (e.delta === 'gained') wins.push({ queryId: row.queryId, query: row.query, engine: name });
      if (e.delta === 'lost') drops.push({ queryId: row.queryId, query: row.query, engine: name });
    }
  }

  // Trend: citation rate per engine over last N snapshots.
  const trend: TrendPoint[] = snapshots.slice(-trendWindow).map((s) => {
    const per: Record<string, { cited: number; total: number }> = {};
    for (const r of s.results) {
      for (const [name, e] of Object.entries(r.engines)) {
        per[name] ??= { cited: 0, total: 0 };
        if (!e.error && !hasNoAiOverview(e)) {
          per[name].total += 1;
          if (e.cited) per[name].cited += 1;
        }
      }
    }
    return { date: s.date, per };
  });

  const actionItems = buildActionItems(queryRows, drops, { highPriorityTags, brandName });

  return {
    lastUpdated: store.lastUpdated,
    hasData: snapshots.length > 0,
    latestDate: latest?.date ?? null,
    engineStats: Object.entries(engineStats).map(([engine, s]) => ({ engine, ...s })),
    queryRows,
    wins: wins.slice(0, 20),
    drops: drops.slice(0, 20),
    trend,
    actionItems,
  };
}

/**
 * Deterministic AEO improvement advice derived from the latest snapshot. No AI
 * call — grounded, falsifiable, free. Every item points at a specific query or
 * pattern in the data so it's actionable, not generic. Ported from
 * `command/aeo.ts::buildActionItems`; the `local || discovery` tag literal
 * became the injected `highPriorityTags`, and the "Body of Health" brand name
 * became `brandName`.
 */
export function buildActionItems(
  queryRows: QueryRow[],
  drops: Array<{ query: string; engine: string }>,
  opts: { highPriorityTags: string[]; brandName: string },
): ActionItem[] {
  const items: ActionItem[] = [];
  let mentionOnlyCount = 0;

  for (const row of queryRows) {
    const engs = Object.entries(row.engines);
    const opportunities = engs.filter(([, e]) => !e.error && !hasNoAiOverview(e));
    if (opportunities.length === 0) continue; // No engine had an opening (all no-AIO/error).

    const cited = opportunities.filter(([, e]) => e.cited);
    const mentionedOnly = opportunities.filter(([, e]) => !e.cited && e.brandMentioned);
    if (mentionedOnly.length > 0 && cited.length === 0) mentionOnlyCount += 1;

    const highPriority = row.tags.some((t) => opts.highPriorityTags.includes(t));

    if (cited.length === 0) {
      items.push({
        priority: highPriority ? 'high' : 'medium',
        action: `Win the query "${row.query}" — no engine cites you yet.`,
        why: mentionedOnly.length
          ? `You're mentioned but not linked on ${mentionedOnly.length} engine(s). Publish or strengthen a dedicated page with quotable, citation-backed claims so engines link it.`
          : `Publish a focused article or strengthen the closest existing page. Lead with a direct, extractable answer + a References section.`,
      });
    } else {
      const ranks = cited.map(([, e]) => e.citationRank ?? 99).filter((r) => r > 0);
      const best = ranks.length ? Math.min(...ranks) : 99;
      if (best >= 4) {
        items.push({
          priority: 'medium',
          action: `Climb on "${row.query}" — cited but only at rank #${best}.`,
          why: `Add authoritative citations, tighten the lead answer, and earn internal links to the target page so engines rank it higher among sources.`,
        });
      }
    }
  }

  for (const d of drops) {
    items.push({
      priority: 'high',
      action: `Investigate lost citation: "${d.query}" on ${d.engine}.`,
      why: `You were cited last snapshot and aren't now. Check for a recent content edit that weakened the answer, a competitor that published something stronger, or a broken/changed URL.`,
    });
  }

  if (mentionOnlyCount >= 2) {
    items.push({
      priority: 'medium',
      action: `Convert ${mentionOnlyCount} brand-mention-only results into linked citations.`,
      why: `Engines name ${opts.brandName} without linking on several queries. Ensure those topics have a canonical page with a clear URL and self-contained, quotable claims engines can cite.`,
    });
  }

  const order: Record<ActionItem['priority'], number> = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => order[a.priority] - order[b.priority]);
  return items.slice(0, 12);
}
