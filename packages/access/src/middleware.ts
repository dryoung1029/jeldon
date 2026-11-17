import type { AccessPolicyConfig, SecurityConfig } from '@jeldon/config';
import { canonicalPath, isProtected } from './path.js';
import {
  extractAccessJwt,
  verifyAccessJwt,
  type AccessClaims,
  type FetchJwks,
  type JwksCache,
} from './jwt.js';

/** The slice of a framework request context the gate needs. Astro's
 *  `APIContext` satisfies it (`request`, `url`, `routePattern`). */
export interface AccessContext {
  request: Request;
  url?: URL;
  routePattern?: string | null;
}

export type AccessNext = () => Promise<Response>;

export type AccessDecision =
  | { action: 'pass'; protected: false }
  | { action: 'pass'; protected: true; claims?: AccessClaims; bypass?: 'dev' }
  | { action: 'deny'; status: 401 | 500; reason: string };

export interface AccessGateOptions<C extends AccessContext = AccessContext> {
  /** Path prefixes that need a verified token (`pack.security.adminPrefixes`). */
  prefixes: readonly string[];
  /** The Access application, static or resolved per request (env overrides).
   *  Missing / blank `teamDomain` or `aud` → every protected request is denied
   *  with 500. It never passes through. */
  access?:
    | Partial<AccessPolicyConfig>
    | ((ctx: C) => Partial<AccessPolicyConfig> | undefined | null)
    | null;
  /** Skip verification on protected routes. ONLY the boolean `true` counts —
   *  pass `import.meta.env.DEV` and nothing else. A built site never sets it. */
  devBypass?: boolean;
  fetchJwks?: FetchJwks;
  cache?: JwksCache;
  /** Seconds since epoch. Injected for tests. */
  now?: () => number;
}

/** Decide one request. Pure apart from the JWKS fetch. */
export async function decideAccess<C extends AccessContext>(ctx: C, opts: AccessGateOptions<C>): Promise<AccessDecision> {
  const url = ctx.url ?? new URL(ctx.request.url);
  const path = canonicalPath(url.pathname);
  if (!isProtected(path, ctx.routePattern ?? null, opts.prefixes)) return { action: 'pass', protected: false };

  if (opts.devBypass === true) return { action: 'pass', protected: true, bypass: 'dev' };

  const cfg = typeof opts.access === 'function' ? opts.access(ctx) : opts.access;
  const teamDomain = cfg?.teamDomain?.trim();
  const aud = cfg?.aud?.trim();
  if (!teamDomain || !aud) {
    return { action: 'deny', status: 500, reason: 'admin access is not configured (security.access.teamDomain / aud)' };
  }

  const token = extractAccessJwt(ctx.request);
  if (!token) return { action: 'deny', status: 401, reason: 'Cloudflare Access token missing' };
  const res = await verifyAccessJwt(token, {
    teamDomain,
    aud,
    fetchJwks: opts.fetchJwks,
    cache: opts.cache,
    now: opts.now,
  });
  if (!res.ok) return { action: 'deny', status: 401, reason: res.reason };
  return { action: 'pass', protected: true, claims: res.claims };
}

export function denyResponse(status: 401 | 500, reason: string): Response {
  const head = status === 500 ? 'Server misconfigured' : 'Unauthorized';
  return new Response(`${head}: ${reason}`, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
  });
}

/**
 * Middleware factory: `(ctx, next) => Response`. Wire it with Astro's
 * `defineMiddleware`. Protected requests without a valid token never reach
 * `next()`; misconfiguration is a 500, not a pass-through.
 */
export function createAccessMiddleware<C extends AccessContext = AccessContext>(
  opts: AccessGateOptions<C> & { onVerified?: (claims: AccessClaims, ctx: C) => void },
) {
  return async (ctx: C, next: AccessNext): Promise<Response> => {
    const d = await decideAccess(ctx, opts);
    if (d.action === 'deny') return denyResponse(d.status, d.reason);
    if (d.protected && d.claims && opts.onVerified) opts.onVerified(d.claims, ctx);
    return next();
  };
}

/**
 * Pack values with optional runtime env overrides (so a changed team domain or
 * AUD is a dashboard edit, not a code change). Blank env values do not
 * override. Env names default to `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD`.
 */
export function resolveAccessConfig(
  security: Pick<SecurityConfig, 'access'> | undefined,
  env: Record<string, unknown> | undefined,
  names: { teamDomain?: string; aud?: string } = {},
): Partial<AccessPolicyConfig> {
  const read = (k: string) => {
    const v = env?.[k];
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };
  return {
    teamDomain: read(names.teamDomain ?? 'CF_ACCESS_TEAM_DOMAIN') ?? security?.access?.teamDomain,
    aud: read(names.aud ?? 'CF_ACCESS_AUD') ?? security?.access?.aud,
  };
}
