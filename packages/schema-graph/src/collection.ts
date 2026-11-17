import type { JsonLd } from './types.js';
import { absUrl, orgId } from './url.js';

/**
 * CollectionPage + ItemList for a topic-cluster page. Ported from BoH
 * `src/pages/articles/topic/[cluster].astro`, with the site, blog name and
 * publisher read from inputs instead of literals.
 */
export interface CollectionPageInput {
  name: string;
  description: string;
  /** Path or absolute URL of this page. */
  path: string;
  siteUrl: string;
  /** The listing this page belongs to, e.g. { name: "Articles", path: "/articles/" }. */
  partOf?: { name: string; path: string };
  items: Array<{ name: string; path: string }>;
}

export function collectionPageGraph(input: CollectionPageInput): JsonLd {
  const node: JsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: input.name,
    description: input.description,
    url: absUrl(input.siteUrl, input.path),
    publisher: { '@id': orgId(input.siteUrl) },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: input.items.length,
      itemListElement: input.items.map((it, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: absUrl(input.siteUrl, it.path),
        name: it.name,
      })),
    },
  };
  if (input.partOf) node.isPartOf = { '@type': 'Blog', name: input.partOf.name, url: absUrl(input.siteUrl, input.partOf.path) };
  return node;
}
