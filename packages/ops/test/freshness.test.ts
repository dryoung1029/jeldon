import { describe, expect, it } from 'vitest';
import { domainPackSchema, type OpsPipeline } from '@jeldon/config';
import { gradePipelines, pipelineStatus } from '../src/index.js';

const NOW = Date.parse('2026-11-17T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe('pipelineStatus grading boundaries', () => {
  const at = (d: number, cadenceDays = 1) => pipelineStatus({ name: 'x', cadenceDays, lastUpdated: daysAgo(d) }, NOW).status;

  it('ok up to and including 1.5x cadence', () => {
    expect(at(0)).toBe('ok');
    expect(at(1.5)).toBe('ok');
    expect(at(10.5, 7)).toBe('ok');
  });
  it('late above 1.5x up to and including 3x', () => {
    expect(at(1.51)).toBe('late');
    expect(at(3)).toBe('late');
    expect(at(21, 7)).toBe('late');
  });
  it('stale above 3x', () => {
    expect(at(3.01)).toBe('stale');
    expect(at(21.1, 7)).toBe('stale');
  });
  it('never when no timestamp', () => {
    for (const v of [null, undefined, '']) {
      const r = pipelineStatus({ name: 'x', cadenceDays: 1, lastUpdated: v }, NOW);
      expect(r.status).toBe('never');
      expect(r.ageDays).toBeNull();
    }
  });
  it('unparseable timestamp is unattestable, not never or ok', () => {
    const r = pipelineStatus({ name: 'x', cadenceDays: 1, lastUpdated: 'yesterday-ish' }, NOW);
    expect(r.status).toBe('unattestable');
    expect(r.reason).toMatch(/does not parse/);
  });
  it('multipliers are configurable', () => {
    const g = { lateMultiplier: 1, staleMultiplier: 2 };
    expect(pipelineStatus({ name: 'x', cadenceDays: 1, lastUpdated: daysAgo(1.2) }, NOW, g).status).toBe('late');
    expect(pipelineStatus({ name: 'x', cadenceDays: 1, lastUpdated: daysAgo(2.2) }, NOW, g).status).toBe('stale');
  });
  it('rounds ageDays to 1 dp', () => {
    expect(pipelineStatus({ name: 'x', cadenceDays: 1, lastUpdated: daysAgo(1.26) }, NOW).ageDays).toBe(1.3);
  });
});

describe('change-gated files', () => {
  // Regression: hours data unchanged for 77 days read as amber purely because
  // the data had not moved, while the step ran every day.
  it('old data with a fresh check is ok and provenFresh', () => {
    const r = pipelineStatus({ name: 'Hours', cadenceDays: 45, lastUpdated: daysAgo(77), changeGated: { checkedAt: daysAgo(0.5), checkCadenceDays: 1 } }, NOW);
    expect(r.status).toBe('ok');
    expect(r.ageDays).toBe(77);
    expect(r.changeGated).toMatchObject({ provenFresh: true, checkedAgeDays: 0.5, dataChangedAt: daysAgo(77) });
  });
  it('fresh data with a stale check is graded on the CHECK (the step stopped)', () => {
    const r = pipelineStatus({ name: 'Hours', cadenceDays: 45, lastUpdated: daysAgo(1), changeGated: { checkedAt: daysAgo(4), checkCadenceDays: 1 } }, NOW);
    expect(r.status).toBe('stale');
    expect(r.changeGated?.provenFresh).toBe(false);
  });
  it('a late check is late and not provenFresh', () => {
    const r = pipelineStatus({ name: 'Hours', cadenceDays: 45, lastUpdated: daysAgo(1), changeGated: { checkedAt: daysAgo(2), checkCadenceDays: 1 } }, NOW);
    expect(r.status).toBe('late');
    expect(r.changeGated?.provenFresh).toBe(false);
  });
  it('missing checkedAt is unattestable, never ok, even when data is recent', () => {
    const r = pipelineStatus({ name: 'Hours', cadenceDays: 45, lastUpdated: daysAgo(1), changeGated: { checkedAt: undefined, checkCadenceDays: 1 } }, NOW);
    expect(r.status).toBe('unattestable');
    expect(r.reason).toMatch(/no checkedAt/);
    expect(r.changeGated?.provenFresh).toBe(false);
  });
});

describe('gradePipelines', () => {
  const pipelines: OpsPipeline[] = [
    { id: 'reviews', name: 'Reviews', file: 'reviews.json', source: 'fetch.yml', cadenceDays: 1, timestampField: 'fetchedAt' },
    { id: 'hours', name: 'Hours', file: 'hours.json', source: 'fetch.yml', cadenceDays: 45, timestampField: 'fetchedAt', changeGated: { checkCadenceDays: 1 } },
    { id: 'nested', name: 'Nested', file: 'nested.json', source: 's', cadenceDays: 7, timestampField: 'meta.lastRun' },
    { id: 'missing', name: 'Missing', file: 'missing.json', source: 's', cadenceDays: 1, timestampField: 'lastUpdated' },
    { id: 'broken', name: 'Broken', file: 'broken.json', source: 's', cadenceDays: 1, timestampField: 'lastUpdated' },
    { id: 'wrongtype', name: 'Wrong', file: 'wrong.json', source: 's', cadenceDays: 1, timestampField: 'lastUpdated' },
  ];
  const files: Record<string, unknown> = {
    'reviews.json': { fetchedAt: daysAgo(0.2) },
    // checkedAt present in THIS file; another file's checkedAt must not count.
    'hours.json': { fetchedAt: daysAgo(80), checkedAt: daysAgo(0.3) },
    'nested.json': { meta: { lastRun: daysAgo(30) } },
    'wrong.json': { lastUpdated: 12345 },
  };
  const read = (f: string) => {
    if (f === 'broken.json') throw new Error('Unexpected token');
    return files[f];
  };
  const out = gradePipelines(pipelines, read, NOW);
  const by = (id: string) => out.find((p) => p.id === id)!;

  it('grades from the configured field', () => {
    expect(by('reviews').status).toBe('ok');
    expect(by('nested').status).toBe('stale');
  });
  it('change-gated proof is read from the pipeline\'s own file', () => {
    expect(by('hours').status).toBe('ok');
    const noCheck = gradePipelines([pipelines[1]!], (f) => (f === 'hours.json' ? { fetchedAt: daysAgo(80) } : { checkedAt: daysAgo(0) }), NOW);
    expect(noCheck[0]!.status).toBe('unattestable');
  });
  it('absent file is never; unreadable or wrong-typed is unattestable', () => {
    expect(by('missing').status).toBe('never');
    expect(by('broken').status).toBe('unattestable');
    expect(by('broken').reason).toMatch(/Unexpected token/);
    expect(by('wrongtype').status).toBe('unattestable');
  });
});

describe('ops pack schema', () => {
  const base = {
    pipelines: [],
    grading: { lateMultiplier: 1.5, staleMultiplier: 3 },
    cadence: { articleDays: 14 },
  };
  const opsShape = domainPackSchema.shape.ops;
  it('accepts the default shape', () => {
    expect(opsShape.safeParse(base).success).toBe(true);
  });
  it('rejects a workflow run that is not allowlisted', () => {
    const r = opsShape.safeParse({
      ...base,
      pipelines: [{ id: 'a', name: 'A', file: 'a.json', source: 's', cadenceDays: 1, timestampField: 't', run: { kind: 'workflow', workflow: 'deploy.yml' } }],
      dispatch: { allowlist: ['fetch.yml'] },
    });
    expect(r.success).toBe(false);
  });
  it('rejects staleMultiplier below lateMultiplier', () => {
    expect(opsShape.safeParse({ ...base, grading: { lateMultiplier: 3, staleMultiplier: 2 } }).success).toBe(false);
  });
});
