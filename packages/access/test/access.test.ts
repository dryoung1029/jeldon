import { beforeAll, describe, expect, it } from 'vitest';
import {
  JwksCache,
  canonicalPath,
  createAccessMiddleware,
  isProtected,
  resolveAccessConfig,
  verifyAccessJwt,
  type Jwk,
} from '../src/index.js';

const PREFIXES = ['/admin', '/api/admin'];
const TEAM = 'team.example.cloudflareaccess.com';
const AUD = 'aud-123';
const NOW = 1_800_000_000;

// ---------------------------------------------------------------------------
// Path canonicalisation + protection
// ---------------------------------------------------------------------------

describe('canonicalPath / isProtected', () => {
  const bypasses = [
    '/admin',
    '/admin/',
    '/ADMIN',
    '/Admin/Studio',
    '//admin',
    '//api/admin/drafts',
    '/api//admin/drafts',
    '\\admin',
    '/\\api\\admin\\drafts',
    '/admin;x',
    '/api/admin;jsessionid=1/drafts',
    '/%61dmin',
    '/api/%61dmin/drafts',
    '/%2561dmin', // double-encoded
    '/%252561dmin', // triple-encoded
    '/public/%2e%2e/admin',
    '/public/%252e%252e/admin',
    '/public/../admin',
    '/./admin',
    '/x/./../api/admin/drafts',
    '/%2fadmin',
    '/%5cadmin',
  ];
  for (const raw of bypasses) {
    it(`protects ${raw}`, () => {
      expect(isProtected(raw, undefined, PREFIXES)).toBe(true);
    });
  }

  it('canonicalises as documented', () => {
    expect(canonicalPath('//API/%61dmin;x/./b/../drafts')).toBe('/api/admin/drafts');
    expect(canonicalPath('/../../admin')).toBe('/admin');
  });

  it('returns null on undecodable input, which counts as protected', () => {
    expect(canonicalPath('/%E0%A4%A')).toBeNull();
    expect(isProtected(canonicalPath('/%E0%A4%A'), undefined, PREFIXES)).toBe(true);
    expect(isProtected('/%zz', undefined, PREFIXES)).toBe(true);
  });

  it('leaves public paths public and does not over-match on a shared stem', () => {
    expect(isProtected('/', undefined, PREFIXES)).toBe(false);
    expect(isProtected('/articles/admin-tips', undefined, PREFIXES)).toBe(false);
    expect(isProtected('/administrator', undefined, PREFIXES)).toBe(false);
    expect(isProtected('/api/public', undefined, PREFIXES)).toBe(false);
  });

  it('protects by the matched route pattern even when the path looks public', () => {
    expect(isProtected('/weird', '/api/admin/[...slug]', PREFIXES)).toBe(true);
    expect(isProtected('/weird', '/articles/[slug]', PREFIXES)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// JWT verification
// ---------------------------------------------------------------------------

const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
let priv: CryptoKey;
let pubJwk: Jwk;
let otherPriv: CryptoKey;

async function sign(payload: Record<string, unknown>, header: Record<string, unknown> = {}, key = priv) {
  const h = enc({ alg: 'RS256', kid: 'k1', typ: 'JWT', ...header });
  const p = enc(payload);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${Buffer.from(sig).toString('base64url')}`;
}
const goodClaims = () => ({ iss: `https://${TEAM}`, aud: [AUD], exp: NOW + 600, nbf: NOW - 10, email: 'a@example.com' });

async function genKey() {
  return (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
}

beforeAll(async () => {
  const kp = await genKey();
  priv = kp.privateKey;
  pubJwk = { ...((await crypto.subtle.exportKey('jwk', kp.publicKey)) as Jwk), kid: 'k1' };
  otherPriv = (await genKey()).privateKey;
});

function jwks(keys: () => Jwk[]) {
  const calls: string[] = [];
  return { calls, fetchJwks: async (team: string) => (calls.push(team), keys()) };
}
const opts = (f: ReturnType<typeof jwks>, extra: Record<string, unknown> = {}) => ({
  teamDomain: TEAM,
  aud: AUD,
  fetchJwks: f.fetchJwks,
  cache: new JwksCache(),
  now: () => NOW,
  ...extra,
});

describe('verifyAccessJwt', () => {
  it('accepts a valid token', async () => {
    const f = jwks(() => [pubJwk]);
    const r = await verifyAccessJwt(await sign(goodClaims()), opts(f));
    expect(r).toMatchObject({ ok: true, claims: { email: 'a@example.com' } });
  });

  it('accepts a scheme-prefixed team domain', async () => {
    const f = jwks(() => [pubJwk]);
    const r = await verifyAccessJwt(await sign(goodClaims()), opts(f, { teamDomain: `https://${TEAM}/` }));
    expect(r.ok).toBe(true);
  });

  it('rejects expired, not-yet-valid and exp-less tokens', async () => {
    const f = jwks(() => [pubJwk]);
    expect(await verifyAccessJwt(await sign({ ...goodClaims(), exp: NOW - 60 }), opts(f))).toEqual({ ok: false, reason: 'token expired' });
    expect(await verifyAccessJwt(await sign({ ...goodClaims(), nbf: NOW + 120 }), opts(f))).toEqual({ ok: false, reason: 'token not yet valid' });
    const { exp: _e, ...noExp } = goodClaims();
    expect(await verifyAccessJwt(await sign(noExp), opts(f))).toEqual({ ok: false, reason: 'token has no exp' });
  });

  it('allows small clock skew on nbf / exp', async () => {
    const f = jwks(() => [pubJwk]);
    expect((await verifyAccessJwt(await sign({ ...goodClaims(), nbf: NOW + 20 }), opts(f))).ok).toBe(true);
    expect((await verifyAccessJwt(await sign({ ...goodClaims(), exp: NOW - 20 }), opts(f))).ok).toBe(true);
  });

  it('rejects wrong iss and aud', async () => {
    const f = jwks(() => [pubJwk]);
    expect(await verifyAccessJwt(await sign({ ...goodClaims(), iss: 'https://evil.example.com' }), opts(f))).toEqual({ ok: false, reason: 'bad iss' });
    expect(await verifyAccessJwt(await sign({ ...goodClaims(), aud: ['other'] }), opts(f))).toEqual({ ok: false, reason: 'bad aud' });
  });

  it('rejects alg none / HS256 and a bad signature', async () => {
    const f = jwks(() => [pubJwk]);
    const t = await sign(goodClaims());
    const [, p] = t.split('.');
    expect((await verifyAccessJwt(`${enc({ alg: 'none', kid: 'k1' })}.${p}.x`, opts(f))).ok).toBe(false);
    expect((await verifyAccessJwt(`${enc({ alg: 'HS256', kid: 'k1' })}.${p}.x`, opts(f))).ok).toBe(false);
    const forged = await sign(goodClaims(), {}, otherPriv);
    expect(await verifyAccessJwt(forged, opts(f))).toEqual({ ok: false, reason: 'signature invalid' });
    expect(await verifyAccessJwt('a.b', opts(f))).toEqual({ ok: false, reason: 'malformed JWT' });
  });

  it('refetches JWKS once on an unknown kid (key rotation), then caches', async () => {
    let rotated = false;
    const f = jwks(() => (rotated ? [{ ...pubJwk, kid: 'k2' }] : [pubJwk]));
    const o = opts(f);
    expect((await verifyAccessJwt(await sign(goodClaims()), o)).ok).toBe(true);
    expect(f.calls.length).toBe(1);
    expect((await verifyAccessJwt(await sign(goodClaims()), o)).ok).toBe(true);
    expect(f.calls.length).toBe(1); // cached
    rotated = true;
    expect((await verifyAccessJwt(await sign(goodClaims(), { kid: 'k2' }), o)).ok).toBe(true);
    expect(f.calls.length).toBe(2); // forced refetch
  });

  it('rejects a kid that is unknown even after refetch', async () => {
    const f = jwks(() => [pubJwk]);
    const o = opts(f);
    expect(await verifyAccessJwt(await sign(goodClaims(), { kid: 'nope' }), o)).toEqual({ ok: false, reason: 'unknown key id' });
    expect(f.calls.length).toBe(2);
  });

  it('a JWKS fetch failure is a denial, not a pass', async () => {
    const r = await verifyAccessJwt(await sign(goodClaims()), {
      ...opts(jwks(() => [])),
      fetchJwks: async () => {
        throw new Error('JWKS fetch failed: 503');
      },
    });
    expect(r).toEqual({ ok: false, reason: 'JWKS fetch failed: 503' });
  });
});

// ---------------------------------------------------------------------------
// Middleware: fail closed
// ---------------------------------------------------------------------------

describe('createAccessMiddleware', () => {
  const next = async () => new Response('admin page', { status: 200 });
  const req = (path: string, headers: Record<string, string> = {}) => ({
    request: new Request(`https://preview-abc.example.workers.dev${path}`, { headers }),
  });

  it('passes public paths without config', async () => {
    const mw = createAccessMiddleware({ prefixes: PREFIXES });
    expect((await mw(req('/articles/x'), next)).status).toBe(200);
  });

  it('FAILS CLOSED with 500 when teamDomain / aud are missing', async () => {
    for (const access of [undefined, null, {}, { teamDomain: TEAM }, { teamDomain: ' ', aud: AUD }]) {
      const mw = createAccessMiddleware({ prefixes: PREFIXES, access });
      const res = await mw(req('/admin'), next);
      expect(res.status).toBe(500);
      expect(await res.text()).not.toContain('admin page');
    }
  });

  it('401s with no token or a bogus token, on every bypass spelling', async () => {
    const f = jwks(() => [pubJwk]);
    const mw = createAccessMiddleware({ prefixes: PREFIXES, access: { teamDomain: TEAM, aud: AUD }, fetchJwks: f.fetchJwks, cache: new JwksCache(), now: () => NOW });
    for (const p of ['/admin', '//api/admin/drafts', '/api/%61dmin/drafts', '/ADMIN', '/admin;x', '/%2e%2e/admin']) {
      expect((await mw(req(p), next)).status).toBe(401);
      expect((await mw(req(p, { 'cf-access-jwt-assertion': 'x.y.z' }), next)).status).toBe(401);
    }
  });

  it('401s on a public-looking path whose matched route is protected', async () => {
    const mw = createAccessMiddleware({ prefixes: PREFIXES, access: { teamDomain: TEAM, aud: AUD } });
    expect((await mw({ ...req('/odd'), routePattern: '/api/admin/[...slug]' }, next)).status).toBe(401);
  });

  it('passes with a valid token from header or cookie and reports claims', async () => {
    const f = jwks(() => [pubJwk]);
    const seen: string[] = [];
    const mw = createAccessMiddleware({
      prefixes: PREFIXES,
      access: { teamDomain: TEAM, aud: AUD },
      fetchJwks: f.fetchJwks,
      cache: new JwksCache(),
      now: () => NOW,
      onVerified: (c) => seen.push(String(c.email)),
    });
    const t = await sign(goodClaims());
    expect((await mw(req('/admin', { 'cf-access-jwt-assertion': t }), next)).status).toBe(200);
    expect((await mw(req('/admin', { cookie: `a=b; CF_Authorization=${t}` }), next)).status).toBe(200);
    expect(seen).toEqual(['a@example.com', 'a@example.com']);
  });

  it('only an explicit devBypass === true skips the check', async () => {
    const yes = createAccessMiddleware({ prefixes: PREFIXES, devBypass: true });
    expect((await yes(req('/admin'), next)).status).toBe(200);
    const truthy = createAccessMiddleware({ prefixes: PREFIXES, devBypass: 'true' as unknown as boolean });
    expect((await truthy(req('/admin'), next)).status).toBe(500);
  });

  it('resolves env overrides over pack values, ignoring blanks', () => {
    const sec = { access: { teamDomain: TEAM, aud: AUD } };
    expect(resolveAccessConfig(sec, { CF_ACCESS_AUD: 'env-aud', CF_ACCESS_TEAM_DOMAIN: '' })).toEqual({ teamDomain: TEAM, aud: 'env-aud' });
    expect(resolveAccessConfig(undefined, undefined)).toEqual({ teamDomain: undefined, aud: undefined });
  });
});
