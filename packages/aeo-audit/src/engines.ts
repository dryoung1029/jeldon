import type { Engine, EngineFn, EngineName, EngineRaw } from './types.js';

/**
 * Pluggable answer-engine query functions. Ported verbatim from Body of Health
 * `scripts/aeo-audit.mjs` (queryPerplexity / queryAnthropic / queryGoogleAio).
 * Each returns the engine-neutral `EngineRaw` shape so `runAudit` can parse
 * citations uniformly. Nothing domain-specific lives here — the only project
 * input is the localized search location, threaded in for Google AIO.
 *
 * Adding OpenAI is the same shape: a `queryOpenAi(apiKey, query)` that hits
 * `gpt-4o-search-preview`, pulls citation URLs + text, returns `EngineRaw`.
 * Wire it into `ENGINE_BUILDERS` below. See // TODO(port:openai).
 */

const PERPLEXITY_URL = 'https://api.perplexity.ai/chat/completions';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const SERPAPI_URL = 'https://serpapi.com/search.json';

export async function queryPerplexity(apiKey: string, query: string): Promise<EngineRaw> {
  const res = await fetch(PERPLEXITY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages: [{ role: 'user', content: query }],
    }),
  });
  if (!res.ok) {
    return { error: `Perplexity ${res.status}: ${(await res.text()).slice(0, 200)}` };
  }
  const data = (await res.json()) as {
    citations?: string[];
    choices?: Array<{ message?: { content?: string } }>;
  };
  // Perplexity returns citations as a top-level array of URLs in order of
  // reference within the response.
  const urls = data.citations ?? [];
  const text = data.choices?.[0]?.message?.content ?? '';
  return { urls, text };
}

interface AnthropicBlock {
  type?: string;
  text?: string;
  url?: string;
  input?: { url?: string };
  content?: Array<{ url?: string }>;
  citations?: Array<{ url?: string }>;
}

export async function queryAnthropic(apiKey: string, query: string): Promise<EngineRaw> {
  const reqBody = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
    messages: [{ role: 'user', content: query }],
  });
  // Retry transient overload / rate-limit (529/429/503) with backoff so one
  // hiccup during the weekly run doesn't blank the entire Anthropic column.
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: reqBody,
    });
    if (res.ok) break;
    if ((res.status === 529 || res.status === 429 || res.status === 503) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1) * (attempt + 1)));
      continue;
    }
    return { error: `Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}` };
  }
  if (!res || !res.ok) return { error: 'Anthropic request failed after retries' };
  const data = (await res.json()) as { content?: AnthropicBlock[] };
  // Anthropic returns citations as content blocks of type
  // `web_search_tool_result` containing the search results, plus the
  // assistant's text response. We pull URLs from any tool_result blocks AND
  // any inline citation annotations.
  const urls: string[] = [];
  let text = '';
  for (const block of data.content ?? []) {
    if (block.type === 'text' && block.text) text += block.text + '\n';
    if (block.type === 'web_search_tool_result') {
      for (const r of block.content ?? []) {
        if (r.url) urls.push(r.url);
      }
    }
    if (block.type === 'server_tool_use' && block.input?.url) {
      urls.push(block.input.url);
    }
    // Inline citations attached to text spans.
    if (Array.isArray(block.citations)) {
      for (const c of block.citations) {
        if (c.url) urls.push(c.url);
      }
    }
  }
  return { urls, text };
}

interface AioTextBlock {
  snippet?: string;
  list?: Array<{ title?: string; snippet?: string }>;
  text_blocks?: AioTextBlock[];
}

interface AioOverview {
  page_token?: string;
  text_blocks?: AioTextBlock[];
  references?: Array<{ link?: string }>;
}

function extractAioText(blocks: AioTextBlock[] | undefined): string {
  // Flatten SerpApi's nested text_blocks structure into one string for
  // brand-mention detection. Blocks can be paragraphs, lists, or nested.
  if (!Array.isArray(blocks)) return '';
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.snippet) parts.push(b.snippet);
    if (Array.isArray(b.list)) {
      for (const item of b.list) {
        if (item.title) parts.push(item.title);
        if (item.snippet) parts.push(item.snippet);
      }
    }
    if (Array.isArray(b.text_blocks)) parts.push(extractAioText(b.text_blocks));
  }
  return parts.join(' ');
}

/**
 * Google AI Overviews via SerpApi. `location` is the localized-intent bias
 * (e.g. "Corvallis, Oregon, United States") — pass `pack.aeo.localSearchLocation`.
 * Omit for non-local domains.
 */
export async function queryGoogleAio(
  apiKey: string,
  query: string,
  location?: string,
): Promise<EngineRaw> {
  const url = new URL(SERPAPI_URL);
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', query);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('hl', 'en');
  url.searchParams.set('gl', 'us');
  if (location) url.searchParams.set('location', location);
  const res = await fetch(url);
  if (!res.ok) {
    return { error: `SerpApi ${res.status}: ${(await res.text()).slice(0, 200)}` };
  }
  const data = (await res.json()) as { ai_overview?: AioOverview };
  let aio = data.ai_overview;
  // Many SERPs simply don't surface an AI Overview — that's a real signal
  // (no AIO = no citation opportunity), not an error.
  if (!aio) {
    return { urls: [], text: '', noAiOverview: true };
  }
  // SerpApi sometimes defers the AIO body behind a page_token requiring a
  // second call against the google_ai_overview engine.
  if (aio.page_token && !aio.text_blocks) {
    const follow = new URL(SERPAPI_URL);
    follow.searchParams.set('engine', 'google_ai_overview');
    follow.searchParams.set('page_token', aio.page_token);
    follow.searchParams.set('api_key', apiKey);
    const r2 = await fetch(follow);
    if (r2.ok) {
      const d2 = (await r2.json()) as { ai_overview?: AioOverview };
      aio = d2.ai_overview ?? aio;
    }
  }
  // References are AIO's cited sources, in order. text_blocks is the prose.
  // Both feed the same parseCitations contract as the other engines.
  const urls = (aio.references ?? []).map((r) => r.link).filter((l): l is string => Boolean(l));
  const text = extractAioText(aio.text_blocks);
  return { urls, text };
}

/** Engine-build options: API keys + the localized search location. */
export interface EngineKeys {
  perplexity?: string;
  anthropic?: string;
  serpapi?: string;
  openai?: string;
}

/** One builder closes over a key + location to produce an `EngineFn`. */
type EngineBuilder = (keys: EngineKeys, location?: string) => EngineFn | null;

const ENGINE_BUILDERS: Record<EngineName, EngineBuilder> = {
  perplexity: (keys) =>
    keys.perplexity ? (q) => queryPerplexity(keys.perplexity as string, q) : null,
  anthropic: (keys) =>
    keys.anthropic ? (q) => queryAnthropic(keys.anthropic as string, q) : null,
  'google-aio': (keys, location) =>
    keys.serpapi ? (q) => queryGoogleAio(keys.serpapi as string, q, location) : null,
  // TODO(port:openai): hit gpt-4o-search-preview, pull citation URLs + text,
  // return EngineRaw. Wire keys.openai here. See scripts/aeo-audit.mjs header.
  openai: () => null,
};

/**
 * Build the active engine registry from the requested engine list + the keys
 * present. An engine whose key is missing is silently dropped (matches the
 * source cron's "whichever keys are present run" behavior).
 */
export function buildEngines(
  requested: ReadonlyArray<EngineName | string>,
  keys: EngineKeys,
  location?: string,
): Engine[] {
  const engines: Engine[] = [];
  for (const name of requested) {
    const builder = ENGINE_BUILDERS[name as EngineName];
    if (!builder) continue;
    const fn = builder(keys, location);
    if (fn) engines.push({ name, fn });
  }
  return engines;
}
