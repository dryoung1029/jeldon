import type { KitConfig } from './kit-config.js';

/** schema.org `Service` node for a service page, provider linked by @id to the org. */
export function serviceNode(args: {
  siteUrl: string;
  orgId: string;
  route: string;
  slug: string;
  name: string;
  description: string;
  serviceType: string;
  areaServed?: string;
  price?: string;
}): Record<string, unknown> {
  const url = `${args.siteUrl.replace(/\/$/, '')}${args.route}${args.slug}/`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: args.name,
    serviceType: args.serviceType,
    description: args.description,
    provider: { '@id': args.orgId },
    ...(args.areaServed ? { areaServed: args.areaServed } : {}),
    url,
    ...(args.price ? { offers: { '@type': 'Offer', priceCurrency: 'USD', description: args.price } } : {}),
  };
}

/** Human "areaServed" from the kit address. */
export function areaServedOf(kit: Pick<KitConfig, 'site'>): string | undefined {
  const a = kit.site.address;
  if (!a?.city) return undefined;
  return a.region ? `${a.city}, ${a.region}` : a.city;
}
