import { absUrl } from './url.js';

export interface ArticleStub {
  slug: string;
  /** Stub/draft articles (ready, scheduled, or pure draft) are excluded so an
   *  indexed preview can't surface unfinished work. */
  isDraft: boolean;
}

/**
 * Build the set of `/articles/<slug>/` URLs to exclude from the sitemap.
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
export function sitemapExcludedArticleUrls(stubs: ArticleStub[], siteUrl: string): Set<string> {
  const out = new Set<string>();
  for (const a of stubs) {
    if (a.isDraft) out.add(absUrl(siteUrl, `/articles/${a.slug}/`));
  }
  return out;
}

/** A ready-to-use Astro `sitemap({ filter })` predicate built from the
 *  exclusion set. `page` is the absolute URL the sitemap integration passes. */
export function sitemapFilter(excluded: Set<string>): (page: string) => boolean {
  return (page: string) => !excluded.has(page);
}
