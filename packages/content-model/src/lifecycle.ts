/**
 * The article lifecycle state machine.
 *
 * Ported from `src/lib/articles.ts::articleStatus` + `getStubArticles` +
 * `getPublishedArticles`, plus the canonical five-way table in BoH CLAUDE.md.
 * The combination of `draft` + `docReviewed` + `ready` + `scheduled` defines an
 * article's lifecycle:
 *
 *   draft | docReviewed | ready | scheduled | status
 *   ------+-------------+-------+-----------+------------
 *   true  | false       | false | false     | draft
 *   true  | true        | false | false     | docReviewed
 *   true  | (any)       | true  | false     | ready
 *   true  | (any)       | (any) | true      | scheduled
 *   false | (any)       | (any) | (any)     | live
 *
 * `docReviewed` is deprecated: BoH retired it on 2026-07-10. It is still
 * honored when a domain opts in (`pack.content.lifecycle.docReviewed`), and is
 * plain `draft` otherwise.
 *
 * `autonomous` is provenance, not lifecycle: an unattended pipeline wrote the
 * draft. It does not change the status; `isAutonomousDraft` finds the drafts
 * no human has looked at yet.
 */

export type LifecycleStatus = 'draft' | 'docReviewed' | 'ready' | 'scheduled' | 'live';

/** The four lifecycle booleans an article carries in frontmatter. */
export interface LifecycleFlags {
  draft?: boolean;
  /** @deprecated retired in BoH 2026-07-10; honored only with `docReviewedEnabled`. */
  docReviewed?: boolean;
  ready?: boolean;
  scheduled?: boolean;
}

export interface LifecycleOptions {
  /** When false (default), `docReviewed: true` is reported as plain `draft`. */
  docReviewedEnabled?: boolean;
}

/**
 * Resolve an article's lifecycle status from its flags. Precedence mirrors
 * `articleStatus` (live > scheduled > ready) with the `docReviewed` rung
 * inserted between ready and draft when the domain enables it.
 */
export function articleStatus(
  flags: LifecycleFlags,
  opts: LifecycleOptions = {},
): LifecycleStatus {
  if (!flags.draft) return 'live';
  if (flags.scheduled) return 'scheduled';
  if (flags.ready) return 'ready';
  if (opts.docReviewedEnabled && flags.docReviewed) return 'docReviewed';
  return 'draft';
}

/** Live = published. Mirrors `getPublishedArticles`'s `!draft` predicate. */
export function isLive(flags: LifecycleFlags): boolean {
  return !flags.draft;
}

/**
 * A "stub" article isn't live yet but should still resolve to a real URL — a
 * "Coming soon" / "Coming on <date>" page so cross-links from live articles
 * don't 404. Mirrors `getStubArticles`: `draft && (ready || scheduled)`. Pure
 * drafts are excluded so work-in-progress titles/strategy never leak publicly.
 */
export function isStub(flags: LifecycleFlags): boolean {
  return Boolean(flags.draft && (flags.ready === true || flags.scheduled === true));
}

/** Should the hourly cron consider auto-publishing this article? Only an
 *  explicitly `scheduled` draft is eligible — a plain past-dated draft is
 *  user-managed forever. */
export function isAutoPublishCandidate(flags: LifecycleFlags): boolean {
  return Boolean(flags.draft && flags.scheduled);
}

/**
 * Filter a list to publicly-published articles. `includeDrafts` unlocks drafts
 * for preview builds (the `INCLUDE_DRAFTS` env flag in BoH); when off in a
 * production context, drafts are dropped. Mirrors `getPublishedArticles`.
 */
export function selectPublished<T extends LifecycleFlags>(
  articles: T[],
  opts: { includeDrafts?: boolean } = {},
): T[] {
  if (opts.includeDrafts) return articles.slice();
  return articles.filter((a) => isLive(a));
}

/** Filter a list to stub articles (see `isStub`). Mirrors `getStubArticles`. */
export function selectStubs<T extends LifecycleFlags>(articles: T[]): T[] {
  return articles.filter((a) => isStub(a));
}

/** A draft written by an unattended pipeline that is not live yet. */
export function isAutonomousDraft(flags: LifecycleFlags & { autonomous?: boolean }): boolean {
  return Boolean(flags.draft && flags.autonomous);
}

/** Filter a list to unreviewed autonomous drafts (see `isAutonomousDraft`). */
export function selectAutonomousDrafts<T extends LifecycleFlags & { autonomous?: boolean }>(articles: T[]): T[] {
  return articles.filter((a) => isAutonomousDraft(a));
}
