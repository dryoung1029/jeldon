import type { ArticleSchemaPolicy, DomainPack } from '@jeldon/config';
import { articlePath, authorPath } from '@jeldon/config';
import { absUrl, orgId } from './url.js';
import type { ArticleInput, AuthorEntry, JsonLd } from './types.js';

export interface ArticleGraphOptions {
  /** schema.org @type(s) for the article. From `pack.schema.articleTypes`.
   *  Default `["Article"]`; YMYL packs use `["Article","MedicalWebPage"]`. */
  articleTypes?: string[];
  /** Per-domain article-graph policy (reviewer @id, review dates, etc.). */
  schemaPolicy?: ArticleSchemaPolicy;
  siteUrl: string;
  /** Article URL prefix (`pack.content.articlePathPrefix`). Default `/articles/`. */
  articlePathPrefix?: string;
  /** Author page URL prefix used for the inline-Person fallback when the
   *  author slug matches no entry (`authors[].urlPrefix`). Default `/team/`. */
  authorUrlPrefix?: string;
}

function toIso(d: string | Date): string {
  return (d instanceof Date ? d : new Date(d)).toISOString();
}

function resolveOptions(
  arg: ArticleGraphOptions | DomainPack,
): Required<Pick<ArticleGraphOptions, 'siteUrl'>> & ArticleGraphOptions {
  if ('brand' in arg && 'schema' in arg) {
    return {
      siteUrl: arg.brand.siteUrl,
      articleTypes: arg.schema.articleTypes,
      schemaPolicy: {
        publishingPrinciplesUrl:
          arg.schema.articleGraph?.publishingPrinciplesUrl ?? arg.schema.publishingPrinciplesUrl,
        ...arg.schema.articleGraph,
      },
      articlePathPrefix: arg.content?.articlePathPrefix,
      authorUrlPrefix: (arg.authors.find((a) => a.isPrimary) ?? arg.authors[0])?.urlPrefix,
    };
  }
  return arg;
}

/**
 * The Article schema node, linked to the publisher org + author entity by @id.
 *
 * Ported from the inline `articleSchema` literal in BoH
 * `src/pages/articles/[...slug].astro`. Every BoH-specific value is now config
 * or input:
 *   - `@type`               ← `pack.schema.articleTypes`
 *   - publisher @id         ← derived from `siteUrl`
 *   - author                ← matched against `authors` by `authorSlug`; a
 *                             match links by `@id` (E-E-A-T consolidation),
 *                             else an inline `Person` is emitted
 *   - reviewedBy/lastReviewed/publishingPrinciples ← `schemaPolicy`
 *     (OPT-IN; the YMYL medical-review trust graph is a pack concern, not
 *     baked into the engine)
 *   - ImageObject dimensions ← `schemaPolicy.heroImageDimensions`
 *   - isBasedOn PodcastEpisode ← present only when `article.sourceEpisode` set
 */
export function articleGraph(
  article: ArticleInput,
  authors: AuthorEntry[],
  options: ArticleGraphOptions | DomainPack,
): JsonLd {
  const opts = resolveOptions(options);
  const { siteUrl } = opts;
  const articleTypes = opts.articleTypes ?? ['Article'];
  const policy = opts.schemaPolicy ?? {};

  const published = toIso(article.publishDate);
  const modified = article.updatedDate ? toIso(article.updatedDate) : published;
  const pathPack = { content: { articlePathPrefix: opts.articlePathPrefix } };
  const canonical = absUrl(siteUrl, articlePath(pathPack, article.slug));

  // Author: link by @id when the slug matches a known author entity.
  const matched = authors.find((a) => a.slug === article.authorSlug);
  const authorRef: JsonLd = matched
    ? { '@id': matched.schemaId }
    : {
        '@type': 'Person',
        name: article.author,
        url: absUrl(siteUrl, authorPath({ urlPrefix: opts.authorUrlPrefix }, article.authorSlug)),
      };

  const node: JsonLd = {
    '@context': 'https://schema.org',
    '@type': articleTypes.length === 1 ? articleTypes[0] : articleTypes,
    headline: article.title,
    description: article.excerpt,
    datePublished: published,
    dateModified: modified,
    author: authorRef,
    publisher: { '@id': orgId(siteUrl) },
    mainEntityOfPage: canonical,
  };

  // Medical-review trust graph — opt-in via policy.
  if (policy.reviewerSchemaId) {
    node.reviewedBy = { '@id': policy.reviewerSchemaId };
    if (policy.emitLastReviewed !== false) {
      node.lastReviewed = modified.slice(0, 10);
    }
  }
  if (policy.publishingPrinciplesUrl) {
    node.publishingPrinciples = policy.publishingPrinciplesUrl;
  }

  if (article.heroImage) {
    const dims = policy.heroImageDimensions;
    node.image = {
      '@type': 'ImageObject',
      url: absUrl(siteUrl, article.heroImage),
      caption: article.heroImageAlt ?? article.title,
      ...(dims ? { width: dims.width, height: dims.height } : {}),
    };
  }

  if (article.categoryLabel) node.articleSection = article.categoryLabel;
  if (article.tags.length) node.keywords = article.tags.join(', ');

  if (article.sourceEpisode) {
    node.isBasedOn = {
      '@type': 'PodcastEpisode',
      url: article.sourceEpisode,
      ...(policy.sourceEpisodeSeriesName
        ? {
            partOfSeries: {
              '@type': 'PodcastSeries',
              name: policy.sourceEpisodeSeriesName,
            },
          }
        : {}),
    };
  }

  return node;
}
