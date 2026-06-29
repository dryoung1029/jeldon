import { absUrl } from './url.js';
import type { Crumb, JsonLd } from './types.js';

/**
 * Ported from Body of Health `src/lib/schema.ts::breadcrumbList`. The only
 * domain coupling — the hardcoded `SITE` constant — becomes the `siteUrl`
 * argument so relative crumb paths resolve against the project's origin.
 */
export function breadcrumbList(crumbs: Crumb[], siteUrl: string): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: absUrl(siteUrl, c.url),
    })),
  };
}
