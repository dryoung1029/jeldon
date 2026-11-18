/**
 * @jeldon/site-alert — one admin-editable, site-wide alert.
 *
 * Ported from Body of Health `src/lib/site-alert.ts` (2026-11-17). Pure and
 * isomorphic (no env, no IO, no runtime import of @jeldon/config), so the
 * admin API, the admin page, the public component's browser script and tests
 * all share it. The timezone, contact email, limits and preset copy come from
 * the Domain Pack (`content.timezone`, `brand.contact`, `siteAlert`).
 */

export { isWallClock, wallClockIn, wallParts, addDays, type WallParts } from './wall-clock.js';
export {
  EMPTY_ALERT,
  alertState,
  formatWall,
  autoLabel,
  displayLabel,
  dismissalKey,
  normalizeAlert,
  stampAlert,
  parseStoredAlert,
  presetAlerts,
  type SiteAlert,
  type AlertState,
} from './alert.js';
export { messageHtml, escapeHtml } from './html.js';
export {
  ALERT_TEMPLATE_ID,
  ALERT_REVISION_ATTR,
  homepageShows,
  waitForLiveVersion,
  type AlertVersion,
  type LiveResult,
  type WaitOptions,
} from './live.js';
