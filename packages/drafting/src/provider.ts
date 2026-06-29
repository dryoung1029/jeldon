/**
 * LlmProvider — the injectable LLM boundary.
 *
 * `AnthropicProvider` is the default adapter, the ONLY place an Anthropic
 * literal lives (BoH hardwired `fetch('https://api.anthropic.com/v1/messages')`
 * in author.ts AND chat.ts; here it's one class). It implements both the
 * non-streaming `complete` (drafting / claim-extraction / fix-pass — BoH
 * author.ts) and the streaming `stream` (the editor-chat agentic loop — BoH
 * chat.ts::streamOnce, ported faithfully including the SSE block accumulator).
 *
 * Tests inject a fake provider; a non-Anthropic host writes its own.
 */

import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
  StreamBlock,
  StreamTurn,
} from './types.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export interface AnthropicProviderOptions {
  apiKey: string;
  /** Injectable fetch (tests / Workers). Defaults to platform `fetch`. */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

export class AnthropicProvider implements LlmProvider {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly url: string;

  constructor(opts: AnthropicProviderOptions) {
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.url = opts.baseUrl ?? ANTHROPIC_URL;
  }

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    };
  }

  private body(req: LlmRequest, stream: boolean): string {
    const payload: Record<string, unknown> = {
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: req.messages,
    };
    if (req.tools) payload.tools = req.tools;
    if (req.toolChoice) payload.tool_choice = req.toolChoice;
    if (stream) payload.stream = true;
    return JSON.stringify(payload);
  }

  /** One non-streaming completion. BoH author.ts's single fetch + content scan. */
  async complete(req: LlmRequest): Promise<LlmResponse> {
    const res = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: this.headers(),
      body: this.body(req, false),
    });
    if (!res.ok) {
      throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 400)}`);
    }
    const data = (await res.json()) as {
      content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
      model: string;
      stop_reason: string | null;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const blocks: LlmResponse['blocks'] = [];
    for (const b of data.content ?? []) {
      if (b.type === 'text') blocks.push({ type: 'text', text: b.text ?? '' });
      else if (b.type === 'tool_use') {
        blocks.push({
          type: 'tool_use',
          id: b.id,
          name: b.name ?? '',
          input: (b.input as Record<string, unknown>) ?? {},
        });
      }
    }
    return {
      blocks,
      model: data.model,
      stopReason: data.stop_reason ?? null,
      usage: {
        input_tokens: data.usage?.input_tokens ?? 0,
        output_tokens: data.usage?.output_tokens ?? 0,
      },
    };
  }

  /**
   * One streamed completion. Ported verbatim from BoH `chat.ts::streamOnce` —
   * accumulates content blocks (text + tool_use with id), tracks stop_reason +
   * usage, returns them ordered by content-block index so a turn can be
   * replayed into the next request.
   */
  async stream(req: LlmRequest): Promise<StreamTurn> {
    const res = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: this.headers(),
      body: this.body(req, true),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 400)}`);
    if (!res.body) throw new Error('Anthropic returned no body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const blocks = new Map<number, StreamBlock>();
    let stopReason: string | null = null;
    let usage = { input_tokens: 0, output_tokens: 0 };
    let modelOut = req.model;
    let buf = '';

    const processEvent = (ev: string) => {
      const dataLines = ev
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).replace(/^ /, ''));
      if (!dataLines.length) return;
      const payloadStr = dataLines.join('\n').trim();
      if (!payloadStr || payloadStr === '[DONE]') return;
      try {
        const j = JSON.parse(payloadStr);
        if (j.type === 'message_start') {
          usage = j.message?.usage ?? usage;
          modelOut = j.message?.model ?? modelOut;
        } else if (j.type === 'content_block_start') {
          const cb = j.content_block;
          if (cb?.type === 'text') {
            blocks.set(j.index, { type: 'text', text: '', jsonAcc: '' });
          } else if (cb?.type === 'tool_use') {
            blocks.set(j.index, { type: 'tool_use', id: cb.id, name: cb.name, text: '', jsonAcc: '' });
          }
        } else if (j.type === 'content_block_delta') {
          const block = blocks.get(j.index);
          if (!block) return;
          if (j.delta?.type === 'text_delta' && block.type === 'text') {
            block.text += j.delta.text ?? '';
          } else if (j.delta?.type === 'input_json_delta' && block.type === 'tool_use') {
            block.jsonAcc += j.delta.partial_json ?? '';
          }
        } else if (j.type === 'message_delta') {
          if (j.delta?.stop_reason) stopReason = j.delta.stop_reason;
          if (j.usage) usage = { ...usage, ...j.usage };
        }
      } catch {
        /* skip malformed event */
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      const events = buf.split('\n\n');
      buf = events.pop() ?? '';
      for (const ev of events) processEvent(ev);
    }
    buf += decoder.decode().replace(/\r\n/g, '\n');
    if (buf.trim()) for (const ev of buf.split('\n\n')) processEvent(ev);

    const ordered = Array.from(blocks.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => v);
    return { ordered, stopReason, usage, modelOut };
  }
}

/** Resolve a model alias (`sonnet`) or raw id against the pack's model map. */
export function resolveModel(
  models: Record<string, string>,
  defaultAlias: string,
  requested?: string,
): string {
  if (requested && models[requested]) return models[requested];
  // A caller may pass a raw provider id directly.
  if (requested && requested.includes('-')) return requested;
  return models[defaultAlias] ?? requested ?? defaultAlias;
}
