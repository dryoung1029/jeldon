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
export function validateArticle(
  input: string | { frontmatter: Record<string, unknown>; body?: string },
  pack: DomainPack,
  opts: BuildArticleSchemaOptions = {},
): ValidateArticleResult {
  const { frontmatter, body } =
    typeof input === 'string'
      ? parse(input)
      : { frontmatter: input.frontmatter, body: input.body ?? '' };

  const schema = buildArticleSchema(pack, opts);
  const parsed = schema.safeParse(frontmatter);
  if (parsed.success) {
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
