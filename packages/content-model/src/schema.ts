import { z } from 'zod';
import type { DomainPack } from '@jeldon/config';
import { parseYouTubeUrl } from './youtube.js';

/**
 * The article frontmatter schema, built from the Domain Pack.
 *
 * Ported from `src/content/config.ts`. The single piece BoH hardcoded — the
 * `category` enum — is derived here from `content.categories`, killing the
 * "category enum in 4+ places" coupling (the schema, validate-article,
 * check-frontmatter, prompts, and the scorer all read one list now). Author
 * defaults come from `pack.authors[defaultAuthorSlug]`.
 *
 * Returns a Zod object. `z.coerce.date()` parses `YYYY-MM-DD` strings AND the
 * `Date` objects a content layer may already have coerced, so the schema is
 * usable both at parse time (string in) and post-coercion.
 */
export interface BuildArticleSchemaOptions {
  /** Override the primary author display name. Defaults to the pack's default
   *  author's profile name. */
  defaultAuthorName?: string;
  /** Override the default author slug. Defaults to `content.defaultAuthorSlug`. */
  defaultAuthorSlug?: string;
}

/** `heroImage`: any string, or one of the allowed prefixes when the pack sets them. */
function heroImageField(prefixes: string[] | undefined) {
  if (!prefixes?.length) return z.string().optional();
  return z
    .string()
    .refine((p) => prefixes.some((pre) => p.startsWith(pre)), {
      message: `heroImage must start with ${prefixes.map((p) => `"${p}"`).join(' or ')}`,
    })
    .optional();
}

export function buildArticleSchema(pack: DomainPack, opts: BuildArticleSchemaOptions = {}) {
  const categories = pack.content.categories;
  if (categories.length === 0) {
    throw new Error('buildArticleSchema: pack.content.categories is empty.');
  }
  // z.enum needs a non-empty readonly tuple of string literals.
  const categoryEnum = z.enum(categories as [string, ...string[]]);

  const defaultAuthorSlug = opts.defaultAuthorSlug ?? pack.content.defaultAuthorSlug;
  const defaultAuthor =
    opts.defaultAuthorName ??
    pack.authors.find((a) => a.slug === defaultAuthorSlug)?.profile.name ??
    pack.authors.find((a) => a.isPrimary)?.profile.name ??
    pack.authors[0]?.profile.name ??
    'Staff';

  return z.object({
    title: z.string(),
    excerpt: z.string(),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    category: categoryEnum,
    author: z.string().default(defaultAuthor),
    authorSlug: z.string().default(defaultAuthorSlug),
    readTime: z.string().optional(),
    heroImage: heroImageField(pack.content.heroImagePathPrefixes),
    heroImageAlt: z.string().optional(),
    draft: z.boolean().default(false),
    // Provenance, not lifecycle: true when an unattended pipeline wrote the
    // draft with no human session behind it. Orthogonal to draft/ready/
    // scheduled; surfaces "drafts nobody has looked at yet".
    autonomous: z.boolean().default(false),
    // @deprecated — retired in BoH 2026-07-10 (superseded by `autonomous` and
    // the editor's improve loop). Still parsed so older files validate.
    docReviewed: z.boolean().default(false),
    docNotes: z.string().optional(),
    ready: z.boolean().default(false),
    scheduled: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    series: z.string().optional(),
    // Audio narration fields — written out-of-band by the audio route; never
    // hand-edited. Numbers must coerce so a stringly-quoted round-trip doesn't
    // abort the whole content build.
    audioUrl: z.string().optional(),
    audioBodyHash: z.string().optional(),
    audioBodyLength: z.number().optional(),
    audioFileSize: z.number().optional(),
    audioGeneratedAt: z.coerce.date().optional(),
    sourceEpisode: z.url().optional(),
    // Attached video (YouTube watch / Shorts / youtu.be / embed / live URL).
    // VideoObject JSON-LD is emitted only when videoUploadDate is set: Google
    // requires uploadDate for video rich results.
    videoUrl: z
      .url()
      .refine((u) => parseYouTubeUrl(u) !== null, 'videoUrl must be a YouTube watch, Shorts, youtu.be, embed or live URL')
      .optional(),
    videoTitle: z.string().optional(),
    videoUploadDate: z.coerce.date().optional(),
    // Newsletter automation state — written by the auto-newsletter cron. Brevo
    // returns numeric campaign IDs the cron sometimes writes unquoted, so coerce
    // to string rather than fail the schema and abort the build.
    newsletterCampaignId: z.coerce.string().optional(),
    newsletterScheduledAt: z.coerce.date().optional(),
    newsletterStatus: z.enum(['queued', 'sent', 'cancelled', 'error']).optional(),
    newsletterError: z.string().optional(),
  });
}

export type ArticleSchema = ReturnType<typeof buildArticleSchema>;
export type ArticleData = z.infer<ArticleSchema>;
