import { beforeAll, describe, expect, it } from 'vitest';
import { defaultSearchConsoleConfig as cfg } from '@jeldon/config';
import { checkSearchConsoleSetup, probeSearchConsole } from '../src/index.js';

let keyJson = '';

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const b64 = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`;
  keyJson = JSON.stringify({ client_email: 'sa@p.iam.gserviceaccount.com', private_key: pem });
});

const statuses = (r: ReturnType<typeof checkSearchConsoleSetup>) => r.checks.map((c) => c.status);

describe('checkSearchConsoleSetup (offline)', () => {
  it('ok when both secrets are present and valid', () => {
    const r = checkSearchConsoleSetup(cfg, { GOOGLE_SEARCH_CONSOLE_SA_KEY: keyJson, GSC_PROPERTY: 'sc-domain:example.com' });
    expect(statuses(r)).toEqual(['ok', 'ok']);
    expect(r.resolved.property).toBe('sc-domain:example.com');
  });

  it('unset secrets error, or warn under --pre', () => {
    expect(statuses(checkSearchConsoleSetup(cfg, {}))).toEqual(['error', 'error']);
    expect(statuses(checkSearchConsoleSetup(cfg, {}, { missingAs: 'warn' }))).toEqual(['warn', 'warn']);
  });

  it('empty secret is always an error and names the misspelled one', () => {
    const r = checkSearchConsoleSetup(cfg, { GOOGLE_SEARCH_CONSOLE_SA_KEY: '', GOOGLE_SEACH_CONSOLE_SA_KEY: keyJson, GSC_PROPERTY: 'sc-domain:example.com' }, { missingAs: 'warn' });
    expect(r.checks[0]).toMatchObject({ status: 'error' });
    expect(r.checks[0]!.message).toContain('GOOGLE_SEACH_CONSOLE_SA_KEY');
  });

  it('bad key JSON and bad property format are errors; http:// is a warning', () => {
    const r = checkSearchConsoleSetup(cfg, { GOOGLE_SEARCH_CONSOLE_SA_KEY: '{"client_id":"x"}', GSC_PROPERTY: 'https://example.com' });
    expect(statuses(r)).toEqual(['error', 'error']);
    expect(r.checks[1]!.message).toContain('https://example.com/');
    expect(statuses(checkSearchConsoleSetup(cfg, { GOOGLE_SEARCH_CONSOLE_SA_KEY: keyJson, GSC_PROPERTY: 'http://example.com/' }))).toEqual(['ok', 'warn']);
  });

  it('an inline pack property overrides the env', () => {
    const r = checkSearchConsoleSetup({ ...cfg, property: 'https://example.com/' }, { GOOGLE_SEARCH_CONSOLE_SA_KEY: keyJson });
    expect(statuses(r)).toEqual(['ok', 'ok']);
  });
});

describe('probeSearchConsole (online, injected fetch)', () => {
  const resolved = () => checkSearchConsoleSetup(cfg, { GOOGLE_SEARCH_CONSOLE_SA_KEY: keyJson, GSC_PROPERTY: 'https://www.example.com/' }).resolved;

  it('ok path: token, then a 1-row query', async () => {
    const calls: string[] = [];
    const fetch = async (url: string, init?: RequestInit) => {
      calls.push(url);
      if (url.includes('oauth2')) return new Response('{"access_token":"t"}');
      expect(JSON.parse(String(init?.body)).rowLimit).toBe(1);
      return new Response('{"rows":[{"keys":[],"clicks":1,"impressions":2,"ctr":0.5,"position":3}]}');
    };
    expect(await probeSearchConsole(cfg, resolved(), { fetch })).toMatchObject({ status: 'ok', rows: 1 });
    expect(calls).toHaveLength(2);
  });

  it('403 → lists sites and diagnoses the property mismatch', async () => {
    const fetch = async (url: string) => {
      if (url.includes('oauth2')) return new Response('{"access_token":"t"}');
      if (url.endsWith('/sites')) return new Response('{"siteEntry":[{"siteUrl":"sc-domain:example.com","permissionLevel":"siteRestrictedUser"}]}');
      return new Response(JSON.stringify({ error: { code: 403, message: "User does not have sufficient permission for site 'https://www.example.com/'.", errors: [{ reason: 'forbidden' }] } }), { status: 403 });
    };
    const r = await probeSearchConsole(cfg, resolved(), { fetch });
    expect(r.status === 'failed' && r.diagnosis.kind).toBe('property_mismatch');
    expect(r.status === 'failed' && r.diagnosis.suggestedProperty).toBe('sc-domain:example.com');
  });

  it('token failure is diagnosed at the token stage', async () => {
    const fetch = async () => new Response('{"error":"invalid_grant","error_description":"Invalid JWT Signature."}', { status: 400 });
    const r = await probeSearchConsole(cfg, resolved(), { fetch });
    expect(r.status === 'failed' && r.diagnosis.kind).toBe('key_rejected');
  });

  it('skips when offline checks did not resolve a key + property', async () => {
    expect((await probeSearchConsole(cfg, {})).status).toBe('skipped');
  });
});
