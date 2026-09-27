import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultScoringConfig, type DomainPack } from '@jeldon/config';
import { formatScorecard, scoreDocument } from '../src/score.js';
import { loadRegisteredChecks, runRegisteredChecks } from '../src/check-registry.js';

const pack = {
  brand: { name: 'Acme', siteUrl: 'https://acme.test' },
  content: { categories: ['evidence'], categoryTargets: { evidence: 85 }, defaultAuthorSlug: 'a', timezone: 'UTC' },
  scoring: defaultScoringConfig,
} as unknown as DomainPack;

const doc = `---
title: When should you actually image low back pain?
excerpt: Imaging early rarely changes the plan for uncomplicated low back pain — here is when it does.
category: evidence
tags: [back-pain, imaging, evidence]
draft: true
---
When I see a new patient with low back pain, the first question is rarely "do we image?"

## Why does imaging early usually not help?

According to Chou et al (2007), routine imaging does not improve outcomes; 90% of adults over 50 show degenerative changes.

## References

Chou et al, 2007. [PubMed](https://pubmed.ncbi.nlm.nih.gov/17909209/)
`;

describe('jeldon score', () => {
  it('scores one file with the engine scorer and reports the category target', () => {
    const r = scoreDocument(doc, '/x/when-to-image.md', pack);
    expect(r.slug).toBe('when-to-image');
    expect(r.category).toBe('evidence');
    expect(r.target).toBe(85);
    expect(r.geo.score).toBeGreaterThan(0);
    expect(r.seo.score).toBeGreaterThan(0);
    expect(r.grade).not.toBeNull();
    expect(r.draft).toBe(true);
  });

  it('renders a plain-words scorecard', () => {
    const card = formatScorecard(scoreDocument(doc, '/x/when-to-image.md', pack));
    expect(card).toMatch(/AI-citation readiness:\s+\d+\/100, target 85/);
    expect(card).toMatch(/Search readiness:\s+\d+\/100/);
    expect(card).toContain('(draft)');
  });
});

describe('doctor check registry (jeldon.checks.mjs)', () => {
  it('loads and runs project checks, trapping throws as errors', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jeldon-checks-'));
    writeFileSync(
      join(dir, 'jeldon.checks.mjs'),
      `export default [
        { id: 'kit:hours', run: () => ({ status: 'warn', message: 'hours not confirmed' }) },
        { id: 'kit:multi', run: async ({ pack }) => [{ status: 'ok', message: 'brand ' + pack.brand.name }] },
        { id: 'kit:boom', run: () => { throw new Error('kaput'); } },
      ];`,
    );
    const checks = await loadRegisteredChecks(dir);
    expect(checks.map((c) => c.id)).toEqual(['kit:hours', 'kit:multi', 'kit:boom']);
    const results = await runRegisteredChecks(checks, { cwd: dir, pack, pre: false });
    expect(results).toEqual([
      { status: 'warn', message: 'kit:hours: hours not confirmed' },
      { status: 'ok', message: 'kit:multi: brand Acme' },
      { status: 'error', message: 'kit:boom: check threw — kaput' },
    ]);
  });

  it('returns [] when no checks file exists', async () => {
    expect(await loadRegisteredChecks(mkdtempSync(join(tmpdir(), 'jeldon-nochecks-')))).toEqual([]);
  });
});
