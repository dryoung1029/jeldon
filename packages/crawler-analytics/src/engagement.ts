/**
 * First-party engagement beacon (BoH "Tier B"). Ported from
 * `src/pages/api/track.ts` — the public collector that receives anonymous
 * sendBeacon events from the article page and appends them to a store.
 *
 * The host wiring (the Astro/Workers route, the D1 binding lookup) stays in the
 * host; this module owns the validation + the store contract so the SAME parser
 * runs regardless of backend. D1 is ONE `EventStore` adapter; an in-memory /
 * null store is the default (the Decoupling Notes "D1 `api/track.ts`" row).
 *
 * Privacy invariant preserved from BoH: stores no IP, UA, or identity — only
 * slug + event + link target + engaged time + scroll depth + source attribution.
 */

const SLUG_RE = /^[a-z0-9-]{1,120}$/i;
const TYPES = new Set(['view', 'click', 'dwell', 'cta', 'play', 'signup']);

/** A validated engagement event, ready to persist. Columns mirror the BoH D1
 *  `article_events` table. */
export interface EngagementEvent {
  ts: number;
  slug: string;
  type: string;
  kind: string | null;
  href: string | null;
  ms: number | null;
  scroll: number | null;
  ref: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

/**
 * The persistence contract. `recordEvent` must never throw — a failing
 * analytics call must never affect the reader's page (BoH: the route always
 * returns 204). Implementations swallow their own errors.
 */
export interface EventStore {
  recordEvent(event: EngagementEvent): Promise<void>;
}

/** Discards everything. The default when no engagement store is wired. */
export class NullEventStore implements EventStore {
  async recordEvent(): Promise<void> {
    /* no-op */
  }
}

/** Keeps events in process memory — useful for tests, local dev, and small
 *  single-instance deployments. Not durable. */
export class InMemoryEventStore implements EventStore {
  readonly events: EngagementEvent[] = [];
  async recordEvent(event: EngagementEvent): Promise<void> {
    this.events.push(event);
  }
}

/** Minimal shape of a Cloudflare D1 binding (so the adapter needs no
 *  `@cloudflare/workers-types` dependency). */
export interface D1Like {
  prepare(query: string): {
    bind(...values: unknown[]): { run(): Promise<unknown> };
  };
}

/**
 * Cloudflare D1 adapter. Ported verbatim from `api/track.ts` — the same INSERT,
 * the same fallback to the pre-migration column set when the source columns
 * aren't present yet. Inert until the binding exists.
 */
export class D1EventStore implements EventStore {
  constructor(private readonly db: D1Like) {}

  async recordEvent(e: EngagementEvent): Promise<void> {
    try {
      await this.db
        .prepare(
          'INSERT INTO article_events (ts, slug, type, kind, href, ms, scroll, ref, utm_source, utm_medium, utm_campaign) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(e.ts, e.slug, e.type, e.kind, e.href, e.ms, e.scroll, e.ref, e.utmSource, e.utmMedium, e.utmCampaign)
        .run();
    } catch {
      // Migration 0002 (source columns) may not be applied yet — fall back to
      // the original shape so events still record.
      try {
        await this.db
          .prepare('INSERT INTO article_events (ts, slug, type, kind, href, ms, scroll) VALUES (?,?,?,?,?,?,?)')
          .bind(e.ts, e.slug, e.type, e.kind, e.href, e.ms, e.scroll)
          .run();
      } catch {
        // Swallow — a failing beacon must never surface to the reader.
      }
    }
  }
}

const clip = (v: unknown, n = 120): string | null =>
  typeof v === 'string' && v ? v.slice(0, n) : null;

/**
 * Parse + validate a raw beacon body into an `EngagementEvent`, or `null` if it
 * fails any guard (unknown type, bad slug, oversized payload). This is the body
 * of the BoH POST handler, host-agnostic: pass the already-read request text.
 */
export function parseEngagementBeacon(raw: string | null | undefined, now = Date.now()): EngagementEvent | null {
  if (!raw || raw.length > 2000) return null;
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }

  const slug = String(body.slug || '');
  const type = String(body.t || body.type || '');
  if (!SLUG_RE.test(slug) || !TYPES.has(type)) return null;

  let kind: string | null = null;
  let href: string | null = null;
  let ms: number | null = null;
  let scroll: number | null = null;
  let ref: string | null = null;
  let utmSource: string | null = null;
  let utmMedium: string | null = null;
  let utmCampaign: string | null = null;

  if (type === 'click') {
    kind = body.kind === 'outbound' ? 'outbound' : 'internal';
    href = typeof body.href === 'string' ? body.href.slice(0, 300) : null;
  } else if (type === 'cta') {
    kind = typeof body.kind === 'string' ? body.kind.slice(0, 20) : null; // book | call | contact
    href = typeof body.href === 'string' ? body.href.slice(0, 300) : null;
  } else if (type === 'dwell') {
    ms = Math.max(0, Math.min(Math.round(Number(body.ms) || 0), 3_600_000)); // cap 1h
    scroll = Math.max(0, Math.min(Math.round(Number(body.scroll) || 0), 100));
  } else if (type === 'view') {
    ref = clip(body.ref);
    utmSource = clip(body.us);
    utmMedium = clip(body.um);
    utmCampaign = clip(body.uc);
  }

  return { ts: now, slug, type, kind, href, ms, scroll, ref, utmSource, utmMedium, utmCampaign };
}

/**
 * One-call collector for a host route: parse the beacon body and, if valid,
 * record it. Never throws. Returns whether an event was recorded (the host
 * always responds 204 regardless — see BoH `api/track.ts`).
 */
export async function collectBeacon(
  store: EventStore,
  rawBody: string | null | undefined,
  now = Date.now(),
): Promise<boolean> {
  try {
    const event = parseEngagementBeacon(rawBody, now);
    if (!event) return false;
    await store.recordEvent(event);
    return true;
  } catch {
    return false; // beacons must never surface an error
  }
}
