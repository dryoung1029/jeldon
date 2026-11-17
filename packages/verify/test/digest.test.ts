import { describe, expect, it } from 'vitest';
import { Cite8DigestSource, NullDigestSource, type HttpClient } from '../src/index.js';

function http(status: number, body: unknown, seen: Array<{ url: string; method: string; headers: Record<string, string> }> = []): HttpClient {
  return {
    async fetch(url, init) {
      seen.push({ url, method: init.method, headers: init.headers });
      return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(body),
        json: async () => body,
      };
    },
  };
}

describe('Cite8DigestSource', () => {
  it('is not_configured without a key (no request made)', async () => {
    const seen: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
    const r = await new Cite8DigestSource({ http: http(200, {}, seen) }).fetchDigest({ days: 7 });
    expect(r.status).toBe('not_configured');
    expect(seen).toHaveLength(0);
  });

  it('normalises documents and keeps the truncated flag', async () => {
    const seen: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
    const src = new Cite8DigestSource({
      apiKey: 'k',
      baseUrl: 'https://digest.example/',
      http: http(
        200,
        {
          total: 3,
          truncated: true,
          documents: [
            { pmid: 123, title: 'A trial', journal: 'J', year: 2024, evidence_level: 1, pubmed_url: 'https://x.example/123' },
            { title: '' },
            { title: 'Unclassified', evidence_level: null },
          ],
        },
        seen,
      ),
    });
    const r = await src.fetchDigest({ days: 7 });
    expect(seen[0]).toMatchObject({ url: 'https://digest.example/api/v1/digest?days=7', method: 'GET' });
    expect(seen[0]!.headers.Authorization).toBe('Bearer k');
    if (r.status !== 'ok') throw new Error('expected ok');
    expect(r.truncated).toBe(true);
    expect(r.total).toBe(3);
    expect(r.documents).toHaveLength(2);
    expect(r.documents[0]).toMatchObject({ id: '123', identifiers: { PMID: '123' }, evidenceLevel: 1, url: 'https://x.example/123' });
    expect(r.documents[1]!.evidenceLevel).toBeNull();
  });

  it('reports an HTTP failure as error', async () => {
    const r = await new Cite8DigestSource({ apiKey: 'k', http: http(500, 'nope') }).fetchDigest({ days: 7 });
    expect(r.status).toBe('error');
  });

  it('NullDigestSource reads as not_configured, not as an empty digest', async () => {
    expect((await new NullDigestSource().fetchDigest()).status).toBe('not_configured');
  });
});
