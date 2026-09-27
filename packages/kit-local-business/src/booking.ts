import type { KitConfig } from './kit-config.js';

/**
 * Booking / schedule adapters. `pushpress` renders a build-time class list
 * (via `fetchUpcomingClasses`) with the calendar iframe as fallback; `iframe`
 * embeds any hosted calendar; `link` just points at it (Jane, Mindbody, Zen
 * Planner: `link` for now — the adapter interface stays open). Host names are
 * recognized so `jeldon init` can pre-fill the kind from the old site.
 */
export interface BookingResolution {
  kind: KitConfig['booking']['kind'];
  calendarUrl: string | null;
  /** URL to put in an <iframe>, or null when not embeddable. */
  embedUrl: string | null;
  /** Whether a build-time class list is possible (PushPress API). */
  supportsBuildTimeClasses: boolean;
}

export function resolveBooking(kit: Pick<KitConfig, 'booking'>): BookingResolution {
  const b = kit.booking;
  const calendarUrl = b.calendarUrl ?? (b.pushpressSubdomain ? `https://${b.pushpressSubdomain}.pushpress.com/landing/calendar` : null);
  switch (b.kind) {
    case 'pushpress':
      return { kind: b.kind, calendarUrl, embedUrl: b.embedUrl ?? (calendarUrl ? `${calendarUrl}?framed=1` : null), supportsBuildTimeClasses: true };
    case 'iframe':
      return { kind: b.kind, calendarUrl, embedUrl: b.embedUrl ?? calendarUrl, supportsBuildTimeClasses: false };
    case 'link':
      return { kind: b.kind, calendarUrl, embedUrl: null, supportsBuildTimeClasses: false };
    default:
      return { kind: 'none', calendarUrl: null, embedUrl: null, supportsBuildTimeClasses: false };
  }
}

export type BookingVendor = 'pushpress' | 'jane' | 'mindbody' | 'zenplanner' | 'wodify' | 'calendly' | 'acuity' | 'squarespace-scheduling' | 'gohighlevel' | null;

const VENDOR_HOSTS: Array<[RegExp, BookingVendor]> = [
  [/\.pushpress\.com$/i, 'pushpress'],
  [/\.janeapp\.com$/i, 'jane'],
  [/mindbodyonline\.com$/i, 'mindbody'],
  [/zenplanner\.com$/i, 'zenplanner'],
  [/wodify\.com$/i, 'wodify'],
  [/calendly\.com$/i, 'calendly'],
  [/acuityscheduling\.com$/i, 'acuity'],
  [/squarespace(scheduling)?\.com$/i, 'squarespace-scheduling'],
  [/leadconnectorhq\.com$|grow\.pushpress\.com$|gohighlevel\.com$/i, 'gohighlevel'],
];

/** Recognize a booking/checkout vendor from a URL host. */
export function bookingVendorOf(url: string): BookingVendor {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  for (const [re, v] of VENDOR_HOSTS) if (re.test(host)) return v;
  return null;
}

/** Suggest a booking kind for a vendor: PushPress gets the API path, everything
 *  else a link (embeds vary per vendor; the owner can switch to iframe). */
export function suggestBookingKind(vendor: BookingVendor): KitConfig['booking']['kind'] {
  return vendor === 'pushpress' ? 'pushpress' : vendor ? 'link' : 'none';
}
