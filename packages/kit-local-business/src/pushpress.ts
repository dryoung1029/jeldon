/**
 * PushPress Platform API (https://api.pushpress.com/v3) adapter. Ported from
 * the Helix `src/lib/pushpress.ts`. Two jobs: read the coming week of classes
 * at build time (fast, crawlable schedule HTML) and create a lead from the
 * contact form. Auth: `API-KEY` + `company-id` headers. Never call from the
 * browser. Worker-safe (global fetch only).
 */

export const PUSHPRESS_API = 'https://api.pushpress.com/v3';

export interface PushPressEnv {
  PUSHPRESS_API_KEY?: string;
  PUSHPRESS_COMPANY_ID?: string;
}

export interface UpcomingClass {
  id: string;
  title: string;
  typeName: string | null;
  start: Date;
  end: Date;
  spotsLeft: number | null;
}

function headers(env: PushPressEnv): HeadersInit {
  return {
    'API-KEY': env.PUSHPRESS_API_KEY ?? '',
    'company-id': env.PUSHPRESS_COMPANY_ID ?? '',
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

export function isPushPressConfigured(env: PushPressEnv): boolean {
  return Boolean(env.PUSHPRESS_API_KEY && env.PUSHPRESS_COMPANY_ID);
}

/** PushPress returns epoch times; some fields are seconds, some milliseconds. */
function toDate(n: number): Date {
  return new Date(n < 1e12 ? n * 1000 : n);
}

/**
 * Next `days` days of classes, sorted by start. Returns [] when unconfigured
 * or on any failure — the page falls back to the calendar embed. Never throws
 * during a build.
 */
export async function fetchUpcomingClasses(
  env: PushPressEnv,
  days = 7,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<UpcomingClass[]> {
  if (!isPushPressConfigured(env)) return [];
  const startsAfter = Math.floor(now / 1000);
  const horizon = now + days * 86_400_000;
  const out: UpcomingClass[] = [];
  try {
    for (let page = 1; page <= 5; page++) {
      const url = `${PUSHPRESS_API}/classes?startsAfter=${startsAfter}&limit=100&page=${page}&order=ascending`;
      const res = await fetchImpl(url, { headers: headers(env) });
      if (!res.ok) break;
      const json = (await res.json()) as { data?: { resultArray?: unknown[] } };
      const rows = json.data?.resultArray ?? [];
      if (rows.length === 0) break;
      let pastHorizon = false;
      for (const raw of rows) {
        const r = raw as Record<string, unknown>;
        const start = toDate(Number(r.start));
        if (start.getTime() > horizon) {
          pastHorizon = true;
          break;
        }
        const reservations = Array.isArray(r.reservations) ? r.reservations.length : null;
        const capacity = typeof r.capacity === 'number' ? r.capacity : null;
        out.push({
          id: String(r.id),
          title: String(r.title || r.name || r.classTypeName || 'Class'),
          typeName: (r.classTypeName as string) ?? null,
          start,
          end: toDate(Number(r.end)),
          spotsLeft: capacity !== null && reservations !== null ? Math.max(0, capacity - reservations) : null,
        });
      }
      if (pastHorizon || rows.length < 100) break;
    }
  } catch {
    return [];
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export interface PushPressLeadInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  campaign?: string;
  pageUrl?: string;
  referer?: string;
  utm?: { source?: string; medium?: string; campaign?: string; content?: string; term?: string };
}

export interface PushPressLeadResult {
  ok: boolean;
  customerId?: string;
  error?: string;
}

/**
 * Create the person as a PushPress customer (a lead) + a website attribution.
 * Returns ok:false with a message on failure so the caller can still notify
 * the owner. A repeat inquiry (409 / "exists") is NOT a failure.
 */
export async function createPushPressLead(
  env: PushPressEnv,
  lead: PushPressLeadInput,
  fetchImpl: typeof fetch = fetch,
): Promise<PushPressLeadResult> {
  if (!isPushPressConfigured(env)) return { ok: false, error: 'PushPress not configured' };
  try {
    const res = await fetchImpl(`${PUSHPRESS_API}/customers`, {
      method: 'POST',
      headers: headers(env),
      body: JSON.stringify({
        name: { first: lead.firstName, last: lead.lastName || '-', nickname: null },
        email: lead.email,
        phone: lead.phone || null,
        source: 'PLATFORM',
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 409 || /exist|duplicate|already/i.test(text)) return { ok: true, error: 'existing customer' };
      return { ok: false, error: `customers ${res.status}: ${text.slice(0, 200)}` };
    }
    let customerId: string | undefined;
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      customerId = (json.id as string) ?? ((json.data as Record<string, unknown>)?.id as string);
    } catch {
      /* ignore */
    }
    if (customerId) {
      await fetchImpl(`${PUSHPRESS_API}/attributions/attributions`, {
        method: 'POST',
        headers: headers(env),
        body: JSON.stringify({
          customerId,
          event: 'signup',
          utmSource: lead.utm?.source ?? 'website',
          utmMedium: lead.utm?.medium ?? 'contact-form',
          utmCampaign: lead.utm?.campaign ?? lead.campaign ?? 'website-contact',
          utmContent: lead.utm?.content ?? null,
          utmTerm: lead.utm?.term ?? null,
          url: lead.pageUrl ?? null,
          referer: lead.referer ?? null,
        }),
      }).catch(() => undefined);
    }
    return { ok: true, customerId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
