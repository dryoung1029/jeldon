/**
 * POST /api/contact/ — the one server route on the site. Runs on Cloudflare
 * Workers. All logic lives in @jeldon/kit-local-business (`handleContact`):
 * honeypot, optional Turnstile, LeadSink + Notifier adapters chosen by
 * kit.config.ts, the honest 503 when nothing is configured.
 *
 * IMPORTANT: this route must not import the Domain Pack LOADER (jiti +
 * node:fs). `kit.config.ts` is plain data and `@jeldon/kit-local-business`'s
 * root entry is Worker-safe. The compliance pack is read at build time and
 * inlined below via the pure `@jeldon/config` root (no loader).
 */
import type { APIRoute } from 'astro';
import { handleContact, type ContactEnv } from '@jeldon/kit-local-business';
import { kit } from '../../../kit.config';
import { COMPLIANCE_PACK } from '../../lib/compliance-pack';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = ((locals as { runtime?: { env?: ContactEnv } }).runtime?.env ?? {}) as ContactEnv;
  return handleContact(request, env, { kit, compliancePack: COMPLIANCE_PACK });
};

export const GET: APIRoute = () => new Response('Use the contact form.', { status: 405, headers: { Allow: 'POST' } });
