import type { BrandContact, SiteAlertLimits, SiteAlertPreset } from '@jeldon/config';
import { addDays, isWallClock, wallParts } from './wall-clock.js';

/** The stored alert (the template keeps it in `src/data/site-alert.json`). */
export interface SiteAlert {
  enabled: boolean;
  /** Small caps line above the title. Blank = derived from the window. */
  label: string;
  title: string;
  /** Plain text. Rendered through `messageHtml`, never as markup. */
  message: string;
  /** Wall clock in the pack timezone, `YYYY-MM-DDTHH:mm`. */
  startsAt: string;
  /** Inclusive to the minute. */
  endsAt: string;
  /** Show the "Send us a message" button. */
  messageButton: boolean;
  /** Show the "Email us" button (`brand.contact.email`). */
  emailButton: boolean;
  /** While live, the site should stop advertising the phone as the fastest
   *  way to reach you (the template exposes a hook for this). */
  phonesDown: boolean;
  /** Changes on every save, stamped server-side. Dismissal is remembered per
   *  revision, so an edited alert is shown again to people who closed the
   *  previous version. */
  revision: string;
  updatedAt: string | null;
}

export const EMPTY_ALERT: SiteAlert = {
  enabled: false,
  label: '',
  title: '',
  message: '',
  startsAt: '',
  endsAt: '',
  messageButton: true,
  emailButton: true,
  phonesDown: false,
  revision: '',
  updatedAt: null,
};

/** `off` = disabled; `scheduled` = before start; `live`; `ended` = after end. */
export type AlertState = 'off' | 'scheduled' | 'live' | 'ended';

/**
 * Where an alert is in its window. `nowInZone` is the current wall clock in
 * the pack timezone (`wallClockIn(pack.content.timezone)`). `endsAt` is
 * inclusive to the minute: an alert ending 23:59 is live at 23:59.
 *
 * An enabled alert with an unparseable window is `off`: showing a pop-up we
 * cannot place in time is worse than not showing it.
 */
export function alertState(
  alert: Pick<SiteAlert, 'enabled' | 'startsAt' | 'endsAt'>,
  nowInZone: string,
): AlertState {
  if (!alert.enabled) return 'off';
  if (!isWallClock(alert.startsAt) || !isWallClock(alert.endsAt)) return 'off';
  if (nowInZone < alert.startsAt) return 'scheduled';
  if (nowInZone > alert.endsAt) return 'ended';
  return 'live';
}

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Tue, Nov 17, 8:00 am" — for an admin status line. */
export function formatWall(w: string): string {
  if (!isWallClock(w)) return w;
  const p = wallParts(w);
  const h12 = ((p.h + 11) % 12) + 1;
  return `${DAY[p.dow]!.slice(0, 3)}, ${MON[p.mo - 1]} ${p.d}, ${h12}:${String(p.mi).padStart(2, '0')} ${p.h < 12 ? 'am' : 'pm'}`;
}

/** Label used when the admin leaves it blank. A one-day alert is only ever on
 *  screen during that day, so "today" is true. */
export function autoLabel(alert: Pick<SiteAlert, 'startsAt' | 'endsAt'>): string {
  if (!isWallClock(alert.startsAt) || !isWallClock(alert.endsAt)) return 'NOTICE';
  const s = wallParts(alert.startsAt);
  const e = wallParts(alert.endsAt);
  if (alert.startsAt.slice(0, 10) === alert.endsAt.slice(0, 10)) {
    return `TODAY · ${DAY[s.dow]}, ${MON[s.mo - 1]} ${s.d}`.toUpperCase();
  }
  return `NOTICE · ${MON[s.mo - 1]} ${s.d} – ${MON[e.mo - 1]} ${e.d}`.toUpperCase();
}

export function displayLabel(alert: Pick<SiteAlert, 'label' | 'startsAt' | 'endsAt'>): string {
  return (alert.label.trim() || autoLabel(alert)).toUpperCase();
}

/** localStorage key that records a dismissal of ONE revision. */
export function dismissalKey(revision: string, prefix = 'jeldon:alert'): string {
  return `${prefix}:${revision}`;
}

const clean = (v: unknown, max: number) =>
  (typeof v === 'string' ? v : '')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .trim()
    .slice(0, max);
const oneLine = (v: unknown, max: number) => clean(v, max).replace(/\s*\n\s*/g, ' ');

/**
 * Validate + normalise whatever the admin sent. Returns the alert to store
 * (`revision` / `updatedAt` blank, for `stampAlert` to fill server-side) and
 * the list of problems. Unknown fields are dropped. Text is clipped to the
 * pack limits; the window may not exceed `limits.maxDays`.
 */
export function normalizeAlert(
  input: unknown,
  limits: SiteAlertLimits,
): { alert: SiteAlert; errors: string[] } {
  const b = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const alert: SiteAlert = {
    enabled: b.enabled === true,
    label: oneLine(b.label, limits.label),
    title: oneLine(b.title, limits.title),
    message: clean(b.message, limits.message),
    startsAt: typeof b.startsAt === 'string' ? b.startsAt.slice(0, 16) : '',
    endsAt: typeof b.endsAt === 'string' ? b.endsAt.slice(0, 16) : '',
    messageButton: b.messageButton !== false,
    emailButton: b.emailButton !== false,
    phonesDown: b.phonesDown === true,
    revision: '',
    updatedAt: null,
  };
  if (!alert.title) errors.push('Add a title.');
  const startOk = isWallClock(alert.startsAt);
  const endOk = isWallClock(alert.endsAt);
  if (!startOk) errors.push('Start needs a valid date and time.');
  if (!endOk) errors.push('End needs a valid date and time.');
  if (startOk && endOk) {
    if (alert.endsAt <= alert.startsAt) errors.push('End must be after the start.');
    else if (alert.endsAt > addDays(alert.startsAt, limits.maxDays)) {
      errors.push(`An alert can run at most ${limits.maxDays} days.`);
    }
  }
  return { alert, errors };
}

/** Stamp a validated alert for storage. The revision is the save time, so it
 *  changes on every save — call this server-side, never trust a client one. */
export function stampAlert(alert: SiteAlert, now: Date = new Date()): SiteAlert {
  const iso = now.toISOString();
  return { ...alert, revision: iso, updatedAt: iso };
}

/** Read a stored file defensively: anything unparseable is the empty alert;
 *  a parseable one keeps its stored revision. */
export function parseStoredAlert(content: string | null | undefined, limits: SiteAlertLimits): SiteAlert {
  try {
    const raw = content ? (JSON.parse(content) as Record<string, unknown>) : null;
    if (raw && typeof raw === 'object') {
      const { alert } = normalizeAlert(raw, limits);
      return {
        ...alert,
        revision: String(raw.revision ?? ''),
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
      };
    }
  } catch {
    /* fall through */
  }
  return { ...EMPTY_ALERT };
}

const fill = (s: string, contact: BrandContact | undefined) =>
  s.replace(/\{email\}/g, contact?.email ?? '').replace(/\{phone\}/g, contact?.phoneDisplay ?? '');

/**
 * The pack's presets as form fills for today (00:00–23:59 in the pack
 * timezone). `{email}` / `{phone}` come from `brand.contact`; a preset that
 * names `{email}` with no contact configured has its email button forced off.
 */
export function presetAlerts(
  presets: Record<string, SiteAlertPreset> | undefined,
  nowInZone: string,
  contact?: BrandContact,
): Record<string, Partial<SiteAlert> & { name: string }> {
  const day = nowInZone.slice(0, 10);
  const out: Record<string, Partial<SiteAlert> & { name: string }> = {};
  for (const [id, p] of Object.entries(presets ?? {})) {
    out[id] = {
      name: p.name,
      startsAt: `${day}T00:00`,
      endsAt: `${day}T23:59`,
      label: p.label ?? '',
      title: fill(p.title, contact),
      message: fill(p.message, contact),
      messageButton: p.messageButton ?? true,
      emailButton: (p.emailButton ?? true) && Boolean(contact?.email),
      phonesDown: p.phonesDown ?? false,
    };
  }
  return out;
}
