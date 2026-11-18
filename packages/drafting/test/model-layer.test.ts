import { defaultDraftingConfig, defaultScoringConfig } from '@jeldon/config';
import { NullVerifier, type ClaimVerifier } from '@jeldon/verify';
import { describe, expect, it } from 'vitest';
import { chatEdit } from '../src/chat.js';
import { buildPromptPack } from '../src/prompts.js';
import { AnthropicProvider } from '../src/provider.js';
import type { DraftingPack, LlmProvider, LlmRequest, StreamTurn } from '../src/types.js';

// Claude 5.5 request rules: no forced tool_choice, explicit effort, replay
// thinking blocks in multi-turn tool loops.

function sse(events: unknown[]): string {
  return events.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join('');
}

function fakeFetch(body: string, captured: { body?: Record<string, unknown> }): typeof fetch {
  return (async (_url: string, init: { body: string }) => {
    captured.body = JSON.parse(init.body);
    const bytes = new TextEncoder().encode(body);
    return new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(bytes);
          c.close();
        },
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
}

describe('AnthropicProvider request body', () => {
  it('sends tool_choice auto, the use-the-tool instruction and an explicit effort', async () => {
    const captured: { body?: Record<string, unknown> } = {};
    const fetchImpl = (async (_u: string, init: { body: string }) => {
      captured.body = JSON.parse(init.body);
      return new Response(
        JSON.stringify({ content: [], model: 'm', stop_reason: 'end_turn', usage: {} }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const p = new AnthropicProvider({ apiKey: 'k', fetchImpl });
    await p.complete({
      model: 'm',
      system: 'SYS',
      maxTokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ name: 'create_draft', description: 'd', input_schema: {} }],
      toolName: 'create_draft',
      effort: 'low',
    });
    const b = captured.body!;
    expect(b.tool_choice).toEqual({ type: 'auto', disable_parallel_tool_use: true });
    expect(String(b.system)).toContain('SYS');
    expect(String(b.system)).toContain('`create_draft` tool exactly once');
    expect(b.output_config).toEqual({ effort: 'low' });
    expect(b).not.toHaveProperty('thinking');
  });

  it('defaults effort to medium and omits tool_choice when no tool is expected', async () => {
    const captured: { body?: Record<string, unknown> } = {};
    const fetchImpl = (async (_u: string, init: { body: string }) => {
      captured.body = JSON.parse(init.body);
      return new Response(JSON.stringify({ content: [], model: 'm', stop_reason: 'end_turn' }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const p = new AnthropicProvider({ apiKey: 'k', fetchImpl });
    await p.complete({ model: 'm', system: 'S', maxTokens: 10, messages: [] });
    expect(captured.body!.output_config).toEqual({ effort: 'medium' });
    expect(captured.body!).not.toHaveProperty('tool_choice');
    expect(captured.body!.system).toBe('S');
  });
});

describe('AnthropicProvider.stream thinking blocks', () => {
  it('keeps thinking (with signature) and redacted_thinking blocks in order', async () => {
    const body = sse([
      { type: 'message_start', message: { model: 'm', usage: { input_tokens: 1 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hmm' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'SIG-a' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'SIG-b' } },
      { type: 'content_block_start', index: 1, content_block: { type: 'redacted_thinking', data: 'OPAQUE' } },
      { type: 'content_block_start', index: 2, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 2, delta: { type: 'text_delta', text: 'hello' } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    ]);
    const captured: { body?: Record<string, unknown> } = {};
    const p = new AnthropicProvider({ apiKey: 'k', fetchImpl: fakeFetch(body, captured) });
    const turn = await p.stream({ model: 'm', system: 's', maxTokens: 10, messages: [] });
    expect(turn.ordered.map((b) => b.type)).toEqual(['thinking', 'redacted_thinking', 'text']);
    expect(turn.ordered[0]).toMatchObject({ text: 'hmm', signature: 'SIG-aSIG-b' });
    expect(turn.ordered[1]).toMatchObject({ data: 'OPAQUE' });
    expect(turn.ordered[2]!.text).toBe('hello');
  });
});

function pack(): DraftingPack {
  return {
    brand: { name: 'Acme', siteUrl: 'https://acme.example', tagline: 't' },
    authors: [{ slug: 'a', name: 'A', schemaId: 'https://acme.example/#a', profile: { name: 'A' } }],
    voice: {
      persona: 'p',
      bannedTopics: [],
      bannedPhrasings: [],
      rules: [],
      voiceAnchorUrls: ['/a'],
      readingGradeBand: [6, 9],
    },
    content: { categories: ['guide'], categoryTargets: { guide: 85 }, defaultAuthorSlug: 'a', timezone: 'UTC' },
    scoring: defaultScoringConfig,
    citation: {
      policy: 'direct-source-urls',
      forbiddenPatterns: [],
      referenceFormat: 'Author, year. [link](URL)',
      verifier: { kind: 'none' },
    },
    schema: { orgType: ['Organization'], org: { name: 'Acme', url: 'https://acme.example' }, articleTypes: ['Article'] },
    drafting: defaultDraftingConfig,
  } as unknown as DraftingPack;
}

describe('chatEdit() verify loop', () => {
  it('replays thinking blocks unmodified ahead of text and tool_use', async () => {
    const requests: LlmRequest[] = [];
    let round = 0;
    const provider: LlmProvider = {
      async complete() {
        throw new Error('unused');
      },
      async stream(req): Promise<StreamTurn> {
        requests.push(JSON.parse(JSON.stringify(req)));
        round++;
        const usage = { input_tokens: 1, output_tokens: 1 };
        if (round === 1) {
          return {
            ordered: [
              { type: 'thinking', text: '', signature: 'SIG', jsonAcc: '' },
              { type: 'redacted_thinking', text: '', data: 'OPAQUE', jsonAcc: '' },
              { type: 'text', text: 'checking', jsonAcc: '' },
              { type: 'tool_use', id: 'tu1', name: 'verify_citation', text: '', jsonAcc: '{"claim":"x"}' },
            ],
            stopReason: 'tool_use',
            usage,
            modelOut: 'm',
          };
        }
        return { ordered: [{ type: 'text', text: 'done', jsonAcc: '' }], stopReason: 'end_turn', usage, modelOut: 'm' };
      },
    };
    const verifier: ClaimVerifier = {
      kind: 'fake',
      async verifyClaims() {
        return new NullVerifier().verifyClaims(['x']);
      },
    };
    const events = [];
    for await (const e of chatEdit(
      { messages: [{ role: 'user', content: 'edit' }], articleContent: '---\ntitle: "x"\n---\nbody' },
      { provider, pack: pack(), prompts: buildPromptPack(pack()), knowledge: 'KB', verifier },
    )) {
      events.push(e);
    }
    expect(events.find((e) => e.type === 'error')).toBeUndefined();
    expect(requests).toHaveLength(2);
    expect(requests[0]!.effort).toBe('medium');
    const assistant = requests[1]!.messages.find((m) => m.role === 'assistant')!;
    expect(assistant.content).toEqual([
      { type: 'thinking', thinking: '', signature: 'SIG' },
      { type: 'redacted_thinking', data: 'OPAQUE' },
      { type: 'text', text: 'checking' },
      { type: 'tool_use', id: 'tu1', name: 'verify_citation', input: { claim: 'x' } },
    ]);
  });
});
