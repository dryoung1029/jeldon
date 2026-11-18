import type { DomainPack } from '@jeldon/config';
import { defaultFrontmatterCodec, type FrontmatterCodec, type Store } from '@jeldon/store';
import { BrevoClient, type CampaignParams } from './brevo.js';

/**
 * Queue one article's newsletter in Brevo and record the outcome in its
 * frontmatter. Ported from BoH `api/admin/newsletter/[slug]/schedule.ts`, the
 * manual path behind the "Queue in Brevo" button. It reaches the same end
 * state as the newsletter cron: the default send time is `nextSendSlot`, the
 * cron's own slot rule.
 *
 * Refuses (no campaign is created) when the article is a draft, already
 * queued, or already sent. When send-now fails after the campaign exists, the
 * article is left `queued` with `newsletterError` so the cancel control can
 * still find it.
 */

export type NewsletterRefusal = 'draft' | 'already-queued' | 'already-sent' | 'missing-subject' | 'missing-body';

export type ScheduleNewsletterResult =
  | { ok: true; campaignId: number; scheduledAt: string; status: 'queued' | 'sent' }
  | { ok: false; refused: NewsletterRefusal; error: string }
  | { ok: false; campaignId: number; scheduledAt: string; status: 'queued'; error: string };

export interface ScheduleNewsletterInput {
  subject: string;
  body: string;
  sendNow?: boolean;
  /** Explicit send time; default is the cron's next send slot. */
  scheduledAt?: Date;
}

export interface ScheduleNewsletterDeps {
  store: Store;
  brevo: Pick<BrevoClient, 'createScheduledCampaign' | 'sendNow'>;
  pack: Pick<DomainPack, 'brand' | 'content' | 'amplify'>;
  codec?: FrontmatterCodec;
  now?: Date;
  /** Path prefix for article URLs. Default `/articles/`. */
  articlePathPrefix?: string;
}

export async function scheduleArticleNewsletter(
  slug: string,
  input: ScheduleNewsletterInput,
  deps: ScheduleNewsletterDeps,
): Promise<ScheduleNewsletterResult> {
  if (!input.subject?.trim()) return { ok: false, refused: 'missing-subject', error: 'subject is required' };
  if (!input.body?.trim()) return { ok: false, refused: 'missing-body', error: 'body is required' };

  const codec = deps.codec ?? defaultFrontmatterCodec;
  const file = await deps.store.getArticle(slug);
  const { frontmatter, body: articleBody } = codec.parse(file.content);
  if (frontmatter.draft === true) return { ok: false, refused: 'draft', error: 'Article is a draft. Publish it first.' };
  if (frontmatter.newsletterStatus === 'queued') {
    return { ok: false, refused: 'already-queued', error: 'Already queued. Cancel the existing campaign first.' };
  }
  if (frontmatter.newsletterStatus === 'sent') {
    return { ok: false, refused: 'already-sent', error: 'The newsletter for this article was already sent.' };
  }

  const site = deps.pack.brand.siteUrl.replace(/\/$/, '');
  const prefix = (deps.articlePathPrefix ?? '/articles/').replace(/^\/?/, '/').replace(/\/?$/, '/');
  const hero = typeof frontmatter.heroImage === 'string' ? frontmatter.heroImage : '';
  const title = typeof frontmatter.title === 'string' ? frontmatter.title : slug;
  const params: CampaignParams = {
    ARTICLE_TITLE: title,
    ARTICLE_EXCERPT: typeof frontmatter.excerpt === 'string' ? frontmatter.excerpt : '',
    ARTICLE_HERO_URL: hero ? (/^https?:\/\//.test(hero) ? hero : `${site}${hero}`) : '',
    ARTICLE_BODY: input.body,
    ARTICLE_URL: `${site}${prefix}${slug}`,
    READ_TIME: typeof frontmatter.readTime === 'string' ? frontmatter.readTime : '',
  };

  const now = deps.now ?? new Date();
  const slot = deps.pack.amplify?.newsletter;
  // Brevo requires a future scheduledAt even for send-now: schedule +1 min, then fire.
  const scheduledAt = input.sendNow
    ? new Date(now.getTime() + 60_000)
    : (input.scheduledAt ??
      BrevoClient.nextSendSlot(now, deps.pack.content.timezone, slot?.sendHour ?? 10, slot?.floorHours ?? 4));

  const { campaignId } = await deps.brevo.createScheduledCampaign({
    name: `Manual: ${title} (${scheduledAt.toISOString().slice(0, 10)})`,
    subject: input.subject,
    params,
    scheduledAt,
  });

  const save = async (fields: Record<string, unknown>, drop: string[], message: string) => {
    const fm: Record<string, unknown> = { ...frontmatter, ...fields };
    for (const k of drop) delete fm[k];
    await deps.store.saveArticle(slug, codec.serialize({ frontmatter: fm, body: articleBody }), file.sha, message);
  };

  if (input.sendNow) {
    try {
      await deps.brevo.sendNow(campaignId);
    } catch (err) {
      const msg = (err as Error).message;
      await save(
        {
          newsletterCampaignId: String(campaignId),
          newsletterScheduledAt: scheduledAt.toISOString(),
          newsletterStatus: 'queued',
          newsletterError: `sendNow failed: ${msg}`.slice(0, 200),
        },
        [],
        `newsletter: queue ${slug} (send-now failed)`,
      );
      return { ok: false, campaignId, scheduledAt: scheduledAt.toISOString(), status: 'queued', error: msg };
    }
    const sentAt = new Date().toISOString();
    await save(
      { newsletterCampaignId: String(campaignId), newsletterScheduledAt: sentAt, newsletterStatus: 'sent' },
      ['newsletterError'],
      `newsletter: send-now ${slug}`,
    );
    return { ok: true, campaignId, scheduledAt: sentAt, status: 'sent' };
  }

  await save(
    { newsletterCampaignId: String(campaignId), newsletterScheduledAt: scheduledAt.toISOString(), newsletterStatus: 'queued' },
    ['newsletterError'],
    `newsletter: schedule ${slug}`,
  );
  return { ok: true, campaignId, scheduledAt: scheduledAt.toISOString(), status: 'queued' };
}
