/**
 * The kit runtime for pages: the kit config, resolved labels, the design
 * tokens CSS, and small helpers. Build-time only (it imports the Domain Pack).
 */
import { articlePathPrefix } from '@jeldon/config';
import { buildGlobalCss, complianceCopy, resolveLabels, resolveBooking } from '@jeldon/kit-local-business';
import { kit } from '../../kit.config';
import { pack } from './pack';

export { kit };

export const labels = resolveLabels(kit.vertical, kit.labels);
export const routes = kit.routes;
export const booking = resolveBooking(kit);
export const compliance = complianceCopy(pack.compliance?.pack, { contactHint: kit.contact.hint, articleDisclaimer: kit.copy?.articleDisclaimer });

// The blog route and the pack's article prefix are the same fact; fail the
// build loudly if they drift (doctor's kit:routes-match-pack check says it too).
if (routes.blog !== articlePathPrefix(pack)) {
  throw new Error(`kit.config.ts routes.blog (${routes.blog}) must equal jeldon.config.ts content.articlePathPrefix (${articlePathPrefix(pack)})`);
}

/** Inline global stylesheet, built from the pack's brand colors + fonts. */
export const globalCss = buildGlobalCss({ brandColors: pack.brand.brandColors, fonts: pack.brand.fonts, theme: kit.theme });

export const orgId = `${pack.brand.siteUrl.replace(/\/$/, '')}/#org`;

/** Hosted checkout for a plan key, else the contact page. */
export function planUrl(planKey?: string): string {
  if (!planKey) return routes.contact;
  return kit.booking.plans?.[planKey] || routes.contact;
}

/** Title-case a route's last segment when a label isn't configured. */
export function pageTitleFor(routeKey: keyof typeof routes): string {
  const explicit: Record<string, string | undefined> = {
    services: labels.services.plural,
    team: labels.team.plural,
    pricing: labels.pricing,
    schedule: labels.schedule,
    contact: labels.contact,
    primaryCta: labels.primaryCta.short,
    blog: labels.blog,
    faq: labels.faq,
    about: labels.about,
    members: labels.members,
  };
  const seg = routes[routeKey].replace(/\//g, '');
  return explicit[routeKey] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
}
