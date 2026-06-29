import { defaultDraftingConfig, defaultScoringConfig } from '@jeldon/config';
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
