/**
 * "Saved" is not "live". A static site picks up a new alert only when the
 * next build deploys, and a deploy race (an older commit's build finishing
 * last — hosts serve the most recently COMPLETED build, not the newest
 * commit) can leave a stale alert live. The admin page therefore polls the
 * live homepage until it carries the saved revision, and says so only then.
 */

import { alertState, type SiteAlert } from './alert.js';

/** The `<template>` id the public component renders. The live check keys on
 *  it, so the two must agree. */
export const ALERT_TEMPLATE_ID = 'site-alert-tpl';
/** The attribute that carries the revision on that element. */
export const ALERT_REVISION_ATTR = 'data-rev';

export type AlertVersion = Pick<SiteAlert, 'enabled' | 'revision'> &
  Partial<Pick<SiteAlert, 'startsAt' | 'endsAt'>>;

const attrEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/**
 * Does this homepage HTML show `version`? Enabled → the revision attribute is
 * present. Off → no alert template at all. An enabled alert whose window has
 * already ended counts as matched when `nowInZone` is given: the browser-side
 * end check hides it whatever the build holds.
 */
export function homepageShows(html: string, version: AlertVersion, nowInZone?: string): boolean {
  if (
    version.enabled &&
    nowInZone &&
    version.startsAt !== undefined &&
    version.endsAt !== undefined &&
    alertState({ enabled: true, startsAt: version.startsAt, endsAt: version.endsAt }, nowInZone) === 'ended'
  ) {
    return true;
  }
  if (version.enabled) return html.includes(`${ALERT_REVISION_ATTR}="${attrEscape(version.revision)}"`);
  return !html.includes(`id="${ALERT_TEMPLATE_ID}"`);
}

export type LiveResult =
  | { status: 'live'; attempts: number; elapsedMs: number }
  /** Not seen within the timeout. `lastError` is the last fetch failure, if
   *  the final attempts failed rather than returned a stale page. */
  | { status: 'timeout'; attempts: number; elapsedMs: number; lastError?: string };

export interface WaitOptions {
  /** Delay between attempts. Default 15 s. */
  intervalMs?: number;
  /** Current wall clock in the pack timezone (see `homepageShows`). */
  nowInZone?: () => string;
  /** Called after every miss (for a "still publishing…" status line). */
  onMiss?: (info: { attempts: number; elapsedMs: number; error?: string }) => void;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  clock?: () => number;
  signal?: AbortSignal;
}

/**
 * Poll `fetchHomepage` (which should bypass caches, e.g.
 * `fetch('/?alert-check=' + Date.now(), { cache: 'no-store' })`) until the
 * page shows `version`, or `timeoutMs` passes. A fetch that throws is a
 * network blip: keep waiting. Never resolves `live` on an assumption.
 */
export async function waitForLiveVersion(
  fetchHomepage: () => Promise<string>,
  version: AlertVersion,
  timeoutMs: number,
  opts: WaitOptions = {},
): Promise<LiveResult> {
  const interval = opts.intervalMs ?? 15_000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const clock = opts.clock ?? (() => Date.now());
  const started = clock();
  let attempts = 0;
  let lastError: string | undefined;
  for (;;) {
    attempts++;
    try {
      const html = await fetchHomepage();
      lastError = undefined;
      if (homepageShows(html, version, opts.nowInZone?.())) {
        return { status: 'live', attempts, elapsedMs: clock() - started };
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    const elapsedMs = clock() - started;
    opts.onMiss?.({ attempts, elapsedMs, error: lastError });
    if (elapsedMs + interval > timeoutMs || opts.signal?.aborted) {
      return lastError
        ? { status: 'timeout', attempts, elapsedMs, lastError }
        : { status: 'timeout', attempts, elapsedMs };
    }
    await sleep(interval);
  }
}
