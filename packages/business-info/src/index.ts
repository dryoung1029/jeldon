/**
 * @jeldon/business-info — opening hours.
 *
 * Ported from Body of Health `scripts/fetch-hours.mjs`, `src/lib/hours.ts`
 * and `src/components/OpenNow.astro` (holiday-hours merge 2026-11-11). The
 * schedule seed lives in `pack.brand.hours`, the Places credentials by env
 * name in `pack.services.places`, the timezone is `pack.content.timezone`.
 * The JSON-LD builder is `openingHoursSpecification` in @jeldon/schema-graph.
 * Pure and isomorphic apart from `fetchPlaceHours`, which takes an injected
 * `fetch`; no runtime import of @jeldon/config.
 */

export {
  DAY_NAMES,
  PLACE_DETAILS_ENDPOINT,
  buildRegularHours,
  googleSpecialDays,
  mergeSpecialHours,
  fetchPlaceHours,
  refreshHoursData,
  type GoogleCurrentOpeningHours,
  type PlacesHoursResult,
  type FetchPlaceHoursOptions,
} from './places.js';
export {
  zonedNow,
  zonedDate,
  hoursFromPack,
  isOpenNow,
  formatTime12,
  describeOpenStatus,
  defaultOpenStatusLabels,
  type ZonedNow,
  type HoursLike,
  type NextOpening,
  type OpenStatus,
  type OpenStatusLabels,
} from './hours.js';
export type { DayName, DayHours, HoursInterval, SpecialHours, HoursData } from '@jeldon/config';
