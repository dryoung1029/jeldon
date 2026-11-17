/**
 * Admin route protection (@jeldon/access), Cloudflare Access in front.
 *
 * Every request under `pack.security.adminPrefixes` needs a verified Access
 * JWT. Checked against BOTH the canonicalised path and the route Astro chose,
 * so `//admin`, `/%61dmin`, `/ADMIN`, `/admin;x`, `\admin` and `..` tricks
 * cannot reach an admin handler as "public".
 *
 * FAILS CLOSED: with no `security.access` (team domain + AUD) in the pack and
 * no CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD env override, protected routes
 * answer 500. Only `astro dev` skips the check.
 *
 * The middleware only sees ON-DEMAND routes. A prerendered page is a static
 * asset and is served without running the worker, so every protected page
 * and endpoint must `export const prerender = false`.
 *
 * The security block is injected at build time by astro.config.mjs
 * (`__JELDON_SECURITY__`) so the worker never loads the pack from disk.
 */
import { defineMiddleware } from 'astro:middleware';
import { createAccessMiddleware, resolveAccessConfig } from '@jeldon/access';

const security = __JELDON_SECURITY__;

const gate = createAccessMiddleware<Parameters<Parameters<typeof defineMiddleware>[0]>[0]>({
  prefixes: security.adminPrefixes,
  access: (ctx) => {
    const env = (ctx.locals as { runtime?: { env?: Record<string, unknown> } }).runtime?.env;
    return resolveAccessConfig(security, env);
  },
  devBypass: import.meta.env.DEV === true,
});

export const onRequest = defineMiddleware((ctx, next) => gate(ctx, () => next()));
