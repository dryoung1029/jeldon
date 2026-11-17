/**
 * Service-account auth for the Search Console API, Workers-safe.
 *
 * Ported from Body of Health `scripts/fetch-search-console.mjs`
 * (`loadServiceAccount` + `getAccessToken`), with one deliberate change: BoH
 * signed the JWT with `node:crypto` `createSign`, which does not exist in a
 * Cloudflare Worker. This signs with WebCrypto (`crypto.subtle`, RS256 =
 * RSASSA-PKCS1-v1_5 + SHA-256), which exists in Workers, Node >= 18 and
 * browsers. No `Buffer` either — base64 goes through `atob`/`btoa`.
 */

export const SEARCH_CONSOLE_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  project_id?: string;
  [k: string]: unknown;
}

/** Why a key could not be used. Each one names a different fix. */
export type KeyParseFailure =
  /** Unset or blank. In GitHub Actions a misspelled secret name expands to "". */
  | 'empty'
  /** Starts with `{` but is not valid JSON. */
  | 'not_json'
  /** Not JSON and not base64 that decodes to JSON. */
  | 'not_json_or_base64'
  /** Valid JSON but missing `client_email` or `private_key` (wrong file —
   *  e.g. an OAuth client secret instead of a service-account key). */
  | 'missing_fields'
  /** `private_key` is not a PKCS#8 PEM (`-----BEGIN PRIVATE KEY-----`). */
  | 'bad_private_key';

export type KeyParseResult =
  | { ok: true; key: ServiceAccountKey; encoding: 'json' | 'base64' }
  | { ok: false; reason: KeyParseFailure; message: string };

function base64ToUtf8(b64: string): string {
  const clean = b64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/**
 * Accept the key as raw JSON or base64-encoded JSON (base64 is easier to paste
 * into a secret without newline mangling). Never throws.
 */
export function parseServiceAccountKey(raw: string | undefined | null): KeyParseResult {
  const text0 = (raw ?? '').trim();
  if (!text0) {
    return { ok: false, reason: 'empty', message: 'service-account key is empty or unset' };
  }
  let text = text0;
  let encoding: 'json' | 'base64' = 'json';
  if (!text.startsWith('{')) {
    try {
      text = base64ToUtf8(text).trim();
      encoding = 'base64';
    } catch {
      return {
        ok: false,
        reason: 'not_json_or_base64',
        message: 'service-account key is neither JSON nor base64-encoded JSON',
      };
    }
    if (!text.startsWith('{')) {
      return {
        ok: false,
        reason: 'not_json_or_base64',
        message: 'service-account key decodes from base64 but is not JSON',
      };
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      reason: encoding === 'json' ? 'not_json' : 'not_json_or_base64',
      message: `service-account key is not valid JSON (${(err as Error).message})`,
    };
  }
  const sa = parsed as Partial<ServiceAccountKey> | null;
  if (!sa || typeof sa !== 'object' || typeof sa.client_email !== 'string' || !sa.client_email || typeof sa.private_key !== 'string' || !sa.private_key) {
    return {
      ok: false,
      reason: 'missing_fields',
      message: 'key JSON has no client_email/private_key — use the service-account key file, not an OAuth client secret',
    };
  }
  // A key pasted through a shell sometimes arrives with literal "\n" escapes.
  const pem = sa.private_key.includes('\\n') ? sa.private_key.replace(/\\n/g, '\n') : sa.private_key;
  if (!/-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----/.test(pem)) {
    return {
      ok: false,
      reason: 'bad_private_key',
      message: 'private_key is not a PKCS#8 PEM block (-----BEGIN PRIVATE KEY-----)',
    };
  }
  return { ok: true, key: { ...(sa as ServiceAccountKey), private_key: pem }, encoding };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] as number);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function strToBase64Url(s: string): string {
  return bytesToBase64Url(new TextEncoder().encode(s));
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

function subtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) throw new Error('WebCrypto (crypto.subtle) is not available in this runtime');
  return c.subtle;
}

export async function importPrivateKey(pem: string): Promise<CryptoKey> {
  return subtle().importKey(
    'pkcs8',
    pemToDer(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

export interface JwtClaims {
  iss: string;
  scope: string;
  aud: string;
  iat: number;
  exp: number;
  [k: string]: unknown;
}

/** Sign an RS256 JWT with WebCrypto. Accepts a PEM or an imported CryptoKey. */
export async function signJwt(claims: JwtClaims, key: string | CryptoKey): Promise<string> {
  const cryptoKey = typeof key === 'string' ? await importPrivateKey(key) : key;
  const header = strToBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = strToBase64Url(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  const sig = await subtle().sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${bytesToBase64Url(new Uint8Array(sig))}`;
}

/** Build the JWT-bearer claim set Google's token endpoint expects. */
export function serviceAccountClaims(
  sa: Pick<ServiceAccountKey, 'client_email'>,
  opts: { now?: number; scope?: string; audience?: string; ttlSeconds?: number } = {},
): JwtClaims {
  const iat = Math.floor((opts.now ?? Date.now()) / 1000);
  return {
    iss: sa.client_email,
    scope: opts.scope ?? SEARCH_CONSOLE_SCOPE,
    aud: opts.audience ?? GOOGLE_TOKEN_URL,
    iat,
    exp: iat + (opts.ttlSeconds ?? 3600),
  };
}

/** A non-2xx from Google, carrying what `diagnoseSearchConsoleError` needs. */
export class SearchConsoleHttpError extends Error {
  constructor(
    readonly stage: 'token' | 'query',
    readonly status: number,
    readonly body: string,
  ) {
    super(`${stage === 'token' ? 'token exchange' : 'searchAnalytics'} failed: ${status} ${body}`);
    this.name = 'SearchConsoleHttpError';
  }
}

/** Exchange a signed assertion for an access token (JWT-bearer grant). */
export async function getAccessToken(
  sa: ServiceAccountKey,
  opts: { fetch?: FetchLike; now?: number; scope?: string } = {},
): Promise<string> {
  const f = opts.fetch ?? (globalThis.fetch as FetchLike);
  const assertion = await signJwt(serviceAccountClaims(sa, opts), sa.private_key);
  const res = await f(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });
  if (!res.ok) throw new SearchConsoleHttpError('token', res.status, await res.text());
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new SearchConsoleHttpError('token', res.status, 'response had no access_token');
  return data.access_token;
}
