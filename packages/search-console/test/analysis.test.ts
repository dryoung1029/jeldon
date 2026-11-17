import { describe, expect, it } from 'vitest';
import { defaultSearchConsoleConfig as cfg } from '@jeldon/config';
import { checkPropertyFormat, expectedCtr, lowCtr, searchDateRange, searchSignals, snapshotChanged, strikingDistance } from '../src/index.js';

const row = (k: string, position: number, impressions: number, ctr = 0.01, clicks = 0) => ({ query: k, page: k, position, impressions, ctr, clicks });

describe('expectedCtr', () => {
  const curve = cfg.lowCtr.expectedCtrCurve;
  it('reads the curve by rounded position, clamped', () => {
    expect(expectedCtr(1, curve)).toBe(0.28);
    expect(expectedCtr(1.4, curve)).toBe(0.28);
    expect(expectedCtr(2.6, curve)).toBe(0.1);
    expect(expectedCtr(0.2, curve)).toBe(0.28);
    expect(expectedCtr(10.4, curve)).toBe(0.018);
    expect(expectedCtr(40, curve)).toBe(0.018);
  });
  it('uses the configured curve, not a built-in one', () => {
    expect(expectedCtr(2, [0.5, 0.4])).toBe(0.4);
    expect(() => expectedCtr(1, [])).toThrow();
  });
});

describe('strikingDistance', () => {
  it('keeps positions 5–15 with enough impressions, biggest first', () => {
    const rows = [row('a', 4.9, 500), row('b', 5, 20), row('c', 15, 90), row('d', 15.1, 900), row('e', 9, 9), row('f', 10, 300)];
    expect(strikingDistance(rows, cfg.strikingDistance).map((r) => r.query)).toEqual(['f', 'c', 'b']);
  });
  it('caps at limit', () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(`q${i}`, 8, 100 + i));
    expect(strikingDistance(rows, cfg.strikingDistance)).toHaveLength(15);
  });
});

describe('lowCtr', () => {
  it('flags page-1 rows under ratio × expected, with expectedCtr attached', () => {
    const rows = [
      row('under', 1, 100, 0.1), // 0.1 < 0.6*0.28
      row('fine', 1, 100, 0.2), // 0.2 >= 0.168
      row('edge', 3, 100, 0.06), // 0.06 == 0.6*0.1 → not below
      row('off-page', 11, 1000, 0),
      row('no-pos', 0, 1000, 0),
      row('thin', 2, 29, 0),
    ];
    const out = lowCtr(rows, cfg.lowCtr);
    expect(out.map((r) => r.page)).toEqual(['under']);
    expect(out[0]!.expectedCtr).toBe(0.28);
    expect(out[0]!.ctrRatio).toBeCloseTo(0.1 / 0.28);
  });
  it('respects a configured ratio', () => {
    expect(lowCtr([row('x', 1, 100, 0.2)], { ...cfg.lowCtr, ratio: 0.8 })).toHaveLength(1);
  });
});

describe('searchSignals', () => {
  it('is explicit about missing data instead of returning empty lists', () => {
    expect(searchSignals(null, cfg).status).toBe('no_snapshot');
    expect(searchSignals({ lastUpdated: null, queries: [], pages: [] }, cfg).status).toBe('no_data');
    expect(searchSignals({ lastUpdated: 'x', queries: [], pages: [] }, cfg).status).toBe('no_data');
    const ok = searchSignals({ lastUpdated: 'x', queries: [row('q', 7, 50)], pages: [row('p', 1, 100, 0)] }, cfg);
    expect(ok.status === 'ok' && ok.strikingDistance.length).toBe(1);
    expect(ok.status === 'ok' && ok.lowCtr.length).toBe(1);
  });
});

describe('searchDateRange / snapshotChanged', () => {
  it('ends lagDays before now, spans rangeDays inclusive', () => {
    expect(searchDateRange({ rangeDays: 28, lagDays: 3, now: new Date('2026-11-17T12:00:00Z') })).toEqual({ start: '2026-10-18', end: '2026-11-14' });
  });
  it('ignores lastUpdated when deciding whether to write', () => {
    const a = JSON.stringify({ lastUpdated: '2026-01-01', n: 1 }, null, 2);
    const b = JSON.stringify({ lastUpdated: '2026-01-02', n: 1 }, null, 2);
    expect(snapshotChanged(a, b)).toBe(false);
    expect(snapshotChanged(a, b.replace('1\n', '2\n'))).toBe(true);
    expect(snapshotChanged(null, b)).toBe(true);
  });
});

describe('checkPropertyFormat', () => {
  it('accepts the two real forms', () => {
    expect(checkPropertyFormat('sc-domain:example.com')).toMatchObject({ ok: true, kind: 'domain' });
    expect(checkPropertyFormat('https://example.com/')).toMatchObject({ ok: true, kind: 'url-prefix' });
    expect(checkPropertyFormat('https://example.com/blog/')).toMatchObject({ ok: true, kind: 'url-prefix' });
  });
  it('warns on http://', () => {
    const r = checkPropertyFormat('http://example.com/');
    expect(r.ok && r.warning).toMatch(/different/);
  });
  it('rejects the near-misses with a suggestion', () => {
    expect(checkPropertyFormat('https://example.com')).toMatchObject({ ok: false, suggestion: 'https://example.com/' });
    expect(checkPropertyFormat('example.com')).toMatchObject({ ok: false });
    expect(checkPropertyFormat('sc-domain:https://example.com/')).toMatchObject({ ok: false, suggestion: 'sc-domain:example.com' });
    expect(checkPropertyFormat(' https://example.com/')).toMatchObject({ ok: false });
    expect(checkPropertyFormat('')).toMatchObject({ ok: false });
  });
});
