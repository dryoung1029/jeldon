import type { DomainPack, OrgProfile } from '@jeldon/config';
import { orgId, websiteId } from './url.js';
import type { JsonLd } from './types.js';

/** What `organizationGraph` needs from the pack — accepted either as a slice
 *  or as the whole DomainPack (the common call site). */
export interface OrgGraphInput {
  orgType: string[];
  org: OrgProfile;
  siteUrl: string;
  /** NAP block from `pack.brand.nap`, used to build the PostalAddress node. */
  nap?: DomainPack['brand']['nap'];
  /** Optional human-readable tagline → `slogan`. */
  tagline?: string;
}

function fromPack(input: OrgGraphInput | DomainPack): OrgGraphInput {
  if ('brand' in input && 'schema' in input) {
    return {
      orgType: input.schema.orgType,
      org: input.schema.org,
      siteUrl: input.brand.siteUrl,
      nap: input.brand.nap,
      tagline: input.brand.tagline,
    };
  }
  return input;
}

/**
 * The Organization (or MedicalBusiness/MedicalClinic, etc.) node — the
 * site-wide entity that every Article's `publisher` links to by @id.
 *
 * Ported from the inline `businessSchema` literal in BoH `BaseLayout.astro`.
 * Every BoH-specific value (`@type`, name, telephone, award, areaServed, geo,
 * hours, founder/employee, sameAs, medicalSpecialty) is now config:
 *   - `@type`          ← `pack.schema.orgType`  (generic `["Organization"]`
 *                          by default; `["MedicalBusiness","MedicalClinic"]`
 *                          for the health vertical)
 *   - name/url/logo/sameAs ← `pack.schema.org` (OrgProfile)
 *   - address          ← `pack.brand.nap`
 *   - everything else (award, areaServed, geo, hours, founder, employee,
 *     medicalSpecialty, priceRange, hasMap, …) ← `OrgProfile.extra`, merged
 *     verbatim so a vertical pack can stack arbitrary schema.org fields
 *     without an engine change.
 */
export function organizationGraph(input: OrgGraphInput | DomainPack): JsonLd {
  const { orgType, org, siteUrl, nap, tagline } = fromPack(input);
  const id = orgId(siteUrl);

  const node: JsonLd = {
    '@context': 'https://schema.org',
    '@type': orgType.length === 1 ? orgType[0] : orgType,
    '@id': id,
    name: org.name,
    url: org.url || siteUrl,
  };

  if (org.logoUrl) {
    node.logo = org.logoUrl;
    node.image = org.logoUrl;
  }
  if (tagline) node.slogan = tagline;

  if (nap && (nap.address || nap.city || nap.region || nap.postalCode)) {
    node.address = {
      '@type': 'PostalAddress',
      ...(nap.address ? { streetAddress: nap.address } : {}),
      ...(nap.city ? { addressLocality: nap.city } : {}),
      ...(nap.region ? { addressRegion: nap.region } : {}),
      ...(nap.postalCode ? { postalCode: nap.postalCode } : {}),
      addressCountry: 'US',
    };
  }
  if (nap?.phone) node.telephone = nap.phone;

  if (org.sameAs && org.sameAs.length) node.sameAs = org.sameAs;

  // Vertical-specific schema.org fields (areaServed, geo, award, hours,
  // founder, employee, medicalSpecialty, priceRange, hasMap, …) ride in via
  // `extra`. Merged last so a pack can also override a default above.
  if (org.extra) Object.assign(node, org.extra);

  return node;
}

/**
 * The WebSite node, linked to the org by `publisher`. Ported from BoH
 * `BaseLayout.astro::websiteSchema`. SearchAction is intentionally omitted
 * (Google deprecated the sitelinks searchbox Feb 2024).
 */
export function websiteGraph(input: OrgGraphInput | DomainPack): JsonLd {
  const { org, siteUrl } = fromPack(input);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': websiteId(siteUrl),
    url: org.url || siteUrl,
    name: org.name,
    publisher: { '@id': orgId(siteUrl) },
  };
}
