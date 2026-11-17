/**
 * @jeldon/leads — the lead pipeline, domain-agnostic and pure.
 *
 * Attribution → channel → trends / conversion map → booking import. No
 * vertical copy, no booking-system logic (presets are header-pattern DATA),
 * no timezone literal (callers pass the business timezone). Mailbox response
 * tracking is compliance-pack material and lives in `@jeldon/leads/compliance`.
 */
export {
  sanitizeAttribution,
  sanitizePath,
  sanitizeReferrer,
  sanitizeUtmValue,
  sanitizeRequestVia,
  attributionSnippet,
  type Attribution,
  type RawAttribution,
} from './attribution.js';
export { leadChannel, type ChannelInput } from './channel.js';
export {
  buildTrends,
  bucketKeyFor,
  fillKeys,
  daysBetween,
  median,
  type TrendLead,
  type TrendPoint,
  type TrendSeries,
  type TrendResult,
  type BuildTrendsOptions,
  type Bucket,
  type DateBasis,
} from './trends.js';
export {
  buildConversionMap,
  conversionCell,
  normalizeSitePath,
  type PageViews,
  type ConversionLead,
  type Booking,
  type ConversionCell,
  type ConversionRow,
  type ConversionMap,
  type ConversionMapOptions,
} from './conversion.js';
export {
  normEmail,
  normPhone,
  hashId,
  hashBookingRow,
  automapColumns,
  presetById,
  parseCsv,
  parseBookingDate,
  sanitizeHashedRows,
  matchBookings,
  type HashedBookingRow,
  type ColumnMapping,
  type ImportLead,
  type BookingUpdate,
  type BookingImportSummary,
} from './booking-import.js';
export { requestContextFor, type RequestContextResult } from './request-context.js';
export { leadsOptionsFromPack, type LeadsOptions } from './pack.js';
export { calendarDate, zonedMidnight, type CalendarDate } from './time.js';
