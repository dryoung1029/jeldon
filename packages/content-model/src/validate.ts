import type { ZodIssue } from 'zod';
import type { DomainPack } from '@jeldon/config';
import { parse } from './frontmatter.js';
import { buildArticleSchema, type ArticleData, type BuildArticleSchemaOptions } from './schema.js';

export interface ValidateArticleResult {
  ok: boolean;
  /** The parsed + defaulted frontmatter when `ok`. */
  data?: ArticleData;
  body?: string;
  errors: Array<{ path: string; message: string }>;
}

/**
 * Validate one article's frontmatter against the pack-derived schema.
 *
 * Consolidates the BoH `validate-article.ts` / `check-frontmatter.mjs` checks
 * that each independently re-stated the category enum. Accepts either a raw
 * markdown string (frontmatter is parsed via the shared codec) or an already
 * separated `{ frontmatter, body }`.
 */
export interface ValidateArticleOptions extends BuildArticleSchemaOptions {
  /** Check that `heroImage` exists (e.g. under `public/`). A path that fails
   *  this check is an error: a model once invented a plausible hero path that
   *  never existed, and the article shipped with a broken image. */
  heroImageExists?: (path: string) => boolean;
}

export function validateArticle(
  input: string | { frontmatter: Record<string, unknown>; body?: string },
  pack: DomainPack,
  opts: ValidateArticleOptions = {},
): ValidateArticleResult {
  const { frontmatter, body } =
    typeof input === 'string'
      ? parse(input)
      : { frontmatter: input.frontmatter, body: input.body ?? '' };

  const schema = buildArticleSchema(pack, opts);
  const parsed = schema.safeParse(frontmatter);
  if (parsed.success) {
    const hero = parsed.data.heroImage;
    if (hero && opts.heroImageExists && !/^https?:\/\//.test(hero) && !opts.heroImageExists(hero)) {
      return { ok: false, body, errors: [{ path: 'heroImage', message: `heroImage "${hero}" does not exist` }] };
    }
    return { ok: true, data: parsed.data, body, errors: [] };
  }
  return {
    ok: false,
    body,
    errors: parsed.error.issues.map((i: ZodIssue) => ({
      path: i.path.join('.') || '(root)',
      message: i.message,
    })),
  };
}
