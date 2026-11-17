import type { OpsCadence, OpsLink } from '@jeldon/config';
import type { PipelineFreshness } from './freshness.js';
import { DAY_MS, daysSinceDateKey, isUnattestable, parseTime, toMs, type Unattestable } from './time.js';

/**
 * The needs-attention feed: one severity-ranked list of everything that needs
 * a human. Every item already exists as data somewhere; the point is that it
 * is collected in one place (in the source system, 12 newsletters read
 * "queued" for months because each signal lived on a different page).
 *
 * `buildAttention` takes injected producers. Producer helpers below each take
 * plain data, so a project wires in what it has and nothing else.
 */
export type AttentionSeverity = 'bad' | 'warn' | 'info';

export interface AttentionItem {
  severity: AttentionSeverity;
  /** `pipeline`, `cadence`, `newsletter`, `autonomous`, `hero`,
   *  `read-failure`, `producer-error`, or any project-specific kind. */
  kind: string;
  text: string;
  href?: string;
  linkLabel?: string;
}

export type AttentionProducer =
  | AttentionItem[]
  | (() => AttentionItem[])
  | { name: string; produce: () => AttentionItem[] };

const SEVERITY_RANK: Record<AttentionSeverity, number> = { bad: 0, warn: 1, info: 2 };

/**
 * Collect every producer's items into one list, ranked bad → warn → info.
 * Order within a severity is the producers' order (stable sort). A producer
 * that throws becomes a `bad` item saying the feed is incomplete, so a broken
 * source never reads as "nothing needs attention".
 */
export function buildAttention(producers: AttentionProducer[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  producers.forEach((p, i) => {
    if (Array.isArray(p)) {
      items.push(...p);
      return;
    }
    const name = typeof p === 'function' ? p.name || `producer #${i + 1}` : p.name;
    try {
      items.push(...(typeof p === 'function' ? p() : p.produce()));
    } catch (err) {
      items.push({
        severity: 'bad',
        kind: 'producer-error',
        text: `Attention source "${name}" failed (${err instanceof Error ? err.message : String(err)}); this list may be incomplete.`,
      });
    }
  });
  return items
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => SEVERITY_RANK[a.item.severity] - SEVERITY_RANK[b.item.severity] || a.idx - b.idx)
    .map((x) => x.item);
}

// ---------------------------------------------------------------------------
// Producer helpers
// ---------------------------------------------------------------------------

type LinkOpt<T> = OpsLink | ((items: T[]) => OpsLink | undefined) | undefined;

function withLink<T>(item: AttentionItem, link: LinkOpt<T>, items: T[]): AttentionItem {
  const l = typeof link === 'function' ? link(items) : link;
  return l ? { ...item, href: l.href, linkLabel: l.label } : item;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
function preview(list: string[], max: number, sep = ', '): string {
  return `${list.slice(0, max).join(sep)}${list.length > max ? '…' : ''}`;
}

/** Article fields the attention helpers read. Plain data; map your store's
 *  frontmatter onto this. */
export interface OpsArticle {
  slug: string;
  title?: string;
  /** true = not live. */
  draft?: boolean;
  publishDate?: string | null;
  heroImage?: string | null;
  /** Written by an autonomous drafting pipeline, not a human. */
  autonomous?: boolean;
  newsletterStatus?: 'queued' | 'sent' | 'error' | (string & {}) | null;
  newsletterScheduledAt?: string | null;
}

/** Stale / never / late / unattestable pipelines. */
export function pipelineAttention(
  pipelines: Array<PipelineFreshness & { source?: string }>,
  opts: { link?: OpsLink } = {},
): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const p of pipelines) {
    const src = p.source ? ` — ${p.source}` : '';
    // Change-gated files are graded on the owning step's check stamp, so the
    // age quoted is the check's age, and the copy says the STEP stopped.
    const age = p.changeGated
      ? `last successful check ${p.changeGated.checkedAgeDays} days ago; the step that owns the file appears to have stopped`
      : `${p.ageDays} days, expected every ${p.cadenceDays}`;
    let item: AttentionItem | null = null;
    if (p.status === 'never') {
      item = { severity: 'bad', kind: 'pipeline', text: `${p.name} pipeline has never written${src}.` };
    } else if (p.status === 'stale') {
      item = { severity: 'bad', kind: 'pipeline', text: `${p.name} pipeline is stale (${age})${src}.` };
    } else if (p.status === 'late') {
      item = { severity: 'warn', kind: 'pipeline', text: `${p.name} is late (${age}).` };
    } else if (p.status === 'unattestable') {
      item = { severity: 'warn', kind: 'pipeline', text: `${p.name} freshness cannot be proven: ${p.reason ?? 'unknown reason'}${src}.` };
    }
    if (item) out.push(withLink(item, opts.link, [p]));
  }
  return out;
}

/** Autonomous drafts still waiting for a human review. */
export function autonomousDraftAttention(
  articles: OpsArticle[],
  opts: { link?: LinkOpt<OpsArticle> } = {},
): AttentionItem[] {
  const waiting = articles.filter((a) => a.autonomous === true && a.draft === true);
  if (!waiting.length) return [];
  const n = waiting.length;
  return [
    withLink(
      {
        severity: 'warn',
        kind: 'autonomous',
        text: `${n} autonomous ${plural(n, 'draft', 'drafts')} waiting for review: ${preview(waiting.map((a) => a.title ?? a.slug), 2, '; ')}`,
      },
      opts.link,
      waiting,
    ),
  ];
}

/** LIVE articles without a hero image. Drafts are excluded: they are not
 *  expected to have one yet, and counting them inflates the backlog (the
 *  source system once reported a 27-article gap when 12 live ones lacked it). */
export function missingHeroAttention(
  articles: OpsArticle[],
  opts: { link?: LinkOpt<OpsArticle> } = {},
): AttentionItem[] {
  const missing = articles.filter((a) => a.draft !== true && !a.heroImage);
  if (!missing.length) return [];
  const n = missing.length;
  return [
    withLink(
      {
        severity: 'warn',
        kind: 'hero',
        text: `${n} live ${plural(n, 'article has', 'articles have')} no hero image: ${preview(missing.map((a) => a.slug), 3)}`,
      },
      opts.link,
      missing,
    ),
  ];
}

/** Newsletters still "queued" past their send slot (they either never fired,
 *  or whatever reconciles status is not running), plus errored ones. A queued
 *  newsletter with no slot at all counts as stuck. */
export function stuckNewsletterAttention(
  articles: OpsArticle[],
  opts: { now?: Date | number; stuckAfterDays?: number; link?: OpsLink } = {},
): AttentionItem[] {
  const nowMs = toMs(opts.now ?? Date.now());
  const stuckAfter = opts.stuckAfterDays ?? 2;
  const stuck: OpsArticle[] = [];
  const errored: OpsArticle[] = [];
  for (const a of articles) {
    if (a.newsletterStatus === 'queued') {
      const at = parseTime(a.newsletterScheduledAt);
      const ageDays = at === null ? Infinity : (nowMs - at) / DAY_MS;
      if (ageDays > stuckAfter) stuck.push(a);
    } else if (a.newsletterStatus === 'error') errored.push(a);
  }
  const out: AttentionItem[] = [];
  if (stuck.length) {
    const n = stuck.length;
    const oldest = stuck.map((a) => a.newsletterScheduledAt).filter((s): s is string => !!s).sort()[0];
    out.push(withLink({
      severity: 'warn',
      kind: 'newsletter',
      text: `${n} ${plural(n, 'newsletter', 'newsletters')} still read "queued"${oldest ? ` (oldest slot ${oldest.slice(0, 10)})` : ''}. If the sender shows them sent, record them as sent; otherwise check the job that reconciles newsletter status.`,
    }, opts.link, stuck));
  }
  if (errored.length) {
    const n = errored.length;
    out.push(withLink({
      severity: 'bad',
      kind: 'newsletter',
      text: `${n} ${plural(n, 'newsletter', 'newsletters')} errored: ${preview(errored.map((a) => a.slug), 3)}.`,
    }, opts.link, errored));
  }
  return out;
}

/** Articles a bulk read could not load; every count computed from the rest
 *  is partial and the feed says so. */
export function readFailureAttention(
  failures: Array<{ slug: string; error?: string }>,
  opts: { link?: OpsLink } = {},
): AttentionItem[] {
  if (!failures.length) return [];
  const n = failures.length;
  return [withLink({
    severity: 'warn',
    kind: 'read-failure',
    text: `${n} ${plural(n, "article couldn't", "articles couldn't")} be read this request; counts exclude ${plural(n, 'it', 'them')}.`,
  }, opts.link, failures)];
}

// ---------------------------------------------------------------------------
// Cadence
// ---------------------------------------------------------------------------

export interface LastEvent {
  slug: string;
  title: string;
  /** `YYYY-MM-DD`. */
  date: string;
}

/** Newest live article whose publish date is not in the future. `today` is a
 *  `YYYY-MM-DD` key; default is today in UTC (pass one computed in the
 *  project's `content.timezone` if that matters). */
export function lastPublishedArticle(articles: OpsArticle[], today?: string): LastEvent | null {
  const todayKey = today ?? new Date().toISOString().slice(0, 10);
  let last: LastEvent | null = null;
  for (const a of articles) {
    if (a.draft === true) continue;
    const key = (a.publishDate ?? '').slice(0, 10);
    if (key && key <= todayKey && (!last || key > last.date)) last = { slug: a.slug, title: a.title ?? a.slug, date: key };
  }
  return last;
}

/** Newest newsletter recorded as sent (by its scheduled slot). A manual
 *  "mark sent" counts. */
export function lastNewsletterSent(articles: OpsArticle[]): LastEvent | null {
  let last: LastEvent | null = null;
  for (const a of articles) {
    if (a.newsletterStatus !== 'sent') continue;
    const key = (a.newsletterScheduledAt ?? '').slice(0, 10);
    if (key && (!last || key > last.date)) last = { slug: a.slug, title: a.title ?? a.slug, date: key };
  }
  return last;
}

export interface CadenceInput {
  cadence: OpsCadence;
  /** null = none exists. Pass `unattestable(reason)` when it could not be
   *  determined (e.g. the article listing failed). */
  lastPublished: LastEvent | null | Unattestable;
  /** Only read when `cadence.newsletterDays` is set. */
  lastNewsletter?: LastEvent | null | Unattestable;
  now?: Date | number;
  links?: { article?: OpsLink; articleEmpty?: OpsLink; newsletter?: OpsLink };
}

/** "No article published in N days" / "No newsletter sent in N days". */
export function cadenceAttention(input: CadenceInput): AttentionItem[] {
  const now = input.now ?? Date.now();
  const out: AttentionItem[] = [];
  const art = input.cadence.articleDays;
  const lp = input.lastPublished;
  if (isUnattestable(lp)) {
    out.push(withLink({ severity: 'warn', kind: 'cadence', text: `Cannot tell when the last article was published: ${lp.reason}.` }, input.links?.article, []));
  } else if (!lp) {
    out.push(withLink({ severity: 'warn', kind: 'cadence', text: 'No live article has a publish date yet.' }, input.links?.articleEmpty ?? input.links?.article, []));
  } else {
    const d = daysSinceDateKey(lp.date, now);
    if (d > art) {
      out.push(withLink({ severity: 'warn', kind: 'cadence', text: `No article published in ${d} days (target: every ${art}). Last: "${lp.title}" on ${lp.date}.` }, input.links?.article, []));
    }
  }

  const nl = input.cadence.newsletterDays;
  if (nl !== undefined) {
    const ln = input.lastNewsletter;
    if (ln === undefined) {
      out.push({ severity: 'warn', kind: 'cadence', text: 'Newsletter cadence is configured but no newsletter history was supplied; cannot check it.' });
    } else if (isUnattestable(ln)) {
      out.push(withLink({ severity: 'warn', kind: 'cadence', text: `Cannot tell when the last newsletter was sent: ${ln.reason}.` }, input.links?.newsletter, []));
    } else if (!ln) {
      out.push(withLink({ severity: 'warn', kind: 'cadence', text: 'No newsletter is recorded as sent yet.' }, input.links?.newsletter, []));
    } else {
      const d = daysSinceDateKey(ln.date, now);
      if (d > nl) {
        out.push(withLink({ severity: 'warn', kind: 'cadence', text: `No newsletter sent in ${d} days (target: every ${nl}). Last: "${ln.title}" on ${ln.date}.` }, input.links?.newsletter, []));
      }
    }
  }
  return out;
}
