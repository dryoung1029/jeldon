import { articlePath } from '@jeldon/config';
import { absUrl } from './url.js';

export interface ArticleStub {
  slug: string;
  /** Stub/draft articles (ready, scheduled, or pure draft) are excluded so an
   *  indexed preview can't surface unfinished work. */
  isDraft: boolean;
}

/**
 * Build the set of `<articlePathPrefix><slug>/` URLs to exclude from the sitemap.
 *
 * Ported from BoH `astro.config.mjs::sitemapExcludedArticleUrls`. The original
 * coupled three things: (1) an `fs` walk of `src/content/articles`, (2) a
 * regex frontmatter parse, (3) the hardcoded `https://yourbodyofhealth.com`
 * origin. Here only (3) is this package's concern — the origin becomes
 * `siteUrl`, and the article slug/draft list is supplied by the caller (in the
 * host, that list comes from `@jeldon/content-model`'s frontmatter codec, which
 * owns the fs walk + parse — DECOUPLING-NOTES: "one frontmatter codec; the
 * sitemap filter imports it"). This keeps the URL-building pure and testable.
 */
export function sitemapExcludedArticleUrls(
  stubs: ArticleStub[],
  siteUrl: string,
  /** The article URL prefix — pass `pack.content.articlePathPrefix` (or the
   *  pack itself). Default `/articles/`. Helix finding #3. */
  prefix?: string | { content?: { articlePathPrefix?: string; noindexPaths?: string[] } },
): Set<string> {
  const pathPack = typeof prefix === 'string' ? { content: { articlePathPrefix: prefix } } : prefix;
  const out = new Set<string>();
  for (const a of stubs) {
    if (a.isDraft) out.add(absUrl(siteUrl, articlePath(pathPack, a.slug)));
  }
  // Pages the pack declares noindex never belong in the sitemap either (both
  // trailing-slash forms, since the host's `trailingSlash` setting decides).
  for (const p of pathPack?.content?.noindexPaths ?? []) {
    const bare = p.replace(/\/+$/, '');
    if (bare) out.add(absUrl(siteUrl, bare));
    out.add(absUrl(siteUrl, `${bare}/`));
  }
  return out;
}

/** A ready-to-use Astro `sitemap({ filter })` predicate built from the
 *  exclusion set. `page` is the absolute URL the sitemap integration passes. */
export function sitemapFilter(excluded: Set<string>): (page: string) => boolean {
  return (page: string) => !excluded.has(page);
}
