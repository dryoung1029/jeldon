import { defaultLeadsConfig, type BookingImportConfig, type BookingImportPreset } from '@jeldon/config';

/**
 * Booking import: close the loop between the lead inbox and the booking
 * system without the booking system's rows ever reaching the server in the
 * clear.
 *
 * The browser parses the export, keeps only email / phone / first-visit date,
 * normalises and hashes the identifiers, and uploads `{ e, p, d }` rows. The
 * server hashes the inbox's own emails/phones with the SAME functions, matches,
 * and writes back only `booked` + the date. Unmatched rows are counted (they
 * are the walk-in / phone / referral bookings) and discarded.
 *
 * `normEmail`, `normPhone` and `hashId` are the single copy both sides import.
 * In BoH they were two copies marked "must match" across a browser page and an
 * endpoint; a drift would silently match nothing.
 */

export function normEmail(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

/** The last `lastDigits` digits, or '' when the number has fewer. */
export function normPhone(v: unknown, lastDigits = defaultLeadsConfig.bookingImport.phoneDigits): string {
  const digits = String(v ?? '').replace(/\D/g, '');
  return digits.length >= lastDigits ? digits.slice(-lastDigits) : '';
}

/** SHA-256 hex via WebCrypto (browser, Workers, Node 18+). '' for empty input. */
export async function hashId(s: string): Promise<string> {
  if (!s) return '';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface HashedBookingRow {
  /** sha256(normEmail(email)) */
  e?: string;
  /** sha256(normPhone(phone)) */
  p?: string;
  /** First-visit date, YYYY-MM-DD. */
  d?: string;
}

/** Browser side: one export row → a hashed row, or null when it has neither
 *  identifier (count those as `skipped`; they are still bookings). */
export async function hashBookingRow(
  row: { email?: unknown; phone?: unknown; date?: unknown },
  cfg: Pick<BookingImportConfig, 'phoneDigits'> = defaultLeadsConfig.bookingImport,
): Promise<HashedBookingRow | null> {
  const email = normEmail(row.email);
  const e = await hashId(email.includes('@') ? email : '');
  const p = await hashId(normPhone(row.phone, cfg.phoneDigits));
  if (!e && !p) return null;
  const d = parseBookingDate(row.date);
  return { ...(e ? { e } : {}), ...(p ? { p } : {}), ...(d ? { d } : {}) };
}

export interface ColumnMapping {
  email: string | null;
  phone: string | null;
  date: string | null;
}

export function presetById(cfg: BookingImportConfig, id?: string): BookingImportPreset {
  return cfg.presets.find((p) => p.id === (id ?? cfg.defaultPreset)) ?? cfg.presets[0]!;
}

/** Pick a header per field: patterns tried in order, first matching header
 *  wins. Patterns are case-insensitive regex sources from the preset DATA. */
export function automapColumns(headers: string[], preset: BookingImportPreset): ColumnMapping {
  const pick = (patterns: string[]): string | null => {
    for (const src of patterns) {
      const re = new RegExp(src, 'i');
      const h = headers.find((x) => re.test(x.trim()));
      if (h) return h;
    }
    return null;
  };
  return { email: pick(preset.columns.email), phone: pick(preset.columns.phone), date: pick(preset.columns.date) };
}

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, CRLF, BOM). */
export function parseCsv(text: string): { headers: string[]; rows: Array<Record<string, string>> } {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
      continue;
    }
    if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((x) => x.trim()));
  if (!nonEmpty.length) return { headers: [], rows: [] };
  const headers = nonEmpty[0]!.map((h) => h.trim());
  return { headers, rows: nonEmpty.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()]))) };
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const ymd = (y: number, m: number | undefined, d: number) =>
  m && y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
const mon = (s: string) => MONTHS[s.slice(0, 4).toLowerCase()] ?? MONTHS[s.slice(0, 3).toLowerCase()];

/** YYYY-MM-DD from the common export shapes (ISO, M/D/YYYY, "Mar 5, 2026",
 *  "5 Mar 2026"); null when unrecognised. M/D/YYYY is read US-style. */
export function parseBookingDate(s: unknown): string | null {
  const v = String(s ?? '').trim();
  if (!v) return null;
  let m: RegExpMatchArray | null;
  if ((m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return ymd(+m[1]!, +m[2]!, +m[3]!);
  if ((m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return ymd(+m[3]!, +m[1]!, +m[2]!);
  if ((m = v.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/))) return ymd(+m[3]!, mon(m[1]!), +m[2]!);
  if ((m = v.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/))) return ymd(+m[3]!, mon(m[2]!), +m[1]!);
  return null;
}

const HEX64 = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Server side: shape-check uploaded rows. Anything not a 64-hex hash or a
 *  YYYY-MM-DD date is dropped; rows with neither hash are dropped. */
export function sanitizeHashedRows(
  rows: unknown,
  maxRows = defaultLeadsConfig.bookingImport.maxRows,
): { ok: true; rows: HashedBookingRow[] } | { ok: false; error: string } {
  if (!Array.isArray(rows) || !rows.length) return { ok: false, error: 'no rows' };
  if (rows.length > maxRows) return { ok: false, error: `too many rows (max ${maxRows})` };
  const clean: HashedBookingRow[] = [];
  for (const r of rows as Array<Record<string, unknown>>) {
    const e = typeof r?.e === 'string' && HEX64.test(r.e) ? r.e : undefined;
    const p = typeof r?.p === 'string' && HEX64.test(r.p) ? r.p : undefined;
    const d = typeof r?.d === 'string' && DATE.test(r.d) ? r.d : undefined;
    if (e || p) clean.push({ ...(e ? { e } : {}), ...(p ? { p } : {}), ...(d ? { d } : {}) });
  }
  if (!clean.length) return { ok: false, error: 'no usable rows — each needs a hashed email or phone' };
  return { ok: true, rows: clean };
}

export interface ImportLead {
  id: string;
  receivedAt: string;
  email?: string;
  phone?: string;
  status?: string;
  bookedAt?: string | null;
  spam?: boolean;
}

export interface BookingUpdate {
  id: string;
  status: 'booked';
  bookedAt: string | null;
  /** The status before this import. */
  previous: string;
  via: 'email' | 'phone';
  /** First visit predates the form: an existing client, not a conversion. */
  existing: boolean;
}

export interface BookingImportSummary {
  rows: number;
  matched: number;
  unmatched: number;
  noIdentifier: number;
  updated: number;
  alreadyBooked: number;
  reopened: number;
  noDate: number;
  existing: number;
}

/**
 * Match hashed rows to leads. Pure apart from hashing: returns the updates for
 * the caller to apply, plus counts. One booking row books exactly one lead —
 * the latest submission on or before the first visit, else the earliest. A
 * shared email (family members, repeat submissions) is narrowed by phone.
 */
export async function matchBookings(
  leads: ImportLead[],
  rows: HashedBookingRow[],
  opts: { skipped?: number; phoneDigits?: number } = {},
): Promise<{ updates: BookingUpdate[]; summary: BookingImportSummary }> {
  const digits = opts.phoneDigits ?? defaultLeadsConfig.bookingImport.phoneDigits;
  const byEmail = new Map<string, ImportLead[]>();
  const byPhone = new Map<string, ImportLead[]>();
  const phoneOf = new Map<ImportLead, string>();
  for (const l of leads) {
    if (l.spam) continue;
    const eh = await hashId(normEmail(l.email));
    if (eh) byEmail.set(eh, [...(byEmail.get(eh) ?? []), l]);
    const ph = await hashId(normPhone(l.phone, digits));
    if (ph) {
      byPhone.set(ph, [...(byPhone.get(ph) ?? []), l]);
      phoneOf.set(l, ph);
    }
  }

  const noIdentifier = Number.isInteger(opts.skipped) && (opts.skipped as number) >= 0 ? (opts.skipped as number) : 0;
  const touched = new Set<ImportLead>();
  const updates: BookingUpdate[] = [];
  let matched = 0, unmatched = 0, alreadyBooked = 0, reopened = 0, noDate = 0, existing = 0;

  for (const r of rows) {
    let hits = r.e ? byEmail.get(r.e) ?? [] : [];
    let via: 'email' | 'phone' = 'email';
    if (hits.length > 1 && r.p) {
      const both = hits.filter((l) => phoneOf.get(l) === r.p);
      if (both.length) hits = both;
    }
    if (!hits.length && r.p) {
      hits = byPhone.get(r.p) ?? [];
      via = 'phone';
    }
    hits = hits.filter((l) => !touched.has(l));
    if (!hits.length) {
      unmatched++;
      continue;
    }
    matched++;
    const l = pickOne(hits, r.d);
    touched.add(l);
    const previous = l.status || 'new';
    if (previous === 'booked' && (l.bookedAt || null) === (r.d || null)) {
      alreadyBooked++;
      continue;
    }
    if (previous === 'closed') reopened++;
    if (!r.d) noDate++;
    const isExisting = !!r.d && r.d < String(l.receivedAt).slice(0, 10);
    if (isExisting) existing++;
    updates.push({ id: l.id, status: 'booked', bookedAt: r.d || l.bookedAt || null, previous, via, existing: isExisting });
  }

  return {
    updates,
    summary: {
      rows: rows.length + noIdentifier,
      matched,
      unmatched: unmatched + noIdentifier,
      noIdentifier,
      updated: updates.length,
      alreadyBooked,
      reopened,
      noDate,
      existing,
    },
  };
}

function pickOne(hits: ImportLead[], firstVisit?: string): ImportLead {
  const sorted = hits.slice().sort((a, b) => String(a.receivedAt).localeCompare(String(b.receivedAt)));
  if (firstVisit) {
    const before = sorted.filter((l) => String(l.receivedAt).slice(0, 10) <= firstVisit);
    if (before.length) return before[before.length - 1]!;
  }
  return sorted[0]!;
}
