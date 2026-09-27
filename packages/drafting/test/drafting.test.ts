import { defaultDraftingConfig, defaultScoringConfig } from '@jeldon/config';
import type { ConceptProposer, ImageGen, ObjectStore } from '@jeldon/media';
import { NullVerifier } from '@jeldon/verify';
import { describe, expect, it } from 'vitest';
import { chatEdit } from '../src/chat.js';
import { draft } from '../src/draft.js';
import { defaultDraftFrontmatterCodec } from '../src/frontmatter.js';
import { buildPromptPack } from '../src/prompts.js';
import { getSiteKnowledge } from '../src/site-knowledge.js';
import type {
  DraftingPack,
  KnowledgeProviders,
  LlmProvider,
  LlmRequest,
  LlmResponse,
  StreamTurn,
} from '../src/types.js';

// A minimal pack factory. Two distinct "domains" prove the engine reads every
// brand/voice/category literal from `pack`, not from code.
function makePack(over: Partial<DraftingPack> = {}): DraftingPack {
  return {
    brand: { name: 'Acme Co', siteUrl: 'https://acme.example', tagline: 'we make widgets' },
    authors: [
      {
        slug: 'a',
        name: 'A. Author',
        schemaId: 'https://acme.example/#a',
        profile: { name: 'A. Author' },
      },
    ],
    voice: {
      persona: 'Plain, direct, first-person engineer.',
      bannedTopics: ['astrology'],
      bannedPhrasings: ['synergy'],
      rules: ['Never bury the lede.'],
      voiceAnchorUrls: ['/articles/anchor-one'],
      readingGradeBand: [6, 9],
    },
    content: {
      categories: ['guide', 'evidence'],
      categoryTargets: { guide: 85, evidence: 90 },
      defaultAuthorSlug: 'a',
      timezone: 'UTC',
    },
    scoring: defaultScoringConfig,
    citation: {
      policy: 'direct-source-urls',
      forbiddenPatterns: [],
      referenceFormat: 'Author, year. [link](URL)',
      verifier: { kind: 'none' },
    },
    schema: { orgType: ['Organization'], org: { name: 'Acme Co', url: 'https://acme.example' }, articleTypes: ['Article'] },
    drafting: defaultDraftingConfig,
    ...over,
  } as DraftingPack;
}

/** A fake provider that records the system prompt it received and replays a
 *  canned create_draft tool call. */
function fakeProvider(captured: { system?: string } = {}): LlmProvider {
  return {
    async complete(req: LlmRequest): Promise<LlmResponse> {
      captured.system = req.system;
      // Claim-extraction call (utility model, extract_claims tool) → no claims.
      if (req.tools?.some((t) => t.name === 'extract_claims')) {
        return {
          blocks: [{ type: 'tool_use', name: 'extract_claims', input: { claims: [] } }],
          model: req.model,
          stopReason: 'tool_use',
          usage: { input_tokens: 1, output_tokens: 1 },
        };
      }
      const content = [
        '---',
        'title: "A solid guide to widgets that is long enough"',
        'excerpt: "A practical, first-person walkthrough of widget selection for working engineers who want a clear answer."',
        'publishDate: 2020-01-01',
        'category: guide',
        'readTime: "6 MIN"',
        'tags: ["widgets", "guide", "engineering"]',
        'draft: true',
        '---',
        '',
        '## What is a widget?',
        'When I build systems I reach for widgets. According to the 2019 review, 80% of teams use them.',
        '',
        '[ref](/articles/anchor-one)',
      ].join('\n');
      return {
        blocks: [{ type: 'tool_use', name: 'create_draft', input: { slug: 'widgets', content, summary: 'Wrote it.' } }],
        model: req.model,
        stopReason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 20 },
      };
    },
    async stream(): Promise<StreamTurn> {
      return {
        ordered: [
          {
            type: 'tool_use',
            id: 't1',
            name: 'update_article',
            text: '',
            jsonAcc: JSON.stringify({ newContent: '---\ntitle: "x"\n---\nbody', summary: 'edited' }),
          },
        ],
        stopReason: 'tool_use',
        usage: { input_tokens: 3, output_tokens: 4 },
        modelOut: 'fake-model',
      };
    },
  };
}

const emptyProviders: KnowledgeProviders = { listArticles: async () => [] };

describe('@jeldon/drafting prompt externalization', () => {
  it('builds the voice prompt from pack.voice (no hardcoded brand)', () => {
    const p = buildPromptPack(makePack());
    expect(p.voice).toContain('Acme Co');
    expect(p.voice).toContain('Plain, direct, first-person engineer.');
    expect(p.voice).toContain('astrology'); // banned topic
    expect(p.voice).toContain('synergy'); // banned phrasing
    expect(p.voice).toContain('/articles/anchor-one'); // anchor
    expect(p.voice).toContain('guide | evidence'); // categories
    expect(p.voice).not.toContain('Jason'); // no BoH literal leaked
    expect(p.voice).not.toContain('Corvallis');
  });

  it('a different pack changes the prompt without touching engine code', () => {
    const a = buildPromptPack(makePack());
    const b = buildPromptPack(
      makePack({
        brand: { name: 'Northwatch', siteUrl: 'https://nw.example' },
        voice: {
          persona: 'Terse SRE.',
          bannedTopics: [],
          bannedPhrasings: [],
          rules: [],
          voiceAnchorUrls: [],
          readingGradeBand: [8, 12],
        },
        content: { categories: ['runbook'], categoryTargets: { runbook: 80 }, defaultAuthorSlug: 'a', timezone: 'UTC' },
      }),
    );
    expect(a.voice).not.toEqual(b.voice);
    expect(b.voice).toContain('Northwatch');
    expect(b.voice).toContain('Terse SRE.');
    expect(b.voice).toContain('runbook');
  });

  it('drops verify_citation language when no verifier is configured', () => {
    const noVerifier = buildPromptPack(makePack());
    expect(noVerifier.chatSystem).not.toContain('verify_citation tool backed');
    const withVerifier = buildPromptPack(
      makePack({
        citation: {
          policy: 'verifier-required',
          forbiddenPatterns: [],
          referenceFormat: 'x',
          verifier: { kind: 'cite8' },
        },
      }),
    );
    expect(withVerifier.chatSystem).toContain('verify_citation');
  });
});

describe('getSiteKnowledge', () => {
  it('reads articles + rules from pack + providers, degrades on empty', async () => {
    const providers: KnowledgeProviders = {
      listArticles: async () => [
        { slug: 'widgets', title: 'Widgets 101', excerpt: 'all about widgets', category: 'guide', tags: ['w'], draft: false },
      ],
    };
    const k = await getSiteKnowledge(makePack(), providers);
    expect(k).toContain('Acme Co — site knowledge base');
    expect(k).toContain('/articles/widgets');
    expect(k).toContain('Widgets 101');
    expect(k).toContain('Brand voice: Plain, direct');
  });

  it('never throws when a provider rejects', async () => {
    const providers: KnowledgeProviders = {
      listArticles: async () => {
        throw new Error('boom');
      },
    };
    const k = await getSiteKnowledge(makePack(), providers);
    expect(k).toContain('(none yet)');
  });
});

describe('draft() loop', () => {
  it('scores + verifies a generated draft and emits a result event', async () => {
    const captured: { system?: string } = {};
    const provider = fakeProvider(captured);
    const prompts = buildPromptPack(makePack());
    const events: string[] = [];
    let result: Extract<import('../src/types.js').DraftEvent, { type: 'result' }> | undefined;

    for await (const evt of draft(
      { mode: 'draft', messages: [{ role: 'user', content: 'write about widgets' }] },
      {
        provider,
        pack: makePack(),
        prompts,
        knowledge: 'KB',
        verifier: new NullVerifier(),
        codec: defaultDraftFrontmatterCodec,
        today: '2026-06-29',
      },
    )) {
      events.push(evt.type);
      if (evt.type === 'result') result = evt;
    }

    expect(events).toContain('progress');
    expect(events).toContain('result');
    expect(result?.draft?.slug).toBe('widgets');
    // forcePublishDate rewrote the model's 2020 date to today.
    expect(result?.draft?.content).toContain('publishDate: 2026-06-29');
    expect(result?.draft?.content).not.toContain('publishDate: 2020-01-01');
    expect(result?.scores).toBeTruthy();
    // The system prompt the model saw carried the externalized voice + KB.
    expect(captured.system).toContain('Acme Co');
    expect(captured.system).toContain('KB');
  });

  it('writes hero image + alt-text into the draft when hero deps are provided', async () => {
    const prompts = buildPromptPack(makePack());
    const proposer: ConceptProposer = {
      async propose() {
        return {
          topic: 'widget selection',
          concept: 'A felt-marker sketch of three widgets on a workbench.',
          altText: 'Hand-drawn sketch of three widgets on a workbench',
          filename: 'widget-selection.webp',
          rationale: 'Fits the guide.',
        };
      },
    };
    const imageGen: ImageGen = { async generate() { return new ArrayBuffer(8); } };
    const puts: string[] = [];
    const objectStore: ObjectStore = { async get() { return null; }, async put(key) { puts.push(key); } };

    let result: Extract<import('../src/types.js').DraftEvent, { type: 'result' }> | undefined;
    const labels: string[] = [];
    for await (const evt of draft(
      { mode: 'draft', messages: [{ role: 'user', content: 'write about widgets' }] },
      {
        provider: fakeProvider(),
        pack: makePack(),
        prompts,
        knowledge: 'KB',
        verifier: new NullVerifier(),
        codec: defaultDraftFrontmatterCodec,
        today: '2026-06-29',
        hero: { proposer, imageGen, objectStore },
      },
    )) {
      if (evt.type === 'progress') labels.push(evt.label);
      if (evt.type === 'result') result = evt;
    }

    expect(labels).toContain('Generating hero image…');
    expect(result?.draft?.content).toContain('heroImageAlt: "Hand-drawn sketch of three widgets on a workbench"');
    expect(result?.draft?.content).toMatch(/heroImage: "\/img\/widgets\/widgets-hero-[0-9a-f]{6}\.png"/);
    expect(puts).toHaveLength(1);
  });

  it('leaves hero deferred when no hero deps are provided (default)', async () => {
    const prompts = buildPromptPack(makePack());
    let result: Extract<import('../src/types.js').DraftEvent, { type: 'result' }> | undefined;
    for await (const evt of draft(
      { mode: 'draft', messages: [{ role: 'user', content: 'write about widgets' }] },
      {
        provider: fakeProvider(),
        pack: makePack(),
        prompts,
        knowledge: 'KB',
        verifier: new NullVerifier(),
        codec: defaultDraftFrontmatterCodec,
        today: '2026-06-29',
      },
    )) {
      if (evt.type === 'result') result = evt;
    }
    expect(result?.draft?.content).not.toContain('heroImage:');
  });
});

describe('chatEdit() loop', () => {
  it('returns an update_article proposal from a streamed turn', async () => {
    const provider = fakeProvider();
    const prompts = buildPromptPack(makePack());
    let result: Extract<import('../src/types.js').ChatEvent, { type: 'result' }> | undefined;

    for await (const evt of chatEdit(
      { messages: [{ role: 'user', content: 'tighten the lede' }], articleContent: '---\ntitle: "x"\nheroImage: /a.png\n---\nold body' },
      { provider, pack: makePack(), prompts, knowledge: 'KB', verifier: new NullVerifier() },
    )) {
      if (evt.type === 'result') result = evt;
    }

    expect(result?.newContent).toBeTruthy();
    expect(result?.summary).toBe('edited');
  });
});

// ---------------------------------------------------------------------------
// Agent drafting mode — one source of prompt truth for coding agents too.
// ---------------------------------------------------------------------------
import { buildAgentBrief } from '../src/agent-brief.js';
import { buildVoice as _bv, buildGeoPlaybook as _bg } from '../src/prompts.js';

describe('buildAgentBrief (capabilities.drafting: "agent")', () => {
  const pack = {
    brand: { name: 'Helix Training', siteUrl: 'https://helixtrain.com', tagline: 'Training with a plan.' },
    authors: [{ slug: 'kathy-lynch', name: 'Dr. Kathy Lynch, PT, DPT', schemaId: 'x', profile: { name: 'Kathy Lynch' } }],
    voice: { persona: 'A coach on the gym floor.', bannedTopics: ['diagnosing'], bannedPhrasings: ['crush your goals'], rules: ['Use "I" and "we".'], voiceAnchorUrls: [], readingGradeBand: [6, 9] as [number, number] },
    content: { categories: ['guide', 'evidence'], categoryTargets: { guide: 80, evidence: 85 }, tags: ['over-50', 'beginners'], articlePathPrefix: '/blog/', defaultAuthorSlug: 'kathy-lynch', timezone: 'UTC' },
    scoring: {
      geo: { floor: 70, checks: [] },
      seo: {
        title: { good: [40, 60] as [number, number], mehMax: 70 }, excerpt: { good: [120, 160] as [number, number], meh: [80, 200] as [number, number] }, slugMaxLen: 60,
        wordCount: { good: [800, 1800] as [number, number], mehMin: 500 }, bodyChars: { good: 10000, meh: 12000 }, h2: { good: [3, 6] as [number, number], meh: [2, 8] as [number, number] },
        internalLinks: { good: 2, meh: 1 }, tags: { good: [3, 6] as [number, number], mehMin: 1 }, heroAltWords: { good: [4, 18] as [number, number] },
        reading: { good: [6, 9] as [number, number], mehMax: 11 }, internalLinkPrefixes: ['blog', 'programs'], referenceSectionNames: ['references'],
        evidenceTriggers: ['study', 'research'], badFilenameRe: 'x',
      },
    },
    citation: { policy: 'direct-source-urls' as const, forbiddenPatterns: [], referenceFormat: 'Author, year. Note. [link](URL)', verifier: { kind: 'none' as const } },
    schema: { orgType: ['Organization'], org: { name: 'Helix Training', url: 'https://helixtrain.com' }, articleTypes: ['Article'] },
  };

  it('embeds the SAME voice + GEO playbook the API pipeline builds', () => {
    const brief = buildAgentBrief(pack, { topic: 'Is strength training safe after 50?', today: '2026-09-27' });
    expect(brief).toContain(_bv(pack));
    expect(brief).toContain(_bg(pack).trim());
  });

  it('reads every domain value from the pack — no Helix literal in the engine', () => {
    const brief = buildAgentBrief(pack, { today: '2026-09-27' });
    expect(brief).toContain('/blog/<slug>/');
    expect(brief).toContain('`over-50`');
    expect(brief).toContain('authorSlug: kathy-lynch');
    expect(brief).toContain('guide 80+');
    expect(brief).toContain('YOU are the verifier');
    expect(brief).toContain('publishDate: 2026-09-27');
    // Another pack, another brief — with no engine change.
    const other = buildAgentBrief({ ...pack, brand: { ...pack.brand, name: 'Northwatch' }, content: { ...pack.content, articlePathPrefix: undefined, tags: [] } });
    expect(other).toContain('Northwatch');
    expect(other).toContain('/articles/<slug>/');
    expect(other).toContain('Tags are free-form');
  });
});
