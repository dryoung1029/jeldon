import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { defaultSearchConsoleConfig, type DomainPack } from '@jeldon/config';
import { runFetchSearchConsole, searchConsoleChecks } from '../src/search-console.js';

let keyJson = '';
beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const b64 = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
  keyJson = JSON.stringify({ client_email: 'sa@p.iam', private_key: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n` });
});

const pack = (sc = true, cap = false) =>
  ({ capabilities: { searchConsole: cap }, ...(sc ? { searchConsole: defaultSearchConsoleConfig } : {}) }) as unknown as DomainPack;

describe('doctor: searchConsole checks', () => {
  it('adds nothing when searchConsole is not configured', async () => {
    expect(await searchConsoleChecks(pack(false), { env: {} })).toEqual([]);
  });

  it('warns when the capability is on without a section', async () => {
    expect((await searchConsoleChecks(pack(false, true), { env: {} }))[0]!.status).toBe('warn');
  });

  it('does not touch the network unless --online', async () => {
    let called = false;
    const fetch = async () => {
      called = true;
      return new Response('{}');
    };
    const env = { GOOGLE_SEARCH_CONSOLE_SA_KEY: keyJson, GSC_PROPERTY: 'sc-domain:example.com' };
    const checks = await searchConsoleChecks(pack(), { env, fetch });
    expect(called).toBe(false);
    expect(checks.every((c) => c.status === 'ok')).toBe(true);
  });

  it('--online surfaces the diagnosis as an error with structured detail', async () => {
    const env = { GOOGLE_SEARCH_CONSOLE_SA_KEY: keyJson, GSC_PROPERTY: 'sc-domain:example.com' };
    const fetch = async (url: string) => {
      if (url.includes('oauth2')) return new Response('{"access_token":"t"}');
      return new Response(
        JSON.stringify({ error: { code: 403, message: 'Search Console API has not been used in project 99999 before', errors: [{ reason: 'accessNotConfigured' }] } }),
        { status: 403 },
      );
    };
    const checks = await searchConsoleChecks(pack(), { env, online: true, fetch });
    const last = checks[checks.length - 1]!;
    expect(last.status).toBe('error');
    expect(last.message).toContain('api_not_enabled');
    expect(last.diagnosis?.link).toMatch(/project=99999/);
  });
});

describe('fetch-search-console', () => {
  it('skips with a ::warning:: (exit 0) when secrets are missing', async () => {
    const lines: string[] = [];
    const r = await runFetchSearchConsole(pack(), { env: { GOOGLE_SEACH_CONSOLE_SA_KEY: 'x' }, log: (s) => lines.push(s) });
    expect(r.exitCode).toBe(0);
    expect(lines[0]).toMatch(/^::warning::/);
    expect(lines[0]).toContain('GOOGLE_SEACH_CONSOLE_SA_KEY');
  });

  it('writes the snapshot, and not again when only lastUpdated would change', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'jeldon-sc-'));
    const fetch = async (url: string, init?: RequestInit) => {
      if (url.includes('oauth2')) return new Response('{"access_token":"t"}');
      const body = JSON.parse(String(init?.body));
      const dim = body.dimensions?.[0];
      const rows = dim ? [{ keys: [dim === 'date' ? '2026-11-01' : `${dim}-1`], clicks: 3, impressions: 40, ctr: 0.075, position: 6.25 }] : [{ keys: [], clicks: 3, impressions: 40, ctr: 0.075, position: 6.25 }];
      return new Response(JSON.stringify({ rows }));
    };
    const env = { GOOGLE_SEARCH_CONSOLE_SA_KEY: Buffer.from(keyJson).toString('base64'), GSC_PROPERTY: 'https://example.com/' };
    const lines: string[] = [];
    expect((await runFetchSearchConsole(pack(), { env, cwd, fetch, log: (s) => lines.push(s) })).exitCode).toBe(0);
    const snap = JSON.parse(await readFile(join(cwd, defaultSearchConsoleConfig.snapshotPath), 'utf8'));
    expect(snap.queries[0]).toEqual({ query: 'query-1', clicks: 3, impressions: 40, ctr: 0.075, position: 6.3 });
    expect(snap.pages[0].page).toBe('page-1');
    await runFetchSearchConsole(pack(), { env, cwd, fetch, log: (s) => lines.push(s) });
    expect(lines[lines.length - 1]).toMatch(/No change/);
  });

  it('fails loudly with the diagnosis on an API error', async () => {
    const fetch = async (url: string) =>
      url.includes('oauth2')
        ? new Response('{"access_token":"t"}')
        : new Response(JSON.stringify({ error: { code: 403, message: "User does not have sufficient permission for site 'http://example.com/'.", errors: [{ reason: 'forbidden' }] } }), { status: 403 });
    const lines: string[] = [];
    const env = { GOOGLE_SEARCH_CONSOLE_SA_KEY: keyJson, GSC_PROPERTY: 'http://example.com/' };
    const r = await runFetchSearchConsole(pack(), { env, fetch, log: (s) => lines.push(s) });
    expect(r.exitCode).toBe(1);
    expect(lines[0]).toMatch(/^::error::.*property_mismatch/);
  });
});
