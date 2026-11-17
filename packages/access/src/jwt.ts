/**
 * Cloudflare Access JWT verification, WebCrypto only (Workers, Node 20+,
 * browsers). After login Access signs a JWT and forwards it to the origin as
 * the `Cf-Access-Jwt-Assertion` header (and a `CF_Authorization` cookie). The
 * origin verifies signature + claims so it refuses any request that did not
 * come through Access, even one that reaches it on a hostname the Access
 * application does not cover.
 */

export interface Jwk extends JsonWebKey {
  kid?: string;
}

export interface AccessClaims {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  sub?: string;
  email?: string;
  [k: string]: unknown;
}

export type VerifyResult =
  | { ok: true; claims: AccessClaims }
  | { ok: false; reason: string };

/** Fetches the team's signing keys. Default: `https://<team>/cdn-cgi/access/certs`. */
export type FetchJwks = (teamDomain: string) => Promise<Jwk[]>;

export interface VerifyOptions {
  teamDomain: string;
  aud: string;
  fetchJwks?: FetchJwks;
  /** Seconds since epoch. Injected for tests. */
  now?: () => number;
  /** Allowed clock skew for `nbf` / `exp`, seconds. Default 30. */
  clockSkewSec?: number;
  /** Key cache. Default: one module-level cache. */
  cache?: JwksCache;
}

/** Strip a scheme / trailing slash so `https://team.cloudflareaccess.com/`
 *  and `team.cloudflareaccess.com` mean the same team. */
export function normalizeTeamDomain(teamDomain: string): string {
  return teamDomain.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
}

export const defaultFetchJwks: FetchJwks = async (teamDomain) => {
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const data = (await res.json()) as { keys?: Jwk[] };
  if (!Array.isArray(data.keys)) throw new Error('JWKS response has no keys');
  return data.keys;
};

/**
 * Keys cached per team domain for `ttlMs` (default 1 h). Access rotates keys
 * occasionally, so a token whose `kid` is not in the cache forces ONE refetch
 * before it is rejected.
 */
export class JwksCache {
  private entry: { teamDomain: string; keys: Jwk[]; fetchedAt: number } | null = null;
  constructor(private readonly ttlMs = 60 * 60 * 1000) {}

  async get(teamDomain: string, fetchJwks: FetchJwks, nowMs: number, force = false): Promise<Jwk[]> {
    const e = this.entry;
    if (!force && e && e.teamDomain === teamDomain && nowMs - e.fetchedAt < this.ttlMs) return e.keys;
    const keys = await fetchJwks(teamDomain);
    this.entry = { teamDomain, keys, fetchedAt: nowMs };
    return keys;
  }

  clear(): void {
    this.entry = null;
  }
}

const sharedCache = new JwksCache();

function b64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  let b = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4) b += '=';
  const bin = atob(b);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64UrlJson<T>(s: string): T {
  return JSON.parse(new TextDecoder().decode(b64UrlToBytes(s))) as T;
}

/** Verify an Access JWT. Never throws: every failure is `{ ok: false, reason }`. */
export async function verifyAccessJwt(token: string, opts: VerifyOptions): Promise<VerifyResult> {
  const teamDomain = normalizeTeamDomain(opts.teamDomain ?? '');
  const expectedAud = (opts.aud ?? '').trim();
  if (!teamDomain || !expectedAud) return { ok: false, reason: 'access not configured' };

  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p) => !p)) return { ok: false, reason: 'malformed JWT' };
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  let header: { alg?: string; kid?: string };
  let claims: AccessClaims;
  try {
    header = b64UrlJson(headerB64);
    claims = b64UrlJson(payloadB64);
  } catch {
    return { ok: false, reason: 'malformed JWT' };
  }
  if (!header || typeof header !== 'object' || !claims || typeof claims !== 'object') {
    return { ok: false, reason: 'malformed JWT' };
  }

  // Only RS256. Never let the token pick its own algorithm ("none", HS256).
  if (header.alg !== 'RS256') return { ok: false, reason: `unexpected alg ${String(header.alg)}` };
  if (typeof header.kid !== 'string' || !header.kid) return { ok: false, reason: 'missing kid' };

  const nowSec = opts.now ? opts.now() : Math.floor(Date.now() / 1000);
  const skew = opts.clockSkewSec ?? 30;
  // Stricter than the source: a token with no exp is refused (Access always sets one).
  if (typeof claims.exp !== 'number') return { ok: false, reason: 'token has no exp' };
  if (claims.exp + skew < nowSec) return { ok: false, reason: 'token expired' };
  if (typeof claims.nbf === 'number' && claims.nbf > nowSec + skew) {
    return { ok: false, reason: 'token not yet valid' };
  }
  if (claims.iss !== `https://${teamDomain}`) return { ok: false, reason: 'bad iss' };
  const auds = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
  if (!auds.includes(expectedAud)) return { ok: false, reason: 'bad aud' };

  const fetchJwks = opts.fetchJwks ?? defaultFetchJwks;
  const cache = opts.cache ?? sharedCache;
  const nowMs = nowSec * 1000;
  let jwk: Jwk | undefined;
  try {
    let keys = await cache.get(teamDomain, fetchJwks, nowMs);
    jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) {
      keys = await cache.get(teamDomain, fetchJwks, nowMs, true);
      jwk = keys.find((k) => k.kid === header.kid);
    }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'JWKS fetch failed' };
  }
  if (!jwk) return { ok: false, reason: 'unknown key id' };

  try {
    const { kid: _kid, alg: _alg, use: _use, ...keyData } = jwk as Jwk & { use?: string };
    const key = await crypto.subtle.importKey(
      'jwk',
      keyData,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64UrlToBytes(sigB64),
      new TextEncoder().encode(`${headerB64}.${payloadB64}`),
    );
    if (!ok) return { ok: false, reason: 'signature invalid' };
  } catch {
    return { ok: false, reason: 'signature invalid' };
  }
  return { ok: true, claims };
}

/** The token Access forwarded: header first, then the `CF_Authorization` cookie. */
export function extractAccessJwt(req: Request): string | null {
  const header = req.headers.get('cf-access-jwt-assertion');
  if (header) return header.trim();
  const cookie = req.headers.get('cookie');
  if (!cookie) return null;
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie);
  return m?.[1] ? m[1].trim() : null;
}
