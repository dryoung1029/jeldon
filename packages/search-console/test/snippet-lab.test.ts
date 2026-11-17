import { describe, expect, it } from 'vitest';
import { defaultSearchConsoleConfig, defaultSeoConfig } from '@jeldon/config';
import type { Store } from '@jeldon/store';
import { applySnippetChange, compareSince, recordSnippetChange, readSnippetLog, validateSnippet } from '../src/index.js';

const lab = defaultSearchConsoleConfig.snippetLab!;
const EXCERPT = 'A'.repeat(120);

type Fake = Pick<Store, 'getArticle' | 'saveArticle' | 'getDataFile' | 'saveDataFile'> & {
  articles: Map<string, { content: string; sha: string }>;
  data: Map<string, { content: string; sha: string }>;
  failArticleOnce?: string;
  failDataOnce?: string;
  failDataAlways?: string;
};

function fakeStore(): Fake {
  let n = 0;
  const s: Fake = {
    articles: new Map(),
    data: new Map(),
    async getArticle(slug) {
      const f = s.articles.get(slug);
      if (!f) throw new Error('not found');
      return { slug, path: `${slug}.md`, ...f };
    },
    async saveArticle(slug, content) {
      if (s.failArticleOnce) {
        const m = s.failArticleOnce;
        s.failArticleOnce = undefined;
        throw new Error(m);
      }
      const sha = `a${++n}`;
      s.articles.set(slug, { content, sha });
      return { sha };
    },
    async getDataFile(path) {
      const f = s.data.get(path);
      return f ? { path, ...f } : null;
    },
    async saveDataFile(path, content) {
      if (s.failDataAlways) throw new Error(s.failDataAlways);
      if (s.failDataOnce) {
        const m = s.failDataOnce;
        s.failDataOnce = undefined;
        throw new Error(m);
      }
      const sha = `d${++n}`;
      s.data.set(path, { content, sha });
      return { sha };
    },
  };
  return s;
}

const article = (title: string, excerpt: string) =>
  `---\ntitle: "${title}"\nexcerpt: "${excerpt}"\ntags: ["a", "b"]\naudioUrl: "/x.mp3"\n---\n\nBody text.\n`;

describe('recordSnippetChange', () => {
  it('prepends newest first and caps the log', () => {
    let log = { entries: [] as ReturnType<typeof recordSnippetChange>['log']['entries'] };
    for (let i = 0; i < 205; i++) {
      log = recordSnippetChange(log, { slug: `s${i}`, field: 'title', before: { title: 'a' }, after: { title: 'b' } }, lab).log;
    }
    expect(log.entries).toHaveLength(200);
    expect(log.entries[0]!.slug).toBe('s204');
  });

  it('does not mutate the input log', () => {
    const entries = [] as never[];
    recordSnippetChange(entries, { slug: 's', field: 'title', before: {}, after: {} }, lab);
    expect(entries).toHaveLength(0);
  });

  it('stores a malformed baseline as null, never as zeros', () => {
    const { entry } = recordSnippetChange([], { slug: 's', field: 'title', before: {}, after: {}, scAtChange: { clicks: 'abc', impressions: 10, ctr: 0.1, position: 3 } }, lab);
    expect(entry.baseline).toBeNull();
    const ok = recordSnippetChange([], { slug: 's', field: 'title', before: {}, after: {}, scAtChange: { clicks: '4', impressions: 10, ctr: 0.1, position: 3, dateRange: { start: '2026-10-01', end: '2026-10-28' } } }, lab);
    expect(ok.entry.baseline).toEqual({ clicks: 4, impressions: 10, ctr: 0.1, position: 3, dateRange: { start: '2026-10-01', end: '2026-10-28' } });
  });
});

describe('compareSince', () => {
  const entry = recordSnippetChange([], {
    slug: 'my-post', field: 'title', before: {}, after: {}, changedAt: '2026-10-10T00:00:00Z',
    scAtChange: { clicks: 2, impressions: 500, ctr: 0.004, position: 4 },
  }, lab).entry;

  it('matches the page by last path segment and diffs', () => {
    const r = compareSince(entry, [{ page: 'https://example.com/articles/my-post/', clicks: 15, impressions: 480, ctr: 0.031, position: 3.6 }], { currentRange: { start: '2026-10-11' } });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.delta.clicks).toBe(13);
    expect(r.delta.ctr).toBeCloseTo(0.027);
    expect(r.windowIncludesPreChange).toBe(false);
  });

  it('flags a window that still includes pre-change days', () => {
    const r = compareSince(entry, [{ keys: ['/articles/my-post'], clicks: 1, impressions: 1, ctr: 1, position: 1 }], { currentRange: { start: '2026-09-20' } });
    expect(r.status === 'ok' && r.windowIncludesPreChange).toBe(true);
  });

  it('is explicit when there is nothing to compare', () => {
    expect(compareSince(entry, []).status).toBe('no_current_data');
    expect(compareSince(entry, [{ page: '/articles/my-post-2/', clicks: 1, impressions: 1, ctr: 1, position: 1 }]).status).toBe('no_current_data');
    expect(compareSince({ ...entry, baseline: null }, []).status).toBe('no_baseline');
  });
});

describe('validateSnippet', () => {
  it('takes limits from scoring.seo', () => {
    expect(validateSnippet('T', EXCERPT, defaultSeoConfig)).toEqual([]);
    expect(validateSnippet('x'.repeat(71), EXCERPT, defaultSeoConfig)[0]).toMatch(/1–70/);
    expect(validateSnippet('T', 'short', defaultSeoConfig)[0]).toMatch(/80–200/);
    const tight = { ...defaultSeoConfig, title: { ...defaultSeoConfig.title, mehMax: 10 } };
    expect(validateSnippet('x'.repeat(11), EXCERPT, tight)).toHaveLength(1);
  });
});

describe('applySnippetChange', () => {
  const base = { seo: defaultSeoConfig, snippetLab: lab, now: new Date('2026-11-01T00:00:00Z') };

  it('rewrites only title/excerpt and logs the baseline', async () => {
    const s = fakeStore();
    s.articles.set('p', { content: article('Old title', EXCERPT), sha: 'a0' });
    const r = await applySnippetChange(s, { ...base, slug: 'p', title: '  New   "quoted" title ', excerpt: EXCERPT, scAtChange: { clicks: 1, impressions: 100, ctr: 0.01, position: 3 } });
    expect(r).toMatchObject({ ok: true, logged: true });
    const saved = s.articles.get('p')!.content;
    expect(saved).toContain('title: "New \\"quoted\\" title"');
    expect(saved).toContain('audioUrl: "/x.mp3"');
    expect(saved).toContain('tags: ["a", "b"]');
    expect(saved.endsWith('Body text.\n')).toBe(true);
    const log = JSON.parse(s.data.get(lab.logPath)!.content);
    expect(log.entries[0]).toMatchObject({ slug: 'p', field: 'title', before: { title: 'Old title' }, baseline: { clicks: 1 } });
  });

  it('rejects out-of-limit input and no-op edits', async () => {
    const s = fakeStore();
    s.articles.set('p', { content: article('Same', EXCERPT), sha: 'a0' });
    expect(await applySnippetChange(s, { ...base, slug: 'p', title: '', excerpt: EXCERPT })).toMatchObject({ ok: false, status: 400 });
    expect(await applySnippetChange(s, { ...base, slug: 'p', title: 'Same', excerpt: EXCERPT })).toMatchObject({ ok: false, error: 'Nothing changed.' });
  });

  it('refuses an article with no frontmatter block (409)', async () => {
    const s = fakeStore();
    s.articles.set('p', { content: 'no fm', sha: 'a0' });
    expect(await applySnippetChange(s, { ...base, slug: 'p', title: 'New', excerpt: EXCERPT })).toMatchObject({ ok: false, status: 409 });
  });

  it('retries once on a 409 by re-reading and re-applying', async () => {
    const s = fakeStore();
    s.articles.set('p', { content: article('Old', EXCERPT), sha: 'a0' });
    s.failArticleOnce = 'GitHub 409: sha does not match';
    const r = await applySnippetChange(s, { ...base, slug: 'p', title: 'New', excerpt: EXCERPT });
    expect(r.ok).toBe(true);
    expect(s.articles.get('p')!.content).toContain('title: "New"');
  });

  it('blocks the save when the validator reports frontmatter errors', async () => {
    const s = fakeStore();
    s.articles.set('p', { content: article('Old', EXCERPT), sha: 'a0' });
    const r = await applySnippetChange(s, { ...base, slug: 'p', title: 'New', excerpt: EXCERPT, validate: () => ['bad date'] });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(s.articles.get('p')!.content).toContain('Old');
  });

  it('never overwrites an unreadable log (BoH wiped history here)', async () => {
    const s = fakeStore();
    s.articles.set('p', { content: article('Old', EXCERPT), sha: 'a0' });
    s.data.set(lab.logPath, { content: '{corrupt', sha: 'd0' });
    const r = await applySnippetChange(s, { ...base, slug: 'p', title: 'New', excerpt: EXCERPT });
    expect(r).toMatchObject({ ok: true, logged: false });
    expect(s.data.get(lab.logPath)!.content).toBe('{corrupt');
    expect(s.articles.get('p')!.content).toContain('title: "New"');
  });

  it('a failed log write does not undo the saved article', async () => {
    const s = fakeStore();
    s.articles.set('p', { content: article('Old', EXCERPT), sha: 'a0' });
    s.failDataAlways = 'boom';
    const r = await applySnippetChange(s, { ...base, slug: 'p', title: 'New', excerpt: EXCERPT });
    expect(r).toMatchObject({ ok: true, logged: false, logError: 'boom' });
    expect(s.articles.get('p')!.content).toContain('title: "New"');
  });

  it('retries the log write once on conflict', async () => {
    const s = fakeStore();
    s.articles.set('p', { content: article('Old', EXCERPT), sha: 'a0' });
    s.failDataOnce = '409 conflict';
    expect(await applySnippetChange(s, { ...base, slug: 'p', title: 'New', excerpt: EXCERPT })).toMatchObject({ logged: true });
  });
});

describe('readSnippetLog', () => {
  it('distinguishes absent from unreadable', async () => {
    const s = fakeStore();
    expect((await readSnippetLog(s, 'x.json')).status).toBe('absent');
    s.data.set('x.json', { content: '{"nope":1}', sha: 'd' });
    expect((await readSnippetLog(s, 'x.json')).status).toBe('unreadable');
  });
});
