import { defaultAnalyticsConfig, defaultLeadsConfig, type AnalyticsConfig } from '@jeldon/config';
import { classifyReferer } from '@jeldon/crawler-analytics';

export interface ChannelInput {
  utm?: Record<string, string>;
  /** Flat alias some stores use. */
  utmSource?: string;
  referrer?: string;
  landingPage?: string;
}

/**
 * The acquisition channel of a lead, through the SAME classifier the traffic
 * panels use, so a conversion breakdown lines up with the reach numbers.
 *
 *   1. UTM source (exact token rules first, then host rules),
 *   2. else the referrer hostname,
 *   3. else, if a landing page was captured, the direct label,
 *   4. else `unknownLabel`: the lead predates attribution capture. That is
 *      "no data", not "direct", and is labelled so.
 *
 * A referrer on one of our own hosts classifies as internal navigation
 * (`null` from the classifier); for a FIRST touch that means the visitor
 * arrived without an external referrer, so it reads as direct.
 */
export function leadChannel(
  attr: ChannelInput,
  analytics: Pick<AnalyticsConfig, 'refererChannelMap' | 'directLabel' | 'ownHosts'> = defaultAnalyticsConfig,
  unknownLabel: string = defaultLeadsConfig.unknownChannelLabel,
): string {
  const map = analytics.refererChannelMap;
  const direct = analytics.directLabel;
  const own = analytics.ownHosts ?? [];
  const utmSource = attr.utm?.utm_source || attr.utmSource;
  if (utmSource) return classifyReferer(utmSource, map, direct, own) ?? direct;
  if (attr.referrer) return classifyReferer(attr.referrer, map, direct, own) ?? direct;
  return attr.landingPage ? direct : unknownLabel;
}
