import type { ArticleFile, Store } from './types.js';

/**
 * Read many articles without one failure taking down the whole read.
 * Ported from BoH `src/lib/admin/github.ts::getArticlesBulk`.
 *
 * `Promise.all(slugs.map(getArticle))` stopped working at ~70 articles: that
 * many concurrent Contents API requests from one token get shed with 504s,
 * and `Promise.all` rejects on the first one, so one shed request blanked the
 * dashboard. This reads through bounded lanes, retries only transient
 * failures (5xx, 429, network) with backoff, and returns partial results with
 * the failures listed so callers can degrade and say what is missing.
 *
 * Works against any `Store`.
 */

export interface BulkReadResult {
  files: ArticleFile[];
  /** Slugs that could not be read after retries. Surface these; never treat them as absent. */
  failures: Array<{ slug: string; error: string }>;
}

export interface BulkReadOptions {
  /** Parallel lanes. Default 6. */
  concurrency?: number;
  /** Attempts per slug, including the first. Default 3. */
  attempts?: number;
  /** First backoff in ms; doubles per retry. Default 250. */
  backoffMs?: number;
  /** Decide whether an error is worth retrying. Default: HTTP 429/5xx in the
   *  store's "failed: <status>" message, or a network-layer error. */
  isTransient?: (err: unknown) => boolean;
  /** Injectable sleep (tests). */
  sleep?: (ms: number) => Promise<void>;
}

/** Default transient test: a 429/5xx status right after "failed: " (not any
 *  number in the response body), or a fetch/network/timeout error. 404/401/403
 *  will not fix themselves on retry. */
export function isTransientStoreError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/failed: (429|5\d\d)\b/.test(msg)) return true;
  if (/failed: \d{3}\b/.test(msg)) return false;
  return /fetch failed|network|timeout|ECONNRESET|ETIMEDOUT|socket hang up/i.test(msg);
}

export async function getArticlesBulk(
  store: Pick<Store, 'getArticle'>,
  slugs: string[],
  opts: BulkReadOptions = {},
): Promise<BulkReadResult> {
  const concurrency = Math.max(1, opts.concurrency ?? 6);
  const attempts = Math.max(1, opts.attempts ?? 3);
  const backoff = opts.backoffMs ?? 250;
  const transient = opts.isTransient ?? isTransientStoreError;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const bySlug = new Map<string, ArticleFile>();
  const failures: BulkReadResult['failures'] = [];
  let cursor = 0;

  const lane = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= slugs.length) return;
      const slug = slugs[i]!;
      let lastError: string | null = null;
      for (let attempt = 0; attempt < attempts; attempt++) {
        try {
          bySlug.set(slug, await store.getArticle(slug));
          lastError = null;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          if (!transient(err) || attempt === attempts - 1) break;
          await sleep(backoff * 2 ** attempt);
        }
      }
      if (lastError !== null) failures.push({ slug, error: lastError });
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, slugs.length || 1) }, lane));
  // Input order, not completion order.
  const files = slugs.map((s) => bySlug.get(s)).filter((f): f is ArticleFile => !!f);
  return { files, failures };
}
