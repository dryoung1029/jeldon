import { describe, expect, it } from 'vitest';
import {
  base64urlDecodeUtf8,
  buildMimeMessage,
  buildRawEmail,
  createTokenCache,
  encodeHeaderWord,
  getAccessToken,
  GoogleAuthError,
  parseServiceAccount,
  type ServiceAccount,
} from '../src/index.js';

async function testKey(): Promise<{ sa: ServiceAccount; publicKey: CryptoKey }> {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const b64 = btoa(String.fromCharCode(...der)).replace(/(.{64})/g, '$1\n');
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`;
  return { sa: { client_email: 'svc@example-project.iam.gserviceaccount.com', private_key: pem }, publicKey: pair.publicKey };
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

describe('parseServiceAccount', () => {
  const json = JSON.stringify({ client_email: 'a@b.iam', private_key: 'PEM' });
  it('accepts raw JSON and base64 JSON', () => {
    expect(parseServiceAccount(json)?.client_email).toBe('a@b.iam');
    expect(parseServiceAccount(btoa(json))?.client_email).toBe('a@b.iam');
  });
  it('returns null for unusable input instead of throwing', () => {
    expect(parseServiceAccount(undefined)).toBeNull();
    expect(parseServiceAccount('')).toBeNull();
    expect(parseServiceAccount('not base64 !!')).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ client_email: 'x' }))).toBeNull();
  });
});

describe('getAccessToken', () => {
  it('signs an RS256 JWT that verifies with the generated key, with sub for delegation', async () => {
    const { sa, publicKey } = await testKey();
    let assertion = '';
    let calls = 0;
    const fetchStub = (async (_url: string, init: RequestInit) => {
      calls++;
      assertion = new URLSearchParams(String(init.body)).get('assertion') ?? '';
      return new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600 }), { status: 200 });
    }) as unknown as typeof fetch;
    const cache = createTokenCache();
    const tok = await getAccessToken({ sa, scopes: ['scope.b', 'scope.a'], sub: 'user@example.org', fetch: fetchStub, cache, now: () => 1_700_000_000_000 });
    expect(tok).toBe('tok-1');

    const [h, c, s] = assertion.split('.');
    expect(JSON.parse(base64urlDecodeUtf8(h!))).toEqual({ alg: 'RS256', typ: 'JWT' });
    const claims = JSON.parse(base64urlDecodeUtf8(c!));
    expect(claims).toMatchObject({ iss: sa.client_email, sub: 'user@example.org', scope: 'scope.a scope.b', aud: 'https://oauth2.googleapis.com/token', iat: 1_700_000_000, exp: 1_700_003_600 });
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, b64urlToBytes(s!), new TextEncoder().encode(`${h}.${c}`));
    expect(ok).toBe(true);

    // Cached: same subject + scopes does not hit the network again.
    await getAccessToken({ sa, scopes: ['scope.a', 'scope.b'], sub: 'user@example.org', fetch: fetchStub, cache, now: () => 1_700_000_000_000 });
    expect(calls).toBe(1);
    // A different subject is a different token.
    await getAccessToken({ sa, scopes: ['scope.a', 'scope.b'], sub: 'other@example.org', fetch: fetchStub, cache, now: () => 1_700_000_000_000 });
    expect(calls).toBe(2);
  });

  it('names the domain-wide delegation fix on unauthorized_client', async () => {
    const { sa } = await testKey();
    const fetchStub = (async () =>
      new Response(JSON.stringify({ error: 'unauthorized_client', error_description: 'Client is unauthorized' }), { status: 401 })) as unknown as typeof fetch;
    const err = await getAccessToken({ sa, scopes: ['s'], sub: 'u@x.org', fetch: fetchStub, cache: createTokenCache() }).catch((e) => e);
    expect(err).toBeInstanceOf(GoogleAuthError);
    expect(err.code).toBe('unauthorized_client');
    expect(err.message).toMatch(/NUMERIC client ID/);
    expect(err.message).toMatch(/Domain-wide delegation/);
  });

  it('rejects a PKCS#1 key by name', async () => {
    const sa = { client_email: 'x', private_key: '-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----' };
    const err = await getAccessToken({ sa, scopes: ['s'], fetch: (async () => new Response('')) as unknown as typeof fetch, cache: createTokenCache() }).catch((e) => e);
    expect(err.code).toBe('bad_key');
    expect(err.message).toMatch(/PKCS#1/);
  });
});

describe('buildRawEmail', () => {
  const base = { from: { name: 'Site', email: 'notify@example.org' }, to: 'inbox@example.org', subject: 'New contact: Ann', text: 'Line one\r\nLine two', boundary: 'fixed' };

  it('separates headers and body with exactly one blank line (BoH sent every email empty)', () => {
    const mime = buildMimeMessage(base);
    const idx = mime.indexOf('\r\n\r\n');
    expect(idx).toBeGreaterThan(0);
    const head = mime.slice(0, idx);
    const body = mime.slice(idx + 4);
    expect(body.startsWith('Line one')).toBe(true);
    expect(head.split('\r\n').every((l) => /^[A-Za-z-]+: /.test(l))).toBe(true);

    // Same guarantee for html and attachment shapes.
    for (const extra of [{ html: '<p>x</p>' }, { attachments: [{ filename: 'a.pdf', contentType: 'application/pdf', bytes: new Uint8Array([1, 2, 3]) }] }]) {
      const m = buildMimeMessage({ ...base, ...extra });
      const i = m.indexOf('\r\n\r\n');
      expect(m.slice(0, i).split('\r\n').every((l) => /^[A-Za-z-]+: /.test(l))).toBe(true);
      expect(m.slice(i + 4).startsWith('--')).toBe(true);
    }
  });

  it('neutralises header injection through a newline in Reply-To', () => {
    const mime = buildMimeMessage({
      ...base,
      replyTo: { name: 'Eve\r\nBcc: victim@example.net', email: 'eve@example.net\r\nBcc: victim2@example.net' },
      subject: 'Hi\nBcc: victim3@example.net',
    });
    const head = mime.slice(0, mime.indexOf('\r\n\r\n'));
    const lines = head.split('\r\n');
    expect(lines.some((l) => /^bcc:/i.test(l))).toBe(false);
    expect(lines.filter((l) => l.startsWith('Reply-To: '))).toHaveLength(1);
    expect(head).not.toMatch(/\n(?!$)[^\r]*\nBcc/);
  });

  it('RFC 2047-encodes non-ASCII with padded base64 and keeps words ≤ 75 chars', () => {
    const w = encodeHeaderWord('Zoë Ångström — a long name that keeps going and going for quite a while');
    for (const word of w.split(' ')) {
      expect(word).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/]+=*\?=$/);
      expect(word.length).toBeLessThanOrEqual(75);
    }
    const decoded = w
      .split(' ')
      .map((x) => new TextDecoder().decode(Uint8Array.from(atob(x.slice(10, -2)), (c) => c.charCodeAt(0))))
      .join('');
    expect(decoded).toBe('Zoë Ångström — a long name that keeps going and going for quite a while');
    expect(encodeHeaderWord('plain ascii')).toBe('plain ascii');
  });

  it('outputs base64url of the MIME text', () => {
    const raw = buildRawEmail(base);
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(base64urlDecodeUtf8(raw)).toBe(buildMimeMessage(base));
  });
});
