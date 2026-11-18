import { describe, expect, it, beforeAll } from 'vitest';
import {
  getAccessToken,
  GOOGLE_TOKEN_URL,
  parseServiceAccountKey,
  SEARCH_CONSOLE_SCOPE,
  SearchConsoleHttpError,
  signJwt,
  serviceAccountClaims,
} from '../src/index.js';

let pem = '';
let publicKey: CryptoKey;

function toPem(der: ArrayBuffer): string {
  const b64 = Buffer.from(der).toString('base64');
  return `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;
}
function b64urlDecode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
}

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  pem = toPem(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  publicKey = pair.publicKey;
});

const saJson = () => JSON.stringify({ type: 'service_account', project_id: 'p', client_email: 'sa@p.iam.gserviceaccount.com', private_key: pem });

describe('parseServiceAccountKey', () => {
  it('accepts raw JSON', () => {
    const r = parseServiceAccountKey(saJson());
    expect(r.ok && r.encoding).toBe('json');
    expect(r.ok && r.key.client_email).toBe('sa@p.iam.gserviceaccount.com');
  });

  it('accepts base64-encoded JSON (with whitespace/newlines from pasting)', () => {
    const b64 = Buffer.from(saJson()).toString('base64');
    const r = parseServiceAccountKey(`  ${b64.slice(0, 40)}\n${b64.slice(40)}  `);
    expect(r.ok && r.encoding).toBe('base64');
    expect(r.ok && r.key.private_key).toContain('BEGIN PRIVATE KEY');
  });

  it('normalises literal \\n escapes in private_key', () => {
    const doubled = JSON.stringify({ client_email: 'a@b.c', private_key: pem.replace(/\n/g, '\\n') });
    const r = parseServiceAccountKey(doubled);
    expect(r.ok && r.key.private_key.includes('\\n')).toBe(false);
  });

  it('names each failure', () => {
    expect(parseServiceAccountKey('')).toMatchObject({ ok: false, reason: 'empty' });
    expect(parseServiceAccountKey(undefined)).toMatchObject({ ok: false, reason: 'empty' });
    expect(parseServiceAccountKey('   ')).toMatchObject({ ok: false, reason: 'empty' });
    expect(parseServiceAccountKey('{not json')).toMatchObject({ ok: false, reason: 'not_json' });
    expect(parseServiceAccountKey('%%%not-base64%%%')).toMatchObject({ ok: false, reason: 'not_json_or_base64' });
    expect(parseServiceAccountKey(Buffer.from('hello').toString('base64'))).toMatchObject({ ok: false, reason: 'not_json_or_base64' });
    expect(parseServiceAccountKey(JSON.stringify({ installed: { client_id: 'x' } }))).toMatchObject({ ok: false, reason: 'missing_fields' });
    expect(parseServiceAccountKey(JSON.stringify({ client_email: 'a@b.c', private_key: 'abc' }))).toMatchObject({ ok: false, reason: 'bad_private_key' });
  });
});

describe('signJwt (WebCrypto RS256)', () => {
  it('produces a JWT that verifies against the generated public key', async () => {
    const claims = serviceAccountClaims({ client_email: 'sa@p.iam.gserviceaccount.com' }, { now: 1_700_000_000_000 });
    const jwt = await signJwt(claims, pem);
    const [h, p, s] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h!, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(p!, 'base64url').toString())).toEqual({
      iss: 'sa@p.iam.gserviceaccount.com',
      scope: SEARCH_CONSOLE_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    });
    expect(jwt).not.toMatch(/[+/=]/);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, b64urlDecode(s!), new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);
  });
});

describe('getAccessToken', () => {
  it('posts a jwt-bearer grant through the injected fetch', async () => {
    const key = parseServiceAccountKey(saJson());
    if (!key.ok) throw new Error('key');
    let seen: { url: string; body: string } | undefined;
    const fetch = async (url: string, init?: RequestInit) => {
      seen = { url, body: String(init?.body) };
      return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
    };
    expect(await getAccessToken(key.key, { fetch })).toBe('tok');
    expect(seen!.url).toBe(GOOGLE_TOKEN_URL);
    const form = new URLSearchParams(seen!.body);
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(form.get('assertion')!.split('.')).toHaveLength(3);
  });

  it('throws SearchConsoleHttpError with status + body on failure', async () => {
    const key = parseServiceAccountKey(saJson());
    if (!key.ok) throw new Error('key');
    const fetch = async () => new Response('{"error":"invalid_grant"}', { status: 400 });
    await expect(getAccessToken(key.key, { fetch })).rejects.toMatchObject({ stage: 'token', status: 400, body: '{"error":"invalid_grant"}' });
    await expect(getAccessToken(key.key, { fetch })).rejects.toBeInstanceOf(SearchConsoleHttpError);
  });
});

