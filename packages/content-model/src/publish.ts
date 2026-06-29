import { parse } from './frontmatter.js';
import { isAutoPublishCandidate } from './lifecycle.js';

/**
 * Auto-publish scheduled articles.
 *
 * Faithful port of `scripts/publish-scheduled.mjs`. The cron flips
 * `draft: true → false` and drops the `scheduled: true` line on any article
 * whose `publishDate` has arrived in the project timezone. The flip is done by
 * scoped regex on the raw text (NOT by re-serializing) so the body and all
 * unknown frontmatter are untouched byte-for-byte — re-emitting through the
 * codec here would needlessly reformat fields the cron has no business
 * rewriting.
 *
 * I/O is behind `ArticleSource` (DECOUPLING-NOTES: "put I/O behind an
 * interface"). `publishScheduled(articles, tz)` is the pure in-memory form; the
 * directory-driven `publishScheduledFromSource` wires it to an `FsArticleSource`
 * (Node) or any custom store.
 */

export interface ArticleDoc {
  /** Stable id — a filename in the fs case, a slug or path otherwise. */
  id: string;
  /** Full raw markdown (frontmatter + body). */
  raw: string;
}

export interface PublishedArticle {
  id: string;
  publishDate: string;
  /** The rewritten raw markdown to persist. */
  raw: string;
}

export interface PublishResult {
  today: string;
  timezone: string;
  scanned: number;
  published: PublishedArticle[];
  /** ids skipped with a human-readable reason (diagnostic parity with the cron). */
  skipped: Array<{ id: string; reason: string }>;
}

/** Render today's date as YYYY-MM-DD in the given timezone so a publishDate of
 *  "2026-05-12" goes live at local midnight, not UTC midnight. */
export function todayInZone(timezone: string, now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(now);
}

/**
 * The named entry point. Pure: takes the articles already in memory and the
 * project timezone (`pack.content.timezone`), returns which ones flip to live
 * and their rewritten text. The caller persists the `published[].raw`.
 */
export function publishScheduled(
  articles: ArticleDoc[],
  timezone: string,
  now: Date = new Date(),
): PublishResult {
  const today = todayInZone(timezone, now);
  const published: PublishedArticle[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const article of articles) {
    const { raw, id } = article;
    const parsed = parse(raw);
    if (!raw.match(/^---\r?\n[\s\S]*?\r?\n---/)) {
      skipped.push({ id, reason: 'no frontmatter' });
      continue;
    }
    const fm = parsed.frontmatter;
    const draft = fm.draft === true;
    const scheduled = fm.scheduled === true;

    if (!isAutoPublishCandidate({ draft, scheduled })) {
      // Either already live, or a plain (non-scheduled) draft the user manages
      // forever. Both are intentional no-ops.
      continue;
    }

    const publishDate = String(fm.publishDate ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(publishDate)) {
      skipped.push({ id, reason: `invalid publishDate: "${String(fm.publishDate ?? '')}"` });
      continue;
    }
    if (publishDate > today) continue; // Future — leave alone.

    // Flip draft: true → false AND remove the scheduled: true line. Both
    // replacements are scoped to inside the frontmatter block so the body is
    // never touched.
    let updated = raw.replace(
      /^(---[\s\S]*?\n)draft:\s*true(\s*\n[\s\S]*?---)/m,
      '$1draft: false$2',
    );
    if (updated === raw) {
      skipped.push({ id, reason: "couldn't flip draft (regex mismatch)" });
      continue;
    }
    updated = updated.replace(
      /^(---[\s\S]*?\n)scheduled:\s*true\s*\n([\s\S]*?---)/m,
      '$1$2',
    );
    published.push({ id, publishDate, raw: updated });
  }

  return { today, timezone, scanned: articles.length, published, skipped };
}

// ---------------------------------------------------------------------------
// I/O adapter — directory-driven form
// ---------------------------------------------------------------------------

/** Read/write source for articles. The default is `FsArticleSource`; a Store
 *  (GitHub, etc.) can implement the same shape. */
export interface ArticleSource {
  list(): Promise<ArticleDoc[]> | ArticleDoc[];
  write(id: string, raw: string): Promise<void> | void;
}

/** In-memory source — the null default. Handy for tests and dry runs. */
export class MemoryArticleSource implements ArticleSource {
  constructor(private docs: ArticleDoc[]) {}
  list(): ArticleDoc[] {
    return this.docs;
  }
  write(id: string, raw: string): void {
    const doc = this.docs.find((d) => d.id === id);
    if (doc) doc.raw = raw;
  }
}

/** Scan a source, publish due articles, persist the rewrites. */
export async function publishScheduledFromSource(
  source: ArticleSource,
  timezone: string,
  now: Date = new Date(),
): Promise<PublishResult> {
  const docs = await source.list();
  const result = publishScheduled(docs, timezone, now);
  for (const p of result.published) {
    await source.write(p.id, p.raw);
  }
  return result;
}
