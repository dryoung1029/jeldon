import type { MentionProvider, OffSiteMention } from './types.js';

/**
 * I/O boundary defaults for off-site mention discovery. Matches the
 * `@jeldon/aeo-audit` store pattern: a null default that fetches nothing, and a
 * static default over a curated list. A real host implements `MentionProvider`
 * against a search API.
 */

/** Discovers nothing — the safe default so `entityPresenceReport` compiles and
 *  runs with zero external I/O. The report then reflects the configured source
 *  set as presence *gaps* (every source missing), which is itself useful. */
export class NullMentionProvider implements MentionProvider {
  async discover(_query: string): Promise<OffSiteMention[]> {
    return [];
  }
}

/** Replays a hand-curated mention list — for tests, dry-runs, or a domain that
 *  maintains its off-site presence inventory by hand. */
export class StaticMentionProvider implements MentionProvider {
  constructor(private readonly mentions: OffSiteMention[]) {}
  async discover(_query: string): Promise<OffSiteMention[]> {
    return this.mentions;
  }
}

/**
 * TODO(port): a real discovery provider. The source system has NO equivalent —
 * off-site presence is the lever it never built (docs/AEO-PLAYBOOK.md
 * §"biggest lever"). A faithful first implementation hits SerpApi's organic
 * results for a `"<brand name>"` query (reuse the SERPAPI_URL plumbing in
 * `@jeldon/aeo-audit/src/engines.ts::queryGoogleAio`), maps each
 * `organic_results[].link` + `.snippet` to an `OffSiteMention`, and optionally
 * runs a second pass scoped `site:reddit.com "<brand>"` for the Reddit signal
 * Perplexity weights. Keep the brand string + any location read from the pack;
 * never hardcode a domain value here.
 */
