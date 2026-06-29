import type { LlmClient, LlmToolRequest, LlmToolResponse } from './types.js';

/**
 * Default `LlmClient` — Anthropic Messages API with forced tool use. Ported
 * verbatim from the `fetch('https://api.anthropic.com/v1/messages', …)` block
 * shared by BoH `amplify/[slug].ts`, `carousel/[slug].ts`, and
 * `newsletter-content.ts`. The model-alias map (sonnet/opus/haiku → full id) is
 * here too so callers can pass either an alias or a full id.
 */
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const MODEL_ALIASES: Record<string, string> = {
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
  haiku: 'claude-haiku-4-5',
};

/** Resolve a short alias to a full model id; pass through an already-full id. */
export function resolveModel(model?: string, fallback = 'sonnet'): string {
  const m = model ?? fallback;
  return MODEL_ALIASES[m] ?? m;
}

export interface AnthropicLlmClientOptions {
  apiKey: string;
  /** Override the API base (proxies, gateways). */
  baseUrl?: string;
  /** anthropic-version header. */
  anthropicVersion?: string;
}

export class AnthropicLlmClient implements LlmClient {
  private readonly apiKey: string;
  private readonly url: string;
  private readonly version: string;

  constructor(opts: AnthropicLlmClientOptions) {
    if (!opts.apiKey) throw new Error('AnthropicLlmClient requires an apiKey.');
    this.apiKey = opts.apiKey;
    this.url = opts.baseUrl ?? ANTHROPIC_URL;
    this.version = opts.anthropicVersion ?? '2023-06-01';
  }

  async callTool(req: LlmToolRequest): Promise<LlmToolResponse> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.version,
      },
      body: JSON.stringify({
        model: resolveModel(req.model),
        max_tokens: req.maxTokens,
        system: req.system,
        tools: [req.tool],
        tool_choice: { type: 'tool', name: req.tool.name },
        messages: [{ role: 'user', content: req.userMessage }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 400)}`);
    }
    const data = (await res.json()) as {
      content: Array<{ type: string; name?: string; input?: Record<string, unknown> }>;
      stop_reason: string;
      usage?: { input_tokens: number; output_tokens: number };
    };
    const toolUse = data.content.find(
      (b) => b.type === 'tool_use' && b.name === req.tool.name,
    );
    return {
      input: toolUse?.input ?? null,
      stopReason: data.stop_reason,
      usage: data.usage,
    };
  }
}
