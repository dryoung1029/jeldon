import {
  defaultConversionConfig,
  defaultLeadsConfig,
  type AnalyticsConfig,
  type ConversionConfig,
  type DomainPack,
  type LeadsConfig,
} from '@jeldon/config';
import { analyticsConfigFromPack } from '@jeldon/crawler-analytics';

export interface LeadsOptions {
  leads: LeadsConfig;
  conversion: ConversionConfig;
  /** With `brand.siteUrl`'s host added to `ownHosts`. */
  analytics: AnalyticsConfig;
  /** The business timezone. `content.timezone`: the same calendar the site
   *  publishes on is the one its enquiries and bookings happen on. */
  timezone: string;
}

/** Resolve every leads option from a pack, with generic defaults. */
export function leadsOptionsFromPack(
  pack: Pick<DomainPack, 'brand' | 'content'> & Partial<Pick<DomainPack, 'leads' | 'conversion' | 'analytics'>>,
): LeadsOptions {
  return {
    leads: pack.leads ?? defaultLeadsConfig,
    conversion: pack.conversion ?? defaultConversionConfig,
    analytics: analyticsConfigFromPack(pack),
    timezone: pack.content.timezone,
  };
}
