import type { PersonProfile } from '@jeldon/config';
import { orgId } from './url.js';
import type { JsonLd } from './types.js';

export interface PersonGraphInput {
  /** Stable schema @id every Article links to via author/reviewedBy. */
  schemaId: string;
  profile: PersonProfile;
  /** Site origin — used to link `worksFor` to the org node. */
  siteUrl: string;
  /** schema.org @type(s). Default `["Person"]`; the health vertical uses
   *  `["Person","Physician"]`. From `pack.schema` callers can pass orgType-
   *  analog; defaults keep it generic. */
  type?: string[];
}

/**
 * The author/practitioner entity node. Ported from the inline `personSchema`
 * literal on BoH `src/pages/team/jason-young.astro`.
 *
 * The contract's typed PersonProfile fields map to schema.org first-class:
 *   jobTitle, image, knowsAbout, alumniOf, memberOf, awards→award, sameAs,
 *   credential→description-adjacent. Anything richer the BoH literal carried
 *   (hasCredential, availableService, identifier, affiliation, areaServed,
 *   hasOccupation, honorificPrefix/Suffix, medicalSpecialty) rides in via
 *   `PersonProfile.extra`, merged verbatim — so the YMYL/Physician shape is a
 *   pack concern, never engine code.
 */
export function personGraph(input: PersonGraphInput): JsonLd {
  const { schemaId, profile, siteUrl } = input;
  const type = input.type ?? ['Person'];

  const node: JsonLd = {
    '@context': 'https://schema.org',
    '@type': type.length === 1 ? type[0] : type,
    '@id': schemaId,
    name: profile.name,
  };

  if (profile.jobTitle) node.jobTitle = profile.jobTitle;
  if (profile.url) node.url = profile.url;
  if (profile.image) node.image = profile.image;
  if (profile.knowsAbout && profile.knowsAbout.length) node.knowsAbout = profile.knowsAbout;
  if (profile.alumniOf && profile.alumniOf.length) {
    node.alumniOf = profile.alumniOf.map((name) => ({ '@type': 'CollegeOrUniversity', name }));
  }
  if (profile.memberOf && profile.memberOf.length) {
    node.memberOf = profile.memberOf.map((name) => ({ '@type': 'Organization', name }));
  }
  if (profile.awards && profile.awards.length) node.award = profile.awards;
  if (profile.sameAs && profile.sameAs.length) node.sameAs = profile.sameAs;

  // Link the practitioner to the business entity for E-E-A-T consolidation.
  node.worksFor = { '@id': orgId(siteUrl) };

  // Vertical-specific fields (hasCredential, availableService, identifier,
  // affiliation, areaServed, medicalSpecialty, honorific*, hasOccupation, …)
  // ride in via `extra`. Merged last so a pack can override a default above.
  if (profile.extra) Object.assign(node, profile.extra);

  return node;
}
