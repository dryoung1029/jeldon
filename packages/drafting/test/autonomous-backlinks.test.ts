import { defaultDraftingConfig, defaultScoringConfig } from '@jeldon/config';
import { NullVerifier, type DigestDocument, type ResearchDigestSource } from '@jeldon/verify';
import { describe, expect, it } from 'vitest';
import {
  applyBacklinks,
  findAnchor,
  markAutonomousDraft,
  proposeBacklinks,
  runAutonomousDrafts,
  scoreDigestRelevance,
} from '../src/index.js';
import { defaultDraftFrontmatterCodec } from '../src/frontmatter.js';
import { buildPromptPack } from '../src/prompts.js';
import type { DraftingPack, LlmProvider, LlmRequest, LlmResponse } from '../src/types.js';

function makePack(drafting: DraftingPack['drafting'] = defaultDraftingConfig): DraftingPack {
  return {
    brand: { name: 'Acme Co', siteUrl: 'https://acme.example' },
    authors: [{ slug: 'a', name: 'A', schemaId: 'https://acme.example/#a', profile: { name: 'A' } }],
    voice: {
      persona: 'Plain engineer.',
      bannedTopics: [],
      bannedPhrasings: [],
      rules: [],
      voiceAnchorUrls: [],
      readingGradeBand: [6, 9],
    },
    content: { categories: ['guide'], categoryTargets: { guide: 80 }, defaultAuthorSlug: 'a', timezone: 'UTC' },
    scoring: defaultScoringConfig,
    citation: { policy: 'direct-source-urls', forbiddenPatterns: [], referenceFormat: 'x', verifier: { kind: 'none' } },
    schema: { orgType: ['Organization'], org: { name: 'Acme Co', url: 'https://acme.example' }, articleTypes: ['Article'] },
    drafting,
  } as DraftingPack;
}

function res(blocks: LlmResponse['blocks'], stopReason = 'tool_use'): LlmResponse {
  return { blocks, model: 'm', stopReason, usage: { input_tokens: 1, output_tokens: 1 } };
}

// ---------------------------------------------------------------------------
// 7c autonomous runner
// ---------------------------------------------------------------------------

function draftMarkdown(slug: string, draftLine = 'draft: false'): string {
  return [
    '---',
    `title: "A widget study ${slug}"`,
    'excerpt: "x"',
    'publishDate: 2020-01-01',
    'category: guide',
    'tags: ["a", "b", "c"]',
    draftLine,
    '---',
    '',
    '## What did it find?',
    'Body.',
  ].join('\n');
}

function draftingProvider(calls: LlmRequest[]): LlmProvider {
  let n = 0;
  return {
    async complete(req) {
      calls.push(req);
      if (req.toolName === 'extract_claims') {
        return res([{ type: 'tool_use', name: 'extract_claims', input: { claims: [] } }]);
      }
      n++;
      const slug = `study-${n}`;
      return res([{ type: 'tool_use', name: 'create_draft', input: { slug, content: draftMarkdown(slug), summary: 's' } }]);
    },
    async stream() {
      throw new Error('unused');
    },
  };
}

function digest(docs: DigestDocument[], extra: Partial<{ truncated: boolean }> = {}): ResearchDigestSource {
  return {
    kind: 'test',
    async fetchDigest() {
      return { status: 'ok', documents: docs, total: docs.length, truncated: extra.truncated ?? false };
    },
  };
}

const doc = (id: string, title: string, evidenceLevel: number | null = null): DigestDocument => ({
  id,
  title,
  identifiers: { ID: id },
  evidenceLevel,
});

function autonomousPack(maxDraftsPerRun = 2) {
  return makePack({
    ...defaultDraftingConfig,
    autonomous: {
      source: 'test',
      maxDraftsPerRun,
      digestDays: 7,
      relevance: { topics: ['widget'], requireTopic: true, requirePriorityKeyword: true },
      coverageTitleChars: 40,
    },
  });
}

function memStore(existing: string[] = []) {
  const saved: Array<{ slug: string; content: string; sha: string | null }> = [];
  return {
    saved,
    store: {
      async listArticles() {
        return existing.map((slug) => ({ slug, path: `${slug}.md`, sha: 's' }));
      },
      async saveArticle(slug: string, content: string, sha: string | null) {
        saved.push({ slug, content, sha });
        return { sha: 'new' };
      },
    },
  };
}

function draftDeps(pack: DraftingPack, calls: LlmRequest[]) {
  return {
    provider: draftingProvider(calls),
    pack,
    prompts: buildPromptPack(pack),
    knowledge: 'KB',
    verifier: new NullVerifier(),
    codec: defaultDraftFrontmatterCodec,
    today: '2026-11-17',
  };
}

describe('runAutonomousDrafts', () => {
  it('is not_configured without drafting.autonomous (never an empty "ran")', async () => {
    const { store } = memStore();
    const r = await runAutonomousDrafts({ draft: draftDeps(makePack(), []), source: digest([]), store });
    expect(r.status).toBe('not_configured');
  });

  it('caps drafts per run, sorts strongest evidence first, reports leftovers as a notice', async () => {
    const pack = autonomousPack(2);
    const calls: LlmRequest[] = [];
    const { store, saved } = memStore();
    const r = await runAutonomousDrafts({
      draft: draftDeps(pack, calls),
      source: digest([
        doc('1', 'Widget torque outcomes', 4),
        doc('2', 'Widget torque in the field', 1),
        doc('3', 'Widget torque meta-analysis', 2),
        doc('4', 'Unrelated gardening paper', 1),
      ]),
      store,
      priorityKeywords: async () => ['torque'],
    });
    expect(r.status).toBe('ran');
    if (r.status !== 'ran') return;
    expect(r.qualifying).toBe(3);
    expect(r.drafted.map((d) => d.documentId)).toEqual(['2', '3']);
    expect(r.leftover).toBe(1);
    expect(r.notices.some((n) => n.includes('1 qualifying document(s) not drafted'))).toBe(true);
    expect(saved).toHaveLength(2);
    // Runs through the existing draft() loop (create_draft, then the
    // score -> verify -> fix-pass), one prompt per drafted document.
    const prompts = calls
      .filter((c) => c.toolName === 'create_draft')
      .map((c) => String(c.messages[0]!.content))
      .filter((m) => m.startsWith('Draft a short'));
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain('Widget torque in the field');
    expect(prompts[0]).toContain('ID: 2');
  });

  it('writes autonomous: true and never publishes, even when the model wrote draft: false', async () => {
    const pack = autonomousPack(1);
    const { store, saved } = memStore();
    await runAutonomousDrafts({
      draft: draftDeps(pack, []),
      source: digest([doc('1', 'Widget torque study')]),
      store,
      priorityKeywords: async () => ['torque'],
    });
    expect(saved).toHaveLength(1);
    const fm = saved[0]!.content.split('\n---')[0]!;
    expect(fm).toMatch(/^draft: true$/m);
    expect(fm).toMatch(/^autonomous: true$/m);
    expect(saved[0]!.content).not.toMatch(/^draft: false$/m);
  });

  it('refuses to overwrite an existing slug', async () => {
    const pack = autonomousPack(1);
    const { store, saved } = memStore(['study-1']);
    const r = await runAutonomousDrafts({
      draft: draftDeps(pack, []),
      source: digest([doc('1', 'Widget torque study')]),
      store,
      priorityKeywords: async () => ['torque'],
    });
    expect(saved).toHaveLength(0);
    expect(r.status === 'ran' && r.failed[0]?.error).toMatch(/already exists/);
  });

  it('requires both a topic and a priority-keyword hit, word-bounded; warns when keywords are missing', async () => {
    const rel = { topics: ['widget'], requireTopic: true, requirePriorityKeyword: true };
    expect(scoreDigestRelevance(doc('1', 'Widgets and torque'), rel, ['torque']).qualifies).toBe(false);
    expect(scoreDigestRelevance(doc('1', 'Widget torque'), rel, ['torque']).qualifies).toBe(true);
    expect(scoreDigestRelevance(doc('1', 'Widget torques'), rel, ['torque']).qualifies).toBe(false);

    const pack = autonomousPack(2);
    const { store } = memStore();
    const r = await runAutonomousDrafts({ draft: draftDeps(pack, []), source: digest([doc('1', 'Widget torque')]), store });
    expect(r.status === 'ran' && r.warnings.join(' ')).toMatch(/No priority keywords/);
    expect(r.status === 'ran' && r.drafted).toEqual([]);
  });

  it('skips documents the catalog already covers and surfaces upstream truncation', async () => {
    const pack = autonomousPack(2);
    const { store, saved } = memStore();
    const r = await runAutonomousDrafts({
      draft: draftDeps(pack, []),
      source: digest([doc('1', 'Widget torque study')], { truncated: true }),
      store,
      priorityKeywords: async () => ['torque'],
      coverageText: async () => 'we already wrote about WIDGET TORQUE STUDY results',
    });
    expect(saved).toHaveLength(0);
    expect(r.status === 'ran' && r.warnings.join(' ')).toMatch(/truncated/);
  });

  it('passes a source error through as source_error, not as zero candidates', async () => {
    const { store } = memStore();
    const r = await runAutonomousDrafts({
      draft: draftDeps(autonomousPack(), []),
      source: { kind: 'x', fetchDigest: async () => ({ status: 'error', reason: 'boom' }) },
      store,
    });
    expect(r).toEqual({ status: 'source_error', reason: 'boom' });
  });

  it('markAutonomousDraft inserts draft: true when absent and refuses content without frontmatter', () => {
    const out = markAutonomousDraft('---\ntitle: x\n---\nbody')!;
    expect(out).toBe('---\ntitle: x\ndraft: true\nautonomous: true\n---\nbody');
    expect(markAutonomousDraft('no frontmatter')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7d backlinks
// ---------------------------------------------------------------------------

const article = (slug: string, body: string, extraFm = '') => ({
  slug,
  sha: `sha-${slug}`,
  content: `---\ntitle: "${slug} title"\ndraft: false${extraFm}\n---\n${body}`,
});

describe('findAnchor', () => {
  it('matches across curly quotes / dashes / NBSP but returns the original substring', () => {
    const body = 'He said “widgets don’t rust” — mostly.';
    const m = findAnchor(body, '"widgets don\'t rust" - mostly');
    expect(m.count).toBe(1);
    expect(m.matched).toBe('“widgets don’t rust” — mostly');
    expect(body.slice(m.index, m.index + m.matched.length)).toBe(m.matched);
  });

  it('flags ambiguity, including a straight and a curly copy of the same phrase', () => {
    expect(findAnchor('rust free and rust free', 'rust free').count).toBe(2);
    expect(findAnchor('don’t rust, and don\'t rust', "don't rust").count).toBe(2);
    expect(findAnchor('nothing here', 'rust').count).toBe(0);
  });
});

describe('proposeBacklinks', () => {
  const target = article('target-guide', 'All about torque.');

  function provider(perChunk: (req: LlmRequest, i: number) => LlmResponse, calls: LlmRequest[] = []): LlmProvider {
    let i = 0;
    return {
      async complete(req) {
        calls.push(req);
        return perChunk(req, i++);
      },
      async stream() {
        throw new Error('unused');
      },
    };
  }

  it('chunks candidates by the configured size (default 8)', async () => {
    const articles = Array.from({ length: 19 }, (_, i) => article(`c${i}`, 'mentions torque once'));
    const calls: LlmRequest[] = [];
    const r = await proposeBacklinks(
      { target, articles },
      { pack: makePack(), provider: provider(() => res([{ type: 'tool_use', name: 'propose_backlinks', input: { proposals: [] } }]), calls) },
    );
    expect(r.status === 'ok' && r.batches).toBe(3);
    expect(calls).toHaveLength(3);
    expect(calls[0]!.toolName).toBe('propose_backlinks');
    expect(calls[0]!.effort).toBe('medium');

    const calls4: LlmRequest[] = [];
    await proposeBacklinks(
      { target, articles },
      {
        pack: makePack({ ...defaultDraftingConfig, backlinks: { chunkSize: 4, internalPathPrefix: '/articles/', maxTokens: 8000, minAnchorChars: 2 } }),
        provider: provider(() => res([{ type: 'tool_use', name: 'propose_backlinks', input: { proposals: [] } }]), calls4),
      },
    );
    expect(calls4).toHaveLength(5);
  });

  it('drops truncation debris with a count instead of rejecting it as an unknown slug', async () => {
    const articles = [article('c1', 'Tighten to the “right torque” every time.')];
    const r = await proposeBacklinks(
      { target, articles },
      {
        pack: makePack(),
        provider: provider(() =>
          res(
            [
              {
                type: 'tool_use',
                name: 'propose_backlinks',
                input: {
                  proposals: [
                    { fromSlug: 'c1', anchorText: '"right torque"', surroundingContext: 'ctx', rationale: 'r' },
                    { fromSlug: 'c1' },
                    {},
                  ],
                },
              },
            ],
            'max_tokens',
          ),
        ),
      },
    );
    if (r.status !== 'ok') throw new Error('expected ok');
    expect(r.droppedMalformed).toBe(2);
    expect(r.rejected).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/2 malformed proposal\(s\) dropped/);
    expect(r.warnings.join(' ')).toMatch(/truncated/);
    expect(r.proposals[0]!.anchorText).toBe('“right torque”');
  });

  it('rejects ambiguous anchors and skips candidates that already link to the target', async () => {
    const articles = [
      article('c1', 'torque here and torque there'),
      article('c2', 'see [it](/articles/target-guide) for torque'),
      article('c3', 'links to [other](/articles/target-guide-2) about torque'),
    ];
    const calls: LlmRequest[] = [];
    const r = await proposeBacklinks(
      { target, articles },
      {
        pack: makePack(),
        provider: provider(
          () =>
            res([
              {
                type: 'tool_use',
                name: 'propose_backlinks',
                input: { proposals: [{ fromSlug: 'c1', anchorText: 'torque', surroundingContext: '', rationale: '' }] },
              },
            ]),
          calls,
        ),
      },
    );
    if (r.status !== 'ok') throw new Error('expected ok');
    expect(r.candidatesScanned).toBe(2); // c2 already links; c3 links to a different slug
    expect(r.rejected[0]!.reason).toMatch(/ambiguous/);
    expect(String(calls[0]!.messages[0]!.content)).toContain('slug="c3"');
  });

  it('refuses a draft target', async () => {
    const r = await proposeBacklinks(
      { target: { slug: 't', content: '---\ntitle: t\ndraft: true\n---\nx' }, articles: [] },
      { pack: makePack(), provider: provider(() => res([])) },
    );
    expect(r.status).toBe('target_not_live');
  });

  it('counts a failed chunk as unscanned instead of reading as "no proposals"', async () => {
    const articles = Array.from({ length: 9 }, (_, i) => article(`c${i}`, 'torque'));
    const r = await proposeBacklinks(
      { target, articles },
      {
        pack: makePack(),
        provider: {
          async complete(req) {
            if (String(req.messages[0]!.content).includes('slug="c8"')) throw new Error('529 overloaded');
            return res([{ type: 'tool_use', name: 'propose_backlinks', input: { proposals: [] } }]);
          },
          async stream() {
            throw new Error('unused');
          },
        },
      },
    );
    expect(r.status === 'ok' && r.unscanned).toBe(1);
  });
});

describe('applyBacklinks', () => {
  it('wraps the exact anchor, keeps frontmatter bytes, and re-checks uniqueness', () => {
    const content = '---\ntitle: "x"\nfoo: [1, 2]\n---\nUse the “right torque” here.';
    const ok = applyBacklinks(content, ['“right torque”'], 'target-guide');
    expect(ok).toEqual({
      status: 'ok',
      content: '---\ntitle: "x"\nfoo: [1, 2]\n---\nUse the [“right torque”](/articles/target-guide) here.',
    });
    const amb = applyBacklinks('---\nt: x\n---\ntorque and torque', ['torque'], 't');
    expect(amb.status === 'conflict' && amb.reason).toBe('ambiguous');
    const gone = applyBacklinks('---\nt: x\n---\nnothing', ['torque'], 't');
    expect(gone.status === 'conflict' && gone.reason).toBe('missing');
  });
});
