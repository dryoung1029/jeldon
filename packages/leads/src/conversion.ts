import { defaultConversionConfig } from '@jeldon/config';
import { sanitizePath } from './attribution.js';

/**
 * The conversion map: views → leads → booked, per page and per channel.
 *
 * A lead can credit two pages: where it LANDED (first touch) and the last
 * page it read before the form (`lastPath`). Each is its own column with its
 * own channel cross, never summed — a lead whose landing page is also its last
 * read counts in both.
 *
 * Small numbers lie. A cell with fewer than `minLeads` leads is flagged
 * `lowSample: true` so the UI dims it. It is NOT hidden and NOT zeroed: the
 * counts are real, only the rate is unreliable. A cell with no leads has
 * `rate: null` (no rate exists), never 0.
 *
 * Existing clients (already booked before they used the form) and spam leave
 * every numerator and denominator.
 */

export interface PageViews {
  path: string;
  human: number;
  bot?: number;
}

export interface ConversionLead {
  id: string;
  /** First-touch landing path. */
  landingPage?: string;
  /** Last page read before submitting (older attribution), as a path. */
  lastPath?: string;
  /** From `leadChannel()`. */
  channel: string;
  receivedAt?: string;
  status?: string;
  booked?: boolean;
  existing?: boolean;
  spam?: boolean;
}

export interface Booking {
  leadId: string;
}

export interface ConversionCell {
  leads: number;
  booked: number;
  /** booked / leads; null when there are no leads (no rate exists). */
  rate: number | null;
  /** leads < minLeads: show dimmed, do not read the rate. */
  lowSample: boolean;
}

export interface ConversionRow {
  path: string;
  views: { human: number; bot: number };
  landed: ConversionCell;
  lastRead: ConversionCell;
  channels: Record<string, ConversionCell>;
  channelsLastRead: Record<string, ConversionCell>;
}

export interface ConversionMap {
  minLeads: number;
  totals: ConversionCell & { views: number };
  /** Per channel over every counted lead (attributed to a page or not). */
  byChannel: Record<string, ConversionCell>;
  /** Leads with neither a landing page nor a last-read page. */
  unattributed: ConversionCell;
  channels: string[];
  pages: ConversionRow[];
}

export interface ConversionMapOptions {
  minLeads?: number;
  /** Normalise paths to always end in `/` (Astro's directory format). Default true. */
  trailingSlash?: boolean;
  /** Only leads received at or after this instant (ms). */
  since?: number;
}

type Acc = { leads: number; booked: number };

export function normalizeSitePath(raw: string | null | undefined, trailingSlash = true): string {
  const p = sanitizePath(raw ?? '', 2000);
  if (!p) return '';
  if (!trailingSlash) return p.length > 1 ? p.replace(/\/+$/, '') : p;
  return /\.[a-z0-9]+$/i.test(p) || p.endsWith('/') ? p : `${p}/`;
}

export function conversionCell(a: Acc, minLeads: number): ConversionCell {
  return {
    leads: a.leads,
    booked: a.booked,
    rate: a.leads ? a.booked / a.leads : null,
    lowSample: a.leads < minLeads,
  };
}

export function buildConversionMap(
  views: PageViews[],
  leads: ConversionLead[],
  bookings: Booking[] | null = null,
  opts: ConversionMapOptions = {},
): ConversionMap {
  const minLeads = opts.minLeads ?? defaultConversionConfig.minLeads;
  const slash = opts.trailingSlash ?? true;
  const bookedIds = new Set((bookings ?? []).map((b) => b.leadId));

  type RowAcc = {
    path: string;
    views: { human: number; bot: number };
    landed: Acc;
    lastRead: Acc;
    channels: Map<string, Acc>;
    channelsLastRead: Map<string, Acc>;
  };
  const rows = new Map<string, RowAcc>();
  const row = (path: string): RowAcc => {
    let r = rows.get(path);
    if (!r) {
      r = { path, views: { human: 0, bot: 0 }, landed: { leads: 0, booked: 0 }, lastRead: { leads: 0, booked: 0 }, channels: new Map(), channelsLastRead: new Map() };
      rows.set(path, r);
    }
    return r;
  };
  const bump = (a: Acc, booked: boolean) => {
    a.leads++;
    if (booked) a.booked++;
  };
  const sub = (m: Map<string, Acc>, k: string) => {
    let a = m.get(k);
    if (!a) m.set(k, (a = { leads: 0, booked: 0 }));
    return a;
  };

  for (const v of views) {
    const p = normalizeSitePath(v.path, slash);
    if (!p) continue;
    const r = row(p);
    r.views.human += v.human || 0;
    r.views.bot += v.bot || 0;
  }

  const totals: Acc = { leads: 0, booked: 0 };
  const unattributed: Acc = { leads: 0, booked: 0 };
  const byChannel = new Map<string, Acc>();
  for (const l of leads) {
    if (l.spam || l.existing) continue;
    if (opts.since && l.receivedAt) {
      const t = Date.parse(l.receivedAt);
      if (Number.isFinite(t) && t < opts.since) continue;
    }
    const booked = !!l.booked || l.status === 'booked' || bookedIds.has(l.id);
    bump(totals, booked);
    bump(sub(byChannel, l.channel), booked);
    const landed = normalizeSitePath(l.landingPage, slash);
    const last = normalizeSitePath(l.lastPath, slash);
    if (landed) {
      const r = row(landed);
      bump(r.landed, booked);
      bump(sub(r.channels, l.channel), booked);
    }
    if (last) {
      const r = row(last);
      bump(r.lastRead, booked);
      bump(sub(r.channelsLastRead, l.channel), booked);
    }
    if (!landed && !last) bump(unattributed, booked);
  }

  const cells = (m: Map<string, Acc>) =>
    Object.fromEntries([...m.entries()].sort((a, b) => b[1].leads - a[1].leads).map(([k, a]) => [k, conversionCell(a, minLeads)]));

  const pages: ConversionRow[] = [...rows.values()]
    .filter((r) => r.views.human + r.views.bot > 0 || r.landed.leads || r.lastRead.leads)
    .map((r) => ({
      path: r.path,
      views: r.views,
      landed: conversionCell(r.landed, minLeads),
      lastRead: conversionCell(r.lastRead, minLeads),
      channels: cells(r.channels),
      channelsLastRead: cells(r.channelsLastRead),
    }))
    .sort((a, b) => b.landed.leads + b.lastRead.leads - (a.landed.leads + a.lastRead.leads) || b.views.human - a.views.human);

  return {
    minLeads,
    totals: { ...conversionCell(totals, minLeads), views: pages.reduce((n, p) => n + p.views.human, 0) },
    byChannel: cells(byChannel),
    unattributed: conversionCell(unattributed, minLeads),
    channels: [...byChannel.keys()].sort(),
    pages,
  };
}
