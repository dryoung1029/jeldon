import type { AmplifyChannel, AmplifyConfig, DomainPack } from '@jeldon/config';
import { defaultAmplifyConfig } from '@jeldon/config';
import { buildVoiceBlock } from './voice.js';
import type {
  AmplifyArticle,
  AmplifyKit,
  GenerateKitResult,
  LlmClient,
  LlmTool,
  RegenerateChannelResult,
} from './types.js';

/**
 * Per-channel distribution copy. Ported from BoH
 * `src/pages/api/admin/amplify/[slug].ts`. The SYSTEM prompt's voice paragraph
 * is now `buildVoiceBlock(pack)` (one read), and the channels — labels, the
 * per-channel guidance, the tool-field descriptions, the UTM map — are
 * `pack.amplify.channels` instead of inline literals.
 */

function resolveAmplify(pack: Pick<DomainPack, 'amplify'>): AmplifyConfig {
  return pack.amplify ?? defaultAmplifyConfig;
}

/** Build the kit system prompt: preamble + the single voice block + every
 *  channel's guidance, in pack order. */
export function buildKitSystem(pack: Pick<DomainPack, 'voice' | 'brand' | 'amplify'>): string {
  const amplify = resolveAmplify(pack);
  const voiceBlock = buildVoiceBlock(pack);
  const channelGuidance = amplify.channels.map((c) => c.guidance).join('\n\n');
  return `${amplify.systemPreamble}\n\n${voiceBlock}\n\nChannel-specific guidance:\n\n${channelGuidance}`;
}

function buildFullKitTool(channels: AmplifyChannel[]): LlmTool {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const c of channels) {
    properties[c.id] = { type: 'string', description: c.fieldDescription };
    required.push(c.id);
  }
  return {
    name: 'generate_amplification',
    description: 'Produce distribution copy for every channel.',
    input_schema: { type: 'object', properties, required },
  };
}

const SINGLE_TOOL: LlmTool = {
  name: 'regenerate_channel',
  description: "Produce a fresh version of one channel's copy.",
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description:
          "The new copy for the requested channel. Must follow that channel's rules from the system prompt.",
      },
    },
    required: ['text'],
  },
};

function articleBlock(article: AmplifyArticle, url: string): string {
  const tags = (article.tags ?? []).join(', ');
  return `Title: ${article.title}
URL: ${url}
${article.isDraft ? 'NOTE: This article is still a draft. The URL above will 404 until it goes live. Generate the copy anyway — this is a preview.' : ''}
Category: ${article.category ?? ''}
Tags: ${tags}

<article>
${article.body}
</article>`;
}

function articleUrl(siteUrl: string, slug: string): string {
  return `${siteUrl.replace(/\/$/, '')}/articles/${slug}`;
}

/** UTM-tag the bare article URL inside one channel's text. Replaces the URL
 *  (optional trailing slash) only when not already followed by a query string —
 *  the exact regex from BoH `amplify/[slug].ts::tagUrl`. */
function tagUrl(text: string, url: string, utm: string | undefined, slug: string): string {
  if (!utm) return text;
  const tagged = `${url}?${utm}&utm_campaign=${encodeURIComponent(slug)}`;
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(escaped + '/?(?!\\?)', 'g'), tagged);
}

export interface GenerateKitOptions {
  model?: string;
  maxTokens?: number;
}

/**
 * Generate the full amplification kit for an article.
 *
 * @param article  the article view
 * @param pack     the Domain Pack (voice + amplify channels)
 * @param llm      the model client (default: `AnthropicLlmClient`)
 */
export async function generateKit(
  article: AmplifyArticle,
  pack: Pick<DomainPack, 'voice' | 'brand' | 'amplify'>,
  llm: LlmClient,
  opts: GenerateKitOptions = {},
): Promise<GenerateKitResult> {
  const amplify = resolveAmplify(pack);
  const url = articleUrl(pack.brand.siteUrl, article.slug);
  const tool = buildFullKitTool(amplify.channels);

  const res = await llm.callTool({
    model: opts.model ?? 'sonnet',
    maxTokens: opts.maxTokens ?? 4000,
    system: buildKitSystem(pack),
    tool,
    userMessage: `${articleBlock(article, url)}\n\nGenerate the full amplification kit. Use the URL above wherever a channel needs it (skip for channels whose rules say "link in bio").`,
  });

  if (!res.input) {
    throw new Error(
      res.stopReason === 'max_tokens'
        ? 'Model ran out of output tokens. Try again or switch models.'
        : `Model returned no copy (stop_reason: ${res.stopReason}).`,
    );
  }

  const kit: AmplifyKit = {};
  for (const c of amplify.channels) {
    const raw = res.input[c.id];
    if (typeof raw !== 'string') continue;
    kit[c.id] = c.noUrl ? raw : tagUrl(raw, url, c.utm, article.slug);
  }

  return {
    kit,
    meta: { url, title: article.title, isDraft: !!article.isDraft },
    model: opts.model ?? 'sonnet',
    usage: res.usage,
  };
}

export interface RegenerateChannelOptions extends GenerateKitOptions {
  /** A user refinement instruction for the new version. */
  refinement?: string;
  /** The current text — used so the model varies the angle. */
  currentText?: string;
}

/** Regenerate a single channel's copy. Ported from the `isSingleChannel` path. */
export async function regenerateChannel(
  article: AmplifyArticle,
  channelId: string,
  pack: Pick<DomainPack, 'voice' | 'brand' | 'amplify'>,
  llm: LlmClient,
  opts: RegenerateChannelOptions = {},
): Promise<RegenerateChannelResult> {
  const amplify = resolveAmplify(pack);
  const channel = amplify.channels.find((c) => c.id === channelId);
  if (!channel) throw new Error(`Unknown channel "${channelId}"`);

  const url = articleUrl(pack.brand.siteUrl, article.slug);
  const refinementBlock = opts.refinement?.trim()
    ? `\n\nUSER REFINEMENT REQUEST: ${opts.refinement.trim()}\n\nApply this refinement to the new version. If it contradicts the channel's hard rules (e.g. asking to exceed a character limit), honor the rule and note the conflict at the end.`
    : '';
  const previousBlock = opts.currentText?.trim()
    ? `\n\n<previous_version>\n${opts.currentText}\n</previous_version>\n\nProduce a DIFFERENT version — don't return the same text. Vary the angle, the hook, the structure, or the emphasis.`
    : '';

  const res = await llm.callTool({
    model: opts.model ?? 'sonnet',
    maxTokens: opts.maxTokens ?? 1500,
    system: buildKitSystem(pack),
    tool: SINGLE_TOOL,
    userMessage: `${articleBlock(article, url)}${previousBlock}${refinementBlock}\n\nProduce ONLY the ${channel.label}. Call regenerate_channel with the new text. Follow all the rules for this channel from the system prompt.`,
  });

  if (!res.input || typeof res.input.text !== 'string') {
    throw new Error(
      res.stopReason === 'max_tokens'
        ? 'Model ran out of output tokens. Try again or switch models.'
        : `Model returned no copy (stop_reason: ${res.stopReason}).`,
    );
  }

  const text = channel.noUrl
    ? res.input.text
    : tagUrl(res.input.text, url, channel.utm, article.slug);

  return {
    channel: channelId,
    text,
    meta: { url, title: article.title, isDraft: !!article.isDraft },
    model: opts.model ?? 'sonnet',
    usage: res.usage,
  };
}
