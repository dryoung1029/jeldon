import { describe, expect, it } from 'vitest';
import type { ConceptProposer, ImageGen, ObjectStore } from '@jeldon/media';
import {
  generateHeroForDraft,
  heroInputFromMarkdown,
  LlmConceptProposer,
  proposeHero,
  setHeroAlt,
} from '../src/hero.js';
import type { LlmProvider, LlmRequest, LlmResponse, StreamTurn } from '../src/types.js';

const FIELDS = {
  topic: 'tail latency in distributed systems',
  concept: 'A felt-marker sketch of a request fanning out across three services, the slowest path inked in red.',
  altText: 'Hand-drawn diagram of a request fanning out across three services',
  filename: 'tail-latency-fanout.webp',
  rationale: 'Shows the fan-out that drives tail latency.',
};

/** A provider that records the request and replays a propose_image tool call. */
function fakeProvider(captured: { req?: LlmRequest } = {}, fields = FIELDS): LlmProvider {
  return {
    async complete(req: LlmRequest): Promise<LlmResponse> {
      captured.req = req;
      return {
        blocks: [{ type: 'tool_use', name: 'propose_image', input: fields }],
        model: req.model,
        stopReason: 'tool_use',
        usage: { input_tokens: 1, output_tokens: 1 },
      };
    },
    async stream(): Promise<StreamTurn> {
      throw new Error('stream not used in hero concept proposal');
    },
  };
}

describe('LlmConceptProposer', () => {
  it('forces the propose_image tool and returns its fields', async () => {
    const captured: { req?: LlmRequest } = {};
    const proposer = new LlmConceptProposer({ provider: fakeProvider(captured) });
    const out = await proposer.propose({ system: 'art director', tool: { name: 'propose_image' } as never, userMessage: 'hi' });

    expect(captured.req?.toolChoice).toEqual({ type: 'tool', name: 'propose_image' });
    expect(out.altText).toBe(FIELDS.altText);
    expect(out.topic).toBe(FIELDS.topic);
  });

  it('throws when the model returns no propose_image tool call', async () => {
    const provider: LlmProvider = {
      async complete(req) {
        return { blocks: [{ type: 'text', text: 'no tool' }], model: req.model, stopReason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
      },
      async stream() {
        throw new Error('unused');
      },
    };
    const proposer = new LlmConceptProposer({ provider });
    await expect(
      proposer.propose({ system: 's', tool: { name: 'propose_image' } as never, userMessage: 'u' }),
    ).rejects.toThrow(/propose_image/);
  });
});

describe('proposeHero', () => {
  it('produces a proposal whose assembled prompt carries the model concept + alt-text', async () => {
    const proposer = new LlmConceptProposer({ provider: fakeProvider() });
    const input = heroInputFromMarkdown(
      ['---', 'title: Cutting tail latency', 'category: pattern', 'excerpt: where to image', '---', 'Body about latency.'].join('\n'),
      'cutting-tail-latency',
    );
    const proposal = await proposeHero(input, { proposer });

    expect(proposal.altText).toBe(FIELDS.altText);
    expect(proposal.filename).toBe(FIELDS.filename);
    // assembleHeroPrompt filled the locked template's {CONCEPT} slot.
    expect(proposal.prompt).toContain(FIELDS.concept);
  });
});

describe('heroInputFromMarkdown', () => {
  it('parses title/category/excerpt/body from a draft', () => {
    const input = heroInputFromMarkdown(
      ['---', 'title: My Title', 'category: guide', 'excerpt: My excerpt', 'tags: ["a"]', '---', 'The body.'].join('\n'),
      'my-title',
    );
    expect(input).toEqual({ slug: 'my-title', title: 'My Title', category: 'guide', excerpt: 'My excerpt', body: 'The body.' });
  });
});

describe('setHeroAlt', () => {
  it('inserts heroImageAlt when absent', () => {
    const md = ['---', 'title: T', 'draft: true', '---', 'body'].join('\n');
    const out = setHeroAlt(md, 'A descriptive alt sentence');
    expect(out).toContain('heroImageAlt: "A descriptive alt sentence"');
    expect(out).toMatch(/^---\n/);
  });

  it('replaces an existing heroImageAlt', () => {
    const md = ['---', 'title: T', 'heroImageAlt: "old"', '---', 'body'].join('\n');
    const out = setHeroAlt(md, 'new alt');
    expect(out).toContain('heroImageAlt: "new alt"');
    expect(out).not.toContain('"old"');
  });

  it('is a no-op on empty alt-text', () => {
    const md = ['---', 'title: T', '---', 'body'].join('\n');
    expect(setHeroAlt(md, '  ')).toBe(md);
  });
});

describe('generateHeroForDraft', () => {
  const fakeProposer: ConceptProposer = { async propose() { return FIELDS; } };
  const fakeImageGen: ImageGen = { async generate() { return new ArrayBuffer(8); } };
  function memStore(): ObjectStore & { puts: string[] } {
    const puts: string[] = [];
    return { puts, async get() { return null; }, async put(key) { puts.push(key); } };
  }
  const md = ['---', 'title: Cutting tail latency', 'category: pattern', 'excerpt: e', 'draft: true', '---', 'Body about latency.'].join('\n');

  it('proposes, generates, persists, and writes both heroImage + heroImageAlt', async () => {
    const store = memStore();
    const res = await generateHeroForDraft(md, {
      proposer: fakeProposer,
      imageGen: fakeImageGen,
      objectStore: store,
      slug: 'cutting-tail-latency',
    });

    expect(res.changed).toBe(true);
    expect(res.content).toContain(`heroImageAlt: ${JSON.stringify(FIELDS.altText)}`);
    expect(res.content).toMatch(
      /heroImage: "\/img\/cutting-tail-latency\/cutting-tail-latency-hero-[0-9a-f]{6}\.png"/,
    );
    expect(store.puts).toHaveLength(1);
    expect(res.image?.publicPath).toContain('/img/cutting-tail-latency/');
  });

  it('is a no-op when the heroImages capability is off', async () => {
    const res = await generateHeroForDraft(md, {
      proposer: fakeProposer,
      imageGen: fakeImageGen,
      objectStore: memStore(),
      slug: 's',
      enabled: false,
    });
    expect(res.changed).toBe(false);
    expect(res.content).toBe(md);
  });

  it('is a no-op when no image generator/store is wired', async () => {
    const res = await generateHeroForDraft(md, { proposer: fakeProposer, slug: 's' });
    expect(res.changed).toBe(false);
    expect(res.content).toBe(md);
  });
});
