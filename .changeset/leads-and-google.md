---
"@jeldon/leads": minor
"@jeldon/google": minor
"@jeldon/config": minor
---

Port the Body of Health lead pipeline and Google service-account mail as two new packages.

- `@jeldon/leads` (new): first-touch attribution (`sanitizeAttribution` keeps a path-only landing page, a hostname-only referrer, whitelisted UTM keys and a clamped phone-tap count; `attributionSnippet` is the layout script), `leadChannel` through the hostname-anchored `classifyReferer`, `buildTrends` (date basis `lead|booking`, business-timezone calendar buckets, Monday weeks, `maturing` from the median lead→booking lag, `maturity: 'unknown'` when nothing has booked), `buildConversionMap` (views → leads → booked per page and channel; cells under `conversion.minLeads` are `lowSample`, never hidden or zeroed; no leads = `rate: null`), and the booking import (`normEmail`, `normPhone`, `hashId`, `hashBookingRow`, `sanitizeHashedRows`, `matchBookings`, `automapColumns` over preset data). `requestContextFor` reads `conversion.requestContexts`.
- `@jeldon/leads/compliance` (new subpath, compliance-pack material): mailbox response tracking. `createMailboxTracker` throws unless `compliance.pack` is not `none` and `compliance.mailbox.enabled` is true. Text is reduced to rule codes and never returned; the system's own notification is excluded from replies and from classification; decline reasons are only read after a decline; `reachedVia` ranks booked > email > phone tap > worked.
- `@jeldon/google` (new): `parseServiceAccount`, `getAccessToken` (WebCrypto RS256, domain-wide delegation `sub`, token cache, injected fetch, named `unauthorized_client` / `invalid_grant` errors), `buildRawEmail` (flattened headers, padded RFC 2047 encoded-words, exactly one blank line between headers and body), `sendRawEmail`.
- `@jeldon/config`: new optional pack sections `leads` and `conversion`, `compliance.mailbox`, capability flags `leads` and `conversionMap`; `defaultLeadsConfig` (generic and Jane column-header presets as data), `defaultConversionConfig`, `defaultMailboxOutcomeRules`.

Fixes over the BoH source: a date-only booking date (`YYYY-MM-DD`) is used as a business-calendar date instead of being parsed as UTC midnight, which filed bookings on the 1st under the previous month west of UTC; bucket ends are computed in the business timezone rather than UTC; RFC 2047 words keep their base64 padding and are split at 75 characters; the landing page drops its query string.
