/**
 * @jeldon/kit-local-business — the Local Business Kit (isomorphic entry).
 *
 * Everything here is Worker-safe: no `node:*`. The contact route imports
 * from this entry. Node-only pieces (loading kit.config.ts, the registered
 * doctor checks, workbench functions) live in `@jeldon/kit-local-business/node`.
 */
export {
  type KitConfig, type KitRoutes, type PricingRow, type DayKey, type LeadSinkKind, type NotifierKind, type BookingKind,
  type KitValidateResult, DAY_KEYS, DEFAULT_ROUTES, kitConfigSchema, validateKitConfig, defineKitConfig, countSetupMarkers,
} from './kit-config.js';
export { LABEL_PRESETS, resolveLabels, type KitLabels, type LabelPair, type VerticalPreset } from './labels.js';
export { VERTICAL_SCORING, type VerticalScoringPreset } from './verticals.js';
export { buildGlobalCss, buildTokensCss, resolveTheme, shade, hexToHsl, hslToHex, contrastRatio, BASE_CSS, type TokenInput, type ResolvedTheme } from './tokens.js';
export { openingHoursSpec, to24h, type OpeningHoursSpecification } from './hours.js';
export {
  PUSHPRESS_API, isPushPressConfigured, fetchUpcomingClasses, createPushPressLead,
  type PushPressEnv, type UpcomingClass, type PushPressLeadInput, type PushPressLeadResult,
} from './pushpress.js';
export {
  handleContact, processContact, leadSinkFor, notifierFor, verifyTurnstile, clean, escapeHtml,
  pushpressSink, goHighLevelSink, brevoContactSink, noneSink, brevoNotifier, resendNotifier, noneNotifier,
  type ContactEnv, type Lead, type LeadSink, type Notifier, type SinkResult, type HandleContactOptions, type ContactOutcome,
} from './contact.js';
export { resolveBooking, bookingVendorOf, suggestBookingKind, type BookingResolution, type BookingVendor } from './booking.js';
export { planRedirects, renderRedirectsFile, renderOldUrlsDoc, pathOf, type RedirectRule, type RedirectPlan, type RedirectOptions } from './redirects.js';
export { serviceNode, areaServedOf } from './schema.js';
export { complianceCopy, type ComplianceCopy } from './compliance.js';
