import type { AmplifyConfig, DomainPack } from '@jeldon/config';
import { defaultAmplifyConfig } from '@jeldon/config';
import { buildVoiceBlock } from './voice.js';
import type { AmplifyArticle, LlmClient, LlmTool, NewsletterContent } from './types.js';

/**
 * Newsletter subject + body generation. Ported from BoH
 * `src/lib/admin/newsletter-content.ts` AND the inline copy in
 * `scripts/auto-newsletter.mjs` (the SYNC-REQUIREMENT duplication those two
 * carried is gone — one implementation, one prompt, both surfaces import it).
 *
 * The voice paragraph is `buildVoiceBlock(pack)`; the newsletter shape is
 * `pack.amplify.newsletterGuidance`.
 */

const NEWSLETTER_TOOL: LlmTool = {
  name: 'compose_newsletter',
  description: 'Produce the subject + body for the newsletter blast.',
  input_schema: {
    type: 'object',
    properties: {
      subject: {
        type: 'string',
        description: 'Email subject line. 40-60 chars. No URLs, no emoji unless earned.',
      },
      body: {
        type: 'string',
        description:
          'Email body. 80-130 words. Personal-note tone. NO URL — the email template handles the CTA button.',
      },
    },
    required: ['subject', 'body'],
  },
};

function resolveAmplify(pack: Pick<DomainPack, 'amplify'>): AmplifyConfig {
  return pack.amplify ?? defaultAmplifyConfig;
}

export function buildNewsletterSystem(pack: Pick<DomainPack, 'voice' | 'brand' | 'amplify'>): string {
  const amplify = resolveAmplify(pack);
  return `${buildVoiceBlock(pack)}\n\n${amplify.newsletterGuidance}`;
}

export interface GenerateNewsletterOptions {
  model?: string;
  maxTokens?: number;
  /** Cap on article body chars passed into the prompt (BoH used 12000). */
  bodyCharLimit?: number;
}

/** Generate newsletter subject + body for an article. */
export async function generateNewsletter(
  article: AmplifyArticle,
  pack: Pick<DomainPack, 'voice' | 'brand' | 'amplify'>,
  llm: LlmClient,
  opts: GenerateNewsletterOptions = {},
): Promise<NewsletterContent> {
  const limit = opts.bodyCharLimit ?? 12000;
  const articleBlock = `Title: ${article.title}
Excerpt: ${article.excerpt ?? ''}
Category: ${article.category ?? ''}
Tags: ${(article.tags ?? []).join(', ')}

<article>
${article.body.slice(0, limit)}
</article>`;

  const res = await llm.callTool({
    model: opts.model ?? 'sonnet',
    maxTokens: opts.maxTokens ?? 1024,
    system: buildNewsletterSystem(pack),
    tool: NEWSLETTER_TOOL,
    userMessage: `Compose the newsletter for this article.\n\n${articleBlock}`,
  });

  if (!res.input || typeof res.input.subject !== 'string' || typeof res.input.body !== 'string') {
    throw new Error('Model returned no compose_newsletter tool_use block.');
  }
  return { subject: res.input.subject, body: res.input.body };
}
