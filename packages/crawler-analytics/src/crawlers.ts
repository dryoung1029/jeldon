import { defaultAnalyticsConfig, type AiBot } from '@jeldon/config';

/**
 * AI-crawler detection. Ported from Body of Health
 * `src/lib/admin/ai-crawlers.ts` (the live regex classifier) AND
 * `scripts/fetch-cf-analytics.mjs::classifyAi` (the cron substring classifier).
 *
 * Those two implementations had to be kept in sync by hand and drifted (the
 * cron list grew Meta/Apple/CommonCrawl/Cohere that the lib never got). Here
 * there is ONE function with the bot list INJECTED, so the host's middleware
 * and its cron call the same code with `pack.analytics.aiBotList`.
 *
 * `match` is a case-insensitive UA substring. The list must be ordered
 * most-specific-token-first so a broad rule ("ClaudeBot") can't shadow a
 * narrow one ("Claude-SearchBot") — exactly the shadowing the BoH comment
 * warns about. We honor list order rather than re-sorting so the caller keeps
 * full control.
 */
export type DetectedCrawler = Pick<AiBot, 'bot' | 'engine' | 'purpose'>;

export function detectAiCrawler(
  userAgent: string | null | undefined,
  botList: AiBot[] = defaultAnalyticsConfig.aiBotList,
): DetectedCrawler | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  for (const b of botList) {
    if (ua.includes(b.match.toLowerCase())) {
      return { bot: b.bot, engine: b.engine, purpose: b.purpose };
    }
  }
  return null;
}

/**
 * Coarse human-vs-bot split for per-article hit counts. No paid bot-management
 * signal on the free plan, so this is directional, not exact: empty UA + a
 * known AI crawler + any token in `botUaPattern` = bot; a real browser
 * (Mozilla/N) = human. Ported from `fetch-cf-analytics.mjs::looksLikeBot`.
 */
export function looksLikeBot(
  userAgent: string | null | undefined,
  botList: AiBot[] = defaultAnalyticsConfig.aiBotList,
  botUaPattern: string = defaultAnalyticsConfig.botUaPattern,
): boolean {
  if (!userAgent || !userAgent.trim()) return true;
  if (detectAiCrawler(userAgent, botList)) return true;
  if (new RegExp(botUaPattern, 'i').test(userAgent)) return true;
  return !/mozilla\/\d/i.test(userAgent); // real browsers identify as Mozilla/5.0
}

/**
 * Timezone-local YYYY-MM-DD. The partition key for daily aggregates so
 * "Wednesday's crawler count" matches the project's local day, not the UTC
 * day. Ported from `ai-crawlers.ts::ptDateKey`; the hardcoded
 * `America/Los_Angeles` is now a parameter (defaults to it for parity).
 */
export function localDateKey(d: Date = new Date(), timeZone = 'America/Los_Angeles'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}
