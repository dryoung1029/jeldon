import { defaultDraftingConfig, resolveModelId, singleToolRequest } from '@jeldon/config';
import type { LlmClient, LlmToolRequest, LlmToolResponse } from './types.js';

/**
 * Default `LlmClient` — Anthropic Messages API, one structured tool call per
 * request. Ported from the `fetch('https://api.anthropic.com/v1/messages', …)`
 * block shared by BoH `amplify/[slug].ts` and `newsletter-content.ts`.
 *
 * Model aliases resolve through the Domain Pack's `drafting.models` map (pass
 * it as `models`), defaulting to `defaultDraftingConfig.models`, so there is no
 * private copy of the IDs here. Requests follow the Claude 5.5 rules in
 * `@jeldon/config` llm.ts: `tool_choice: auto` plus a use-the-tool instruction,
 * and an explicit `output_config.effort`.
 */
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/** Resolve a short alias to a full model id; pass through an already-full id. */
export function resolveModel(
  model?: string,
  fallback = defaultDraftingConfig.defaultModel,
  models: Record<string, string> = defaultDraftingConfig.models,
): string {
  return resolveModelId(models, fallback, model);
}

export interface AnthropicLlmClientOptions {
  apiKey: string;
  /** Alias → model id. Pass `pack.drafting.models`. Default: `defaultDraftingConfig.models`. */
  models?: Record<string, string>;
  /** Override the API base (proxies, gateways). */
  baseUrl?: string;
  /** anthropic-version header. */
  anthropicVersion?: string;
  /** Injectable fetch (tests / Workers). */
  fetchImpl?: typeof fetch;
}

export class AnthropicLlmClient implements LlmClient {
  private readonly apiKey: string;
  private readonly url: string;
  private readonly version: string;
  private readonly models: Record<string, string>;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: AnthropicLlmClientOptions) {
    if (!opts.apiKey) throw new Error('AnthropicLlmClient requires an apiKey.');
    this.apiKey = opts.apiKey;
    this.url = opts.baseUrl ?? ANTHROPIC_URL;
    this.version = opts.anthropicVersion ?? '2023-06-01';
    this.models = opts.models ?? defaultDraftingConfig.models;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async callTool(req: LlmToolRequest): Promise<LlmToolResponse> {
    const res = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.version,
      },
      body: JSON.stringify({
        model: resolveModel(req.model, defaultDraftingConfig.defaultModel, this.models),
        max_tokens: req.maxTokens,
        ...singleToolRequest(req.system, req.tool),
        output_config: { effort: req.effort ?? 'medium' },
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
    // Find by type + name: a 5.5 response can open with thinking blocks.
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
