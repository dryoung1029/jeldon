import { describe, expect, it } from 'vitest';
import {
  autonomousDraftAttention,
  buildAttention,
  cadenceAttention,
  lastNewsletterSent,
  lastPublishedArticle,
  missingHeroAttention,
  pipelineAttention,
  pipelineStatus,
  readFailureAttention,
  stuckNewsletterAttention,
  unattestable,
  type AttentionItem,
  type OpsArticle,
} from '../src/index.js';

const NOW = Date.parse('2026-11-17T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe('buildAttention', () => {
  const info: AttentionItem = { severity: 'info', kind: 'x', text: 'i' };
  const warn1: AttentionItem = { severity: 'warn', kind: 'x', text: 'w1' };
  const warn2: AttentionItem = { severity: 'warn', kind: 'x', text: 'w2' };
  const bad: AttentionItem = { severity: 'bad', kind: 'x', text: 'b' };

  it('ranks bad → warn → info, stable within a severity', () => {
    const out = buildAttention([[info, warn1], () => [bad], { name: 'n', produce: () => [warn2] }]);
    expect(out.map((i) => i.text)).toEqual(['b', 'w1', 'w2', 'i']);
  });
  it('a throwing producer becomes a bad item, not silence', () => {
    const out = buildAttention([{ name: 'leads', produce: () => { throw new Error('boom'); } }, [info]]);
    expect(out[0]).toMatchObject({ severity: 'bad', kind: 'producer-error' });
    expect(out[0]!.text).toMatch(/leads.*boom.*incomplete/);
    expect(out[1]).toBe(info);
  });
  it('empty input is an empty list', () => {
    expect(buildAttention([])).toEqual([]);
  });
});

describe('pipelineAttention', () => {
  const g = (d: number | null, cadenceDays = 1) => pipelineStatus({ name: 'P', cadenceDays, lastUpdated: d === null ? null : daysAgo(d) }, NOW);
  it('stale and never are bad, late is warn, ok is silent', () => {
    const out = pipelineAttention([g(0), g(2), g(5), g(null)].map((p) => ({ ...p, source: 'fetch.yml' })), { link: { href: '/admin/fresh', label: 'Freshness' } });
    expect(out.map((i) => i.severity)).toEqual(['warn', 'bad', 'bad']);
    expect(out[2]!.text).toMatch(/never written — fetch\.yml/);
    expect(out[0]).toMatchObject({ href: '/admin/fresh', linkLabel: 'Freshness' });
  });
  it('unattestable is surfaced with its reason', () => {
    const p = pipelineStatus({ name: 'Hours', cadenceDays: 45, lastUpdated: daysAgo(1), changeGated: { checkedAt: null, checkCadenceDays: 1 } }, NOW);
    const out = pipelineAttention([p]);
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe('warn');
    expect(out[0]!.text).toMatch(/cannot be proven.*no checkedAt/);
  });
  it('a stale change-gated check says the step stopped', () => {
    const p = pipelineStatus({ name: 'Hours', cadenceDays: 45, lastUpdated: daysAgo(1), changeGated: { checkedAt: daysAgo(5), checkCadenceDays: 1 } }, NOW);
    expect(pipelineAttention([p])[0]!.text).toMatch(/last successful check 5 days ago.*stopped/);
  });
});

describe('article producers', () => {
  const articles: OpsArticle[] = [
    { slug: 'live-1', title: 'Live 1', heroImage: '/h.jpg', publishDate: '2026-11-01' },
    { slug: 'live-2', title: 'Live 2', heroImage: null, publishDate: '2026-10-01' },
    { slug: 'draft-1', title: 'Draft 1', draft: true, heroImage: null },
    { slug: 'auto-1', title: 'Auto 1', draft: true, autonomous: true },
    { slug: 'auto-live', title: 'Auto live', autonomous: true, heroImage: '/x.jpg', publishDate: '2026-11-20' },
  ];
  it('missing hero counts LIVE articles only (drafts excluded)', () => {
    const out = missingHeroAttention(articles);
    expect(out).toHaveLength(1);
    expect(out[0]!.text).toBe('1 live article has no hero image: live-2');
  });
  it('autonomous drafts awaiting review, published autonomous excluded', () => {
    const out = autonomousDraftAttention(articles, { link: (items) => (items.length === 1 ? { href: `/admin/${items[0]!.slug}`, label: 'Review' } : undefined) });
    expect(out[0]!.text).toBe('1 autonomous draft waiting for review: Auto 1');
    expect(out[0]!.href).toBe('/admin/auto-1');
  });
  it('stuck newsletters: queued past N days, or queued with no slot; errors are bad', () => {
    const nl: OpsArticle[] = [
      { slug: 'a', newsletterStatus: 'queued', newsletterScheduledAt: daysAgo(1) },
      { slug: 'b', newsletterStatus: 'queued', newsletterScheduledAt: daysAgo(3) },
      { slug: 'c', newsletterStatus: 'queued', newsletterScheduledAt: null },
      { slug: 'd', newsletterStatus: 'error' },
      { slug: 'e', newsletterStatus: 'sent', newsletterScheduledAt: daysAgo(30) },
    ];
    const out = stuckNewsletterAttention(nl, { now: NOW });
    expect(out.map((i) => i.severity)).toEqual(['warn', 'bad']);
    expect(out[0]!.text).toMatch(/^2 newsletters still read "queued" \(oldest slot 2026-11-14\)/);
    expect(out[1]!.text).toBe('1 newsletter errored: d.');
    expect(stuckNewsletterAttention(nl, { now: NOW, stuckAfterDays: 5 })[0]!.text).toMatch(/^1 newsletter still/);
  });
  it('read failures are surfaced', () => {
    expect(readFailureAttention([{ slug: 'x', error: '502' }])[0]!.text).toMatch(/1 article couldn't be read/);
    expect(readFailureAttention([])).toEqual([]);
  });
});

describe('cadence', () => {
  const articles: OpsArticle[] = [
    { slug: 'old', title: 'Old', publishDate: '2026-10-01' },
    { slug: 'future', title: 'Future', publishDate: '2026-12-01' },
    { slug: 'draft', title: 'Draft', draft: true, publishDate: '2026-11-16' },
    { slug: 'nl', title: 'NL', newsletterStatus: 'sent', newsletterScheduledAt: '2026-11-10T15:00:00Z' },
    { slug: 'nl-q', title: 'NLQ', newsletterStatus: 'queued', newsletterScheduledAt: '2026-11-16T15:00:00Z' },
  ];
  it('last published ignores drafts and future dates', () => {
    expect(lastPublishedArticle(articles, '2026-11-17')).toEqual({ slug: 'old', title: 'Old', date: '2026-10-01' });
    expect(lastNewsletterSent(articles)).toEqual({ slug: 'nl', title: 'NL', date: '2026-11-10' });
  });
  it('alerts when the article gap exceeds articleDays; N comes from config', () => {
    const lp = lastPublishedArticle(articles, '2026-11-17');
    const out = cadenceAttention({ cadence: { articleDays: 14 }, lastPublished: lp, now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0]!.text).toBe('No article published in 47 days (target: every 14). Last: "Old" on 2026-10-01.');
    expect(cadenceAttention({ cadence: { articleDays: 60 }, lastPublished: lp, now: NOW })).toEqual([]);
  });
  it('no newsletter alert unless newsletterDays is configured', () => {
    const out = cadenceAttention({ cadence: { articleDays: 365 }, lastPublished: lastPublishedArticle(articles, '2026-11-17'), lastNewsletter: null, now: NOW });
    expect(out).toEqual([]);
  });
  it('newsletter cadence alerts and the "none yet" case', () => {
    const lp = lastPublishedArticle(articles, '2026-11-17');
    const late = cadenceAttention({ cadence: { articleDays: 365, newsletterDays: 5 }, lastPublished: lp, lastNewsletter: lastNewsletterSent(articles), now: NOW });
    expect(late[0]!.text).toBe('No newsletter sent in 7 days (target: every 5). Last: "NL" on 2026-11-10.');
    const none = cadenceAttention({ cadence: { articleDays: 365, newsletterDays: 5 }, lastPublished: lp, lastNewsletter: null, now: NOW });
    expect(none[0]!.text).toBe('No newsletter is recorded as sent yet.');
  });
  it('unknown history is unattestable, not "nothing published"', () => {
    const out = cadenceAttention({ cadence: { articleDays: 14, newsletterDays: 14 }, lastPublished: unattestable('article listing failed'), now: NOW });
    expect(out[0]!.text).toBe('Cannot tell when the last article was published: article listing failed.');
    expect(out[1]!.text).toMatch(/no newsletter history was supplied/);
  });
  it('no live article yet', () => {
    expect(cadenceAttention({ cadence: { articleDays: 14 }, lastPublished: null, now: NOW })[0]!.text).toBe('No live article has a publish date yet.');
  });
});
