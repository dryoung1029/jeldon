import { base64ToBytes, base64url } from './encoding.js';

/**
 * Google service-account auth for edge runtimes (Workers, Pages Functions).
 *
 * node:crypto's streaming signer is not available there, so the JWT-bearer
 * grant is signed with WebCrypto (RSASSA-PKCS1-v1_5 / SHA-256 = RS256).
 *
 * Domain-wide delegation: a service account has no mailbox of its own. To act
 * as a Workspace user it puts that user in `sub`, which only works when an
 * administrator authorised the service account's NUMERIC client ID for these
 * exact scopes. Getting that wrong fails with `unauthorized_client`, which
 * looks identical to a bad key until you read the error body, so it gets a
 * named error with the fix.
 */

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  /** Optional; Google keys carry it. Used as the default token endpoint. */
  token_uri?: string;
}

export const GOOGLE_TOKEN_URI = 'https://oauth2.googleapis.com/token';

/**
 * Parse a service-account key from raw JSON or base64-encoded JSON. Base64 is
 * the easier shape to paste into a secret without the PEM's newlines getting
 * mangled. Returns null for anything unusable — "not configured" is a
 * designed-for state, not an exception.
 */
export function parseServiceAccount(raw: unknown): ServiceAccount | null {
  if (typeof raw !== 'string') return null;
  let text = raw.trim();
  if (!text) return null;
  if (!text.startsWith('{')) {
    try {
      text = new TextDecoder().decode(base64ToBytes(text.replace(/\s+/g, '')));
    } catch {
      return null;
    }
  }
  try {
    const sa = JSON.parse(text) as Record<string, unknown>;
    if (typeof sa?.client_email !== 'string' || typeof sa?.private_key !== 'string') return null;
    return {
      client_email: sa.client_email,
      private_key: sa.private_key,
      ...(typeof sa.token_uri === 'string' ? { token_uri: sa.token_uri } : {}),
    };
  } catch {
    return null;
  }
}

/** PEM (PKCS#8) → DER. PKCS#1 ("BEGIN RSA PRIVATE KEY") is not importable by
 *  WebCrypto, so it is rejected by name instead of failing inside importKey. */
export function pemToDer(pem: string): Uint8Array {
  if (pem.includes('BEGIN RSA PRIVATE KEY')) {
    throw new GoogleAuthError(
      'bad_key',
      'private key is PKCS#1; Google service-account keys are PKCS#8 ("BEGIN PRIVATE KEY") — re-download the JSON key',
    );
  }
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  return base64ToBytes(body);
}

export type GoogleAuthErrorCode = 'bad_key' | 'unauthorized_client' | 'invalid_grant' | 'http' | 'no_token';

export class GoogleAuthError extends Error {
  readonly code: GoogleAuthErrorCode;
  readonly status?: number;
  constructor(code: GoogleAuthErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'GoogleAuthError';
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

export interface TokenCache {
  get(key: string): { token: string; expiresAt: number } | undefined;
  set(key: string, entry: { token: string; expiresAt: number }): void;
}

/** Isolates are reused between requests, so a module-level cache usually
 *  saves a round trip. Pass your own `cache` to isolate (tests do). */
const moduleCache: TokenCache = new Map();

export function createTokenCache(): TokenCache {
  return new Map();
}

export interface GetAccessTokenOptions {
  sa: ServiceAccount;
  scopes: string[];
  /** Workspace user to impersonate (domain-wide delegation). */
  sub?: string;
  fetch?: typeof fetch;
  cache?: TokenCache;
  /** ms since epoch; injectable for tests. */
  now?: () => number;
  /** Token endpoint. Defaults to the key's `token_uri`, then Google's. */
  tokenUri?: string;
}

/** Signs the JWT assertion. Exported so it can be verified in tests. */
export async function signJwtAssertion(
  sa: ServiceAccount,
  claims: { scope: string; sub?: string; aud: string; iat: number; exp: number },
): Promise<string> {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      ...(claims.sub ? { sub: claims.sub } : {}),
      scope: claims.scope,
      aud: claims.aud,
      iat: claims.iat,
      exp: claims.exp,
    }),
  );
  const signingInput = `${header}.${claim}`;
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      'pkcs8',
      pemToDer(sa.private_key) as BufferSource,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  } catch (e) {
    if (e instanceof GoogleAuthError) throw e;
    throw new GoogleAuthError('bad_key', `could not import the service-account private key: ${(e as Error).message}`);
  }
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64url(new Uint8Array(sig))}`;
}

/**
 * An OAuth access token for `scopes`, optionally acting as `sub`. Cached per
 * (client, subject, scopes) and refreshed a minute before expiry — a token that
 * expires mid-flight reads as an auth failure, and clocks drift.
 */
export async function getAccessToken(opts: GetAccessTokenOptions): Promise<string> {
  const { sa } = opts;
  const scope = [...new Set(opts.scopes)].sort().join(' ');
  if (!scope) throw new GoogleAuthError('bad_key', 'getAccessToken needs at least one scope');
  const now = opts.now ?? Date.now;
  const cache = opts.cache ?? moduleCache;
  const doFetch = opts.fetch ?? fetch;
  const aud = opts.tokenUri ?? sa.token_uri ?? GOOGLE_TOKEN_URI;

  const cacheKey = `${sa.client_email}|${opts.sub ?? ''}|${scope}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now() + 60_000) return cached.token;

  const iat = Math.floor(now() / 1000);
  const assertion = await signJwtAssertion(sa, { scope, sub: opts.sub, aud, iat, exp: iat + 3600 });

  const res = await doFetch(aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
  });
  const bodyText = await res.text();
  if (!res.ok) {
    if (bodyText.includes('unauthorized_client')) {
      throw new GoogleAuthError(
        'unauthorized_client',
        `Google refused the delegation (unauthorized_client). Authorise the service account's NUMERIC client ID (not its email) for "${scope}" under Workspace Admin → Security → API controls → Domain-wide delegation.`,
        res.status,
      );
    }
    if (bodyText.includes('invalid_grant')) {
      throw new GoogleAuthError(
        'invalid_grant',
        `Google rejected the grant (invalid_grant)${opts.sub ? ` for ${opts.sub}` : ''}. Usually: that user does not exist in this Workspace, or the server clock is skewed.`,
        res.status,
      );
    }
    throw new GoogleAuthError('http', `token exchange failed: ${res.status} ${bodyText.slice(0, 300)}`, res.status);
  }
  let data: { access_token?: string; expires_in?: number };
  try {
    data = JSON.parse(bodyText);
  } catch {
    throw new GoogleAuthError('no_token', 'token exchange returned a non-JSON body');
  }
  if (!data.access_token) throw new GoogleAuthError('no_token', 'token exchange returned no access_token');
  cache.set(cacheKey, { token: data.access_token, expiresAt: now() + (data.expires_in ?? 3600) * 1000 });
  return data.access_token;
}
