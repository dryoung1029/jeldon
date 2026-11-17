/**
 * Snippet lab: rewrite an article's title/excerpt inline and log the Search
 * Console numbers the row showed at that moment, so the lab can later say
 * "CTR 0.4% → 3.1% since the rewrite" instead of relying on memory.
 *
 * Ported from Body of Health `src/pages/api/admin/snippets/[slug].ts` and
 * `snippets.ts`. Persistence goes through `@jeldon/store`'s `Store`
 * (`getArticle`/`saveArticle`/`getDataFile`/`saveDataFile`). Title/excerpt
 * limits come from `pack.scoring.seo` (BoH hard-coded 70 and 80–200, which are
 * the SEO scorer's `title.mehMax` and `excerpt.meh`).
 *
 * Two deliberate departures from BoH, both "looked answered when it wasn't":
 *  - BoH coerced a malformed baseline to zeros (`Number(x) || 0`), which then
 *    read as a real "0 clicks before". A baseline with any non-finite metric is
 *    stored as `null` and `compareSince` reports `no_baseline`.
 *  - BoH treated an unreadable log file as an empty log and overwrote it,
 *    wiping the history. Here an unreadable log is never overwritten; the
 *    article still saves and the result says `logged: false` with the reason.
 */
import type { SeoConfig, SnippetLabConfig } from '@jeldon/config';
import { defaultFrontmatterCodec, type ContentValidator, type Store } from '@jeldon/store';
import type { MetricRow } from './analysis.js';
import type { DateRange } from './client.js';

export type SnippetField = 'title' | 'excerpt' | 'both';

export interface SnippetBaseline extends MetricRow {
  dateRange?: Partial<DateRange>;
}

export interface SnippetLogEntry {
  slug: string;
  changedAt: string;
  field: SnippetField;
  before: { title?: string; excerpt?: string };
  after: { title?: string; excerpt?: string };
  /** SC numbers at the moment of change. `null` = not recorded / unusable. */
  baseline: SnippetBaseline | null;
}

export interface SnippetLog {
  entries: SnippetLogEntry[];
}

function cleanBaseline(b: unknown): SnippetBaseline | null {
  if (!b || typeof b !== 'object') return null;
  const o = b as Record<string, unknown>;
  const nums = ['clicks', 'impressions', 'ctr', 'position'].map((k) => (typeof o[k] === 'string' ? Number(o[k]) : o[k]));
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const [clicks, impressions, ctr, position] = nums as number[];
  const out: SnippetBaseline = { clicks: clicks!, impressions: impressions!, ctr: ctr!, position: position! };
  const dr = o.dateRange as Partial<DateRange> | undefined;
  if (dr && typeof dr === 'object') out.dateRange = { ...(dr.start ? { start: String(dr.start) } : {}), ...(dr.end ? { end: String(dr.end) } : {}) };
  return out;
}

/**
 * Pure: prepend a change to the log, newest first, capped at `maxEntries`.
 * Returns the new log and the entry; the input log is not mutated.
 */
export function recordSnippetChange(
  log: SnippetLog | SnippetLogEntry[],
  change: {
    slug: string;
    field: SnippetField;
    before: { title?: string; excerpt?: string };
    after: { title?: string; excerpt?: string };
    scAtChange?: unknown;
    changedAt?: string;
  },
  opts: { maxEntries: number },
): { log: SnippetLog; entry: SnippetLogEntry } {
  const entries = Array.isArray(log) ? log : log.entries;
  const entry: SnippetLogEntry = {
    slug: change.slug,
    changedAt: change.changedAt ?? new Date().toISOString(),
    field: change.field,
    before: change.before,
    after: change.after,
    baseline: cleanBaseline(change.scAtChange),
  };
  return { log: { entries: [entry, ...entries].slice(0, Math.max(1, opts.maxEntries)) }, entry };
}

/** Latest log entry for a slug, or undefined. Log is newest-first. */
export function latestChangeFor(log: SnippetLog, slug: string): SnippetLogEntry | undefined {
  return log.entries.find((e) => e.slug === slug);
}

export type SnippetComparison =
  | { status: 'no_baseline'; reason: string }
  | { status: 'no_current_data'; reason: string; baseline: SnippetBaseline }
  | {
      status: 'ok';
      baseline: SnippetBaseline;
      current: MetricRow;
      delta: MetricRow;
      /** True when the current window starts on or before the change date, so
       *  part of "current" is still the old snippet. Read the delta as partial. */
      windowIncludesPreChange: boolean;
    };

/** Last path segment of a page URL (or path), trailing slash ignored. */
function slugOfPage(page: string): string {
  let path = page;
  try {
    path = new URL(page).pathname;
  } catch {
    /* already a path */
  }
  const segs = path.split('/').filter(Boolean);
  return segs[segs.length - 1] ?? '';
}

/**
 * Compare the baseline captured at change time with the row as it stands now.
 * `currentRows` are page rows (`page` or `keys[0]` holding the URL); the
 * default match is "last path segment equals the slug". Pass `match` for other
 * URL schemes, and `currentRange` so the result can flag a window that still
 * overlaps the pre-change days.
 */
export function compareSince(
  entry: SnippetLogEntry,
  currentRows: ReadonlyArray<MetricRow & { page?: string; keys?: string[] }>,
  opts: { match?: (row: MetricRow & { page?: string; keys?: string[] }, slug: string) => boolean; currentRange?: Partial<DateRange> } = {},
): SnippetComparison {
  if (!entry.baseline) return { status: 'no_baseline', reason: 'no Search Console numbers were recorded at the change' };
  const match = opts.match ?? ((r, slug) => slugOfPage(r.page ?? r.keys?.[0] ?? '') === slug);
  const current = currentRows.find((r) => match(r, entry.slug));
  if (!current) {
    return { status: 'no_current_data', reason: `no current Search Console row for ${entry.slug}`, baseline: entry.baseline };
  }
  const b = entry.baseline;
  const changeDay = entry.changedAt.slice(0, 10);
  return {
    status: 'ok',
    baseline: b,
    current: { clicks: current.clicks, impressions: current.impressions, ctr: current.ctr, position: current.position },
    delta: {
      clicks: current.clicks - b.clicks,
      impressions: current.impressions - b.impressions,
      ctr: current.ctr - b.ctr,
      position: current.position - b.position,
    },
    windowIncludesPreChange: opts.currentRange?.start ? opts.currentRange.start <= changeDay : true,
  };
}

/** Title/excerpt limits from the SEO scorer: title 1..`title.mehMax`,
 *  excerpt `excerpt.meh[0]..excerpt.meh[1]`. Returns errors (empty = ok). */
export function validateSnippet(title: string, excerpt: string, seo: Pick<SeoConfig, 'title' | 'excerpt'>): string[] {
  const errs: string[] = [];
  const tMax = seo.title.mehMax;
  const [eMin, eMax] = seo.excerpt.meh;
  if (!title || title.length > tMax) errs.push(`Title must be 1–${tMax} characters (it's ${title.length}).`);
  if (excerpt.length < eMin || excerpt.length > eMax) errs.push(`Excerpt must be ${eMin}–${eMax} characters (it's ${excerpt.length}).`);
  return errs;
}

export type SnippetLogRead =
  | { status: 'ok'; log: SnippetLog; sha: string }
  | { status: 'absent'; log: SnippetLog; sha: null }
  | { status: 'unreadable'; reason: string };

export async function readSnippetLog(store: Pick<Store, 'getDataFile'>, path: string): Promise<SnippetLogRead> {
  let file;
  try {
    file = await store.getDataFile(path);
  } catch (err) {
    return { status: 'unreadable', reason: `read failed: ${(err as Error).message}` };
  }
  if (!file) return { status: 'absent', log: { entries: [] }, sha: null };
  try {
    const parsed = JSON.parse(file.content) as { entries?: unknown };
    if (!Array.isArray(parsed?.entries)) return { status: 'unreadable', reason: `${path} has no entries array` };
    return { status: 'ok', log: { entries: parsed.entries as SnippetLogEntry[] }, sha: file.sha };
  } catch (err) {
    return { status: 'unreadable', reason: `${path} is not valid JSON (${(err as Error).message})` };
  }
}

function quote(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Replace (or append) one top-level frontmatter key, string-level, so nothing
 *  else in the file is re-serialised. A multi-line value (indented or `- `
 *  continuation lines) is replaced whole. */
export function setFrontmatterLine(fmBlock: string, key: string, formatted: string): string {
  const lines = fmBlock.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (idx !== -1) {
    let end = idx + 1;
    while (end < lines.length && (/^[ \t]/.test(lines[end] as string) || /^- /.test(lines[end] as string))) end++;
    lines.splice(idx, end - idx, `${key}: ${formatted}`);
  } else {
    lines.push(`${key}: ${formatted}`);
  }
  return lines.join('\n');
}

export type ApplySnippetResult =
  | { ok: true; sha: string; entry: SnippetLogEntry; logged: true }
  | { ok: true; sha: string; entry: SnippetLogEntry; logged: false; logError: string }
  | { ok: false; status: 400 | 409; error: string };

const CONFLICT_RE = /409|conflict|expected|does not match/i;

/**
 * The lab's save. Rewrites only the `title`/`excerpt` frontmatter lines,
 * saves through the Store (one re-read + re-apply on a thrown conflict, as
 * BoH did), then appends a capped log entry. A failed log write never undoes
 * the saved article.
 */
export async function applySnippetChange(
  store: Pick<Store, 'getArticle' | 'saveArticle' | 'getDataFile' | 'saveDataFile'>,
  input: {
    slug: string;
    title: string;
    excerpt: string;
    scAtChange?: unknown;
    seo: Pick<SeoConfig, 'title' | 'excerpt'>;
    snippetLab: SnippetLabConfig;
    /** Optional frontmatter validator (e.g. the content-model's). */
    validate?: ContentValidator;
    now?: Date;
  },
): Promise<ApplySnippetResult> {
  const { slug } = input;
  const title = input.title.replace(/\s+/g, ' ').trim();
  const excerpt = input.excerpt.replace(/\s+/g, ' ').trim();
  const errs = validateSnippet(title, excerpt, input.seo);
  if (errs.length) return { ok: false, status: 400, error: errs.join(' ') };

  let before: { title: string; excerpt: string } = { title: '', excerpt: '' };
  let sha = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const file = await store.getArticle(slug);
    const m = file.content.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n?[\s\S]*)$/);
    if (!m) return { ok: false, status: 409, error: 'article has no frontmatter block — fix it in the editor first' };
    const { frontmatter } = defaultFrontmatterCodec.parse(file.content);
    before = { title: String(frontmatter.title ?? ''), excerpt: String(frontmatter.excerpt ?? '') };
    if (before.title === title && before.excerpt === excerpt) return { ok: false, status: 400, error: 'Nothing changed.' };
    let fm = m[1] as string;
    fm = setFrontmatterLine(fm, 'title', quote(title));
    fm = setFrontmatterLine(fm, 'excerpt', quote(excerpt));
    const content = `---\n${fm}\n---${m[2]}`;
    const fmErrors = input.validate ? input.validate(content) : [];
    if (fmErrors.length) {
      return { ok: false, status: 400, error: `Edit would break the article frontmatter — not saved:\n- ${fmErrors.join('\n- ')}` };
    }
    try {
      sha = (await store.saveArticle(slug, content, file.sha, `snippet lab: retitle ${slug}`)).sha;
      break;
    } catch (err) {
      if (attempt === 0 && CONFLICT_RE.test((err as Error).message)) continue;
      throw err;
    }
  }

  const field: SnippetField =
    before.title !== title && before.excerpt !== excerpt ? 'both' : before.title !== title ? 'title' : 'excerpt';
  const changeOpts = {
    slug,
    field,
    before,
    after: { title, excerpt },
    scAtChange: input.scAtChange,
    changedAt: (input.now ?? new Date()).toISOString(),
  };

  // Log — best effort, never clobbers an unreadable log.
  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const read = await readSnippetLog(store, input.snippetLab.logPath);
    if (read.status === 'unreadable') {
      const { entry } = recordSnippetChange([], changeOpts, input.snippetLab);
      return { ok: true, sha, entry, logged: false, logError: `log not written (existing log left untouched): ${read.reason}` };
    }
    const { log, entry } = recordSnippetChange(read.log, changeOpts, input.snippetLab);
    try {
      await store.saveDataFile(input.snippetLab.logPath, JSON.stringify(log, null, 2) + '\n', read.sha, `snippet lab: log ${slug}`);
      return { ok: true, sha, entry, logged: true };
    } catch (err) {
      lastErr = (err as Error).message;
      if (!(attempt === 0 && CONFLICT_RE.test(lastErr))) break;
    }
  }
  const { entry } = recordSnippetChange([], changeOpts, input.snippetLab);
  return { ok: true, sha, entry, logged: false, logError: lastErr };
}
