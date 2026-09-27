/**
 * The contact route — the one server route on a kit site. Framework-agnostic:
 * `handleContact(request, env, opts)` takes a Fetch `Request` and returns a
 * `Response`, so it runs identically under Astro on Cloudflare Workers, in a
 * test, or behind any other host. Ported from Helix `src/pages/api/contact.ts`
 * with the two vendor couplings lifted into adapters:
 *
 *   LeadSink  — where the person goes: pushpress | gohighlevel | brevo-contact | none
 *   Notifier  — who hears about it:    brevo | resend | none
 *
 * Rules that survive every adapter:
 *   - honeypot always; Turnstile optional (site key + secret must be set together)
 *   - if NOTHING is configured, answer 503 with an honest "call us" — a silent
 *     black hole is the worst outcome for a small business
 *   - a duplicate contact in the CRM is not a failure
 *   - never guess a recipient: both notify addresses must be set explicitly
 *
 * Gotchas carried over:
 *   - CSRF/Origin: the form posts same-origin; a Worker route sees the visitor's
 *     `Origin`. We don't hard-fail on a missing Origin (some privacy browsers
 *     strip it) — the honeypot + Turnstile carry the spam load.
 *   - Trailing slash: with Astro `trailingSlash: 'always'` the endpoint is
 *     `/api/contact/` (slash). Posting to `/api/contact` 301s and drops the
 *     body. Forms + test scripts use the slash form.
 */
import { createPushPressLead, type PushPressEnv } from './pushpress.js';
import type { KitConfig, LeadSinkKind, NotifierKind } from './kit-config.js';

export interface ContactEnv extends PushPressEnv {
  BREVO_API_KEY?: string;
  RESEND_API_KEY?: string;
  LEAD_NOTIFY_TO?: string;
  LEAD_NOTIFY_FROM?: string;
  TURNSTILE_SECRET_KEY?: string;
  GHL_WEBHOOK_URL?: string;
}

export interface Lead {
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  page: string;
  pageUrl?: string;
  referer?: string;
}

export interface SinkResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export interface LeadSink {
  kind: LeadSinkKind;
  configured(env: ContactEnv): boolean;
  send(lead: Lead, env: ContactEnv, fetchImpl: typeof fetch): Promise<SinkResult>;
}

export interface Notifier {
  kind: NotifierKind;
  configured(env: ContactEnv): boolean;
  send(args: { subject: string; html: string; replyTo: { email: string; name: string }; siteName: string }, env: ContactEnv, fetchImpl: typeof fetch): Promise<SinkResult>;
}

// ---------------------------------------------------------------------------
// Lead sinks
// ---------------------------------------------------------------------------

export const pushpressSink: LeadSink = {
  kind: 'pushpress',
  configured: (env) => Boolean(env.PUSHPRESS_API_KEY && env.PUSHPRESS_COMPANY_ID),
  async send(lead, env, fetchImpl) {
    const r = await createPushPressLead(env, {
      firstName: lead.firstName, lastName: lead.lastName, email: lead.email, phone: lead.phone,
      campaign: `website-${lead.subject.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      pageUrl: lead.pageUrl, referer: lead.referer,
    }, fetchImpl);
    return { ok: r.ok, id: r.customerId, error: r.error };
  },
};

/** GoHighLevel inbound webhook (PushPress Grow is GHL). The webhook URL is
 *  config or env; GHL accepts any JSON and maps fields in its workflow. */
export const goHighLevelSink = (webhookUrl?: string): LeadSink => ({
  kind: 'gohighlevel',
  configured: (env) => Boolean(webhookUrl || env.GHL_WEBHOOK_URL),
  async send(lead, env, fetchImpl) {
    const url = webhookUrl || env.GHL_WEBHOOK_URL;
    if (!url) return { ok: false, error: 'GoHighLevel webhook not configured' };
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: lead.firstName, last_name: lead.lastName, email: lead.email, phone: lead.phone,
          source: 'website', subject: lead.subject, message: lead.message, page: lead.pageUrl ?? lead.page,
        }),
      });
      if (!res.ok) return { ok: false, error: `ghl ${res.status}: ${(await res.text()).slice(0, 200)}` };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});

/** Brevo Contacts API — the CRM-less fallback: the person lands in a Brevo
 *  list the owner can see. `updateEnabled` makes a duplicate a non-failure. */
export const brevoContactSink: LeadSink = {
  kind: 'brevo-contact',
  configured: (env) => Boolean(env.BREVO_API_KEY),
  async send(lead, env, fetchImpl) {
    if (!env.BREVO_API_KEY) return { ok: false, error: 'Brevo not configured' };
    try {
      const res = await fetchImpl('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          email: lead.email,
          attributes: { FIRSTNAME: lead.firstName, LASTNAME: lead.lastName, SMS: lead.phone || undefined, WEBSITE_SUBJECT: lead.subject },
          updateEnabled: true,
        }),
      });
      if (!res.ok && res.status !== 204) {
        const text = await res.text();
        if (/duplicate|already exist/i.test(text)) return { ok: true, error: 'existing contact' };
        return { ok: false, error: `brevo contacts ${res.status}: ${text.slice(0, 200)}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};

export const noneSink: LeadSink = {
  kind: 'none',
  configured: () => false,
  async send() {
    return { ok: false, error: 'no lead sink configured' };
  },
};

// ---------------------------------------------------------------------------
// Notifiers
// ---------------------------------------------------------------------------

function recipients(env: ContactEnv): { to: string; from: string } | null {
  // Never guess a recipient: both must be set in the environment.
  if (!env.LEAD_NOTIFY_TO || !env.LEAD_NOTIFY_FROM) return null;
  return { to: env.LEAD_NOTIFY_TO, from: env.LEAD_NOTIFY_FROM };
}

export const brevoNotifier: Notifier = {
  kind: 'brevo',
  configured: (env) => Boolean(env.BREVO_API_KEY && recipients(env)),
  async send({ subject, html, replyTo, siteName }, env, fetchImpl) {
    if (!env.BREVO_API_KEY) return { ok: false, error: 'Brevo not configured' };
    const r = recipients(env);
    if (!r) return { ok: false, error: 'LEAD_NOTIFY_TO / LEAD_NOTIFY_FROM not set' };
    try {
      const res = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ sender: { email: r.from, name: `${siteName} website` }, to: [{ email: r.to }], replyTo, subject, htmlContent: html }),
      });
      if (!res.ok) return { ok: false, error: `brevo ${res.status}: ${(await res.text()).slice(0, 200)}` };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};

export const resendNotifier: Notifier = {
  kind: 'resend',
  configured: (env) => Boolean(env.RESEND_API_KEY && recipients(env)),
  async send({ subject, html, replyTo, siteName }, env, fetchImpl) {
    if (!env.RESEND_API_KEY) return { ok: false, error: 'Resend not configured' };
    const r = recipients(env);
    if (!r) return { ok: false, error: 'LEAD_NOTIFY_TO / LEAD_NOTIFY_FROM not set' };
    try {
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `${siteName} website <${r.from}>`, to: [r.to], reply_to: replyTo.email, subject, html }),
      });
      if (!res.ok) return { ok: false, error: `resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};

export const noneNotifier: Notifier = {
  kind: 'none',
  configured: () => false,
  async send() {
    return { ok: false, error: 'no notifier configured' };
  },
};

export function leadSinkFor(kit: Pick<KitConfig, 'contact'>): LeadSink {
  switch (kit.contact.leadSink) {
    case 'pushpress': return pushpressSink;
    case 'gohighlevel': return goHighLevelSink(kit.contact.goHighLevelWebhookUrl);
    case 'brevo-contact': return brevoContactSink;
    default: return noneSink;
  }
}

export function notifierFor(kit: Pick<KitConfig, 'contact'>): Notifier {
  switch (kit.contact.notifier) {
    case 'brevo': return brevoNotifier;
    case 'resend': return resendNotifier;
    default: return noneNotifier;
  }
}

// ---------------------------------------------------------------------------
// The handler
// ---------------------------------------------------------------------------

export function clean(v: FormDataEntryValue | null | undefined, max: number): string {
  return String(v ?? '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

export async function verifyTurnstile(secret: string, token: string, ip: string | null, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const json = (await res.json().catch(() => ({}))) as { success?: boolean };
  return Boolean(json.success);
}

export interface HandleContactOptions {
  kit: Pick<KitConfig, 'contact' | 'site' | 'routes'>;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  leadSink?: LeadSink;
  notifier?: Notifier;
  /** Compliance pack from the Domain Pack; `hipaa` adds the no-health-details reminder to the email. */
  compliancePack?: string;
}

export interface ContactOutcome {
  status: number;
  ok: boolean;
  error?: string;
  lead?: SinkResult;
  mail?: SinkResult;
  /** Where a non-JS form post is redirected. */
  redirect?: string;
}

/** Pure-ish core: form data + env → outcome. `handleContact` wraps it in a Response. */
export async function processContact(form: FormData, headers: Headers, env: ContactEnv, opts: HandleContactOptions): Promise<ContactOutcome> {
  const { kit } = opts;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sink = opts.leadSink ?? leadSinkFor(kit);
  const notifier = opts.notifier ?? notifierFor(kit);

  // Honeypot: bots fill every field.
  if (clean(form.get('website'), 10)) return { status: 200, ok: true, redirect: kit.routes.thanks };

  const name = clean(form.get('name'), 120);
  const email = clean(form.get('email'), 200);
  const phone = clean(form.get('phone'), 40);
  const rawSubject = clean(form.get('subject'), 80);
  const subject = kit.contact.subjects.includes(rawSubject) ? rawSubject : 'Website message';
  const message = clean(form.get('message'), 3000);
  const page = clean(form.get('page'), 200).replace(/^(?!\/[a-z0-9\-\/]*$).*/i, '/');

  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !message) {
    return { status: 400, ok: false, error: 'Please add your name, a valid email, and a message.' };
  }

  const ip = headers.get('cf-connecting-ip');
  if (env.TURNSTILE_SECRET_KEY) {
    const token = clean(form.get('cf-turnstile-response'), 4000);
    if (!token || !(await verifyTurnstile(env.TURNSTILE_SECRET_KEY, token, ip, fetchImpl))) {
      return { status: 400, ok: false, error: 'Spam check failed. Please try again or call us.' };
    }
  }

  const [firstName = '', ...rest] = name.split(/\s+/);
  const lead: Lead = {
    name, firstName, lastName: rest.join(' '), email, phone, subject, message, page,
    pageUrl: page ? new URL(page, kit.site.url).toString() : undefined,
    referer: headers.get('referer') ?? undefined,
  };

  const leadRes = sink.configured(env) ? await sink.send(lead, env, fetchImpl) : { ok: false, error: `${sink.kind}: not configured` };

  const hipaa = opts.compliancePack === 'hipaa';
  const html = `
    <h2>New website message — ${escapeHtml(subject)}</h2>
    <p><strong>${escapeHtml(name)}</strong><br>
    <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>${phone ? `<br>${escapeHtml(phone)}` : ''}</p>
    <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
    <hr>
    <p style="color:#666;font-size:12px">${leadRes.ok ? `Added to ${sink.kind} as a lead.` : `Not added to ${sink.kind} (${escapeHtml(leadRes.error ?? 'not configured')}).`}${
      hipaa ? ' Reminder: this email may contain health information — handle under your BAA and do not forward outside the practice.' : ''
    }</p>
  `;
  const mailRes = notifier.configured(env)
    ? await notifier.send({ subject: `[${kit.site.name} website] ${subject} — ${name}`, html, replyTo: { email, name }, siteName: kit.site.name }, env, fetchImpl)
    : { ok: false, error: `${notifier.kind}: not configured` };

  if (!leadRes.ok && !mailRes.ok) {
    const call = kit.site.phoneDisplay ? ` Please call ${kit.site.phoneDisplay}` : '';
    const mail = kit.site.email ? `${call ? ' or' : ' Please'} email ${kit.site.email}` : '';
    return { status: 503, ok: false, error: `We couldn't send that just now.${call}${mail}.`, lead: leadRes, mail: mailRes };
  }
  return { status: 200, ok: true, lead: leadRes, mail: mailRes, redirect: kit.routes.thanks };
}

/** Fetch-API handler: POST → JSON (when `Accept: application/json`) or a 303 redirect. */
export async function handleContact(request: Request, env: ContactEnv, opts: HandleContactOptions): Promise<Response> {
  if (request.method !== 'POST') return new Response('Use the contact form.', { status: 405, headers: { Allow: 'POST' } });
  const wantsJson = (request.headers.get('accept') || '').includes('application/json');
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return respond(wantsJson, { status: 400, ok: false, error: 'Bad request.' }, opts.kit.routes.contact);
  }
  const outcome = await processContact(form, request.headers, env, opts);
  return respond(wantsJson, outcome, opts.kit.routes.contact);
}

function respond(wantsJson: boolean, o: ContactOutcome, contactRoute: string): Response {
  if (wantsJson) {
    return new Response(JSON.stringify({ ok: o.ok, ...(o.error ? { error: o.error } : {}) }), {
      status: o.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const location = o.ok ? (o.redirect ?? '/thanks/') : `${contactRoute}?error=${encodeURIComponent(o.error ?? 'Something went wrong')}`;
  return new Response(null, { status: 303, headers: { Location: location } });
}
