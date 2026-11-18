---
"@jeldon/config": minor
"@jeldon/crawler-analytics": minor
"@jeldon/aeo-audit": patch
"@jeldon/amplify": patch
---

Per-route traffic, a path-keyed engagement beacon, Web Vitals diagnostics, and no Body of Health values left in the analytics defaults.

- `normalizeSitePath()` is the one key for a site route (empty → `null`, never the homepage; excluded prefixes and file paths → `null`). Configured by the new `analytics.sitePath`.
- `aggregateDayDetail()` now returns `pageHits` (every successful route load, human/bot), with `upsertPageTrafficDay` / `getPageTraffic` / `pageTrafficDates` for the rolling store. This is the denominator for conversion reporting.
- `parseEngagementBeacon()` accepts `{ path }` beacons from non-article pages, keyed by `normalizeSitePath` so they join with per-route traffic; a leading `/` marks a page. The template ships `PageAnalytics.astro`.
- `CloudflareAnalytics.fetchWebVitals()` returns `ok`, `no-rows` (query worked, nothing recorded), or `unattestable` with the reason and the RUM types / fields the schema actually exposes. Type and dataset names are `analytics.webVitals`.
- **Behavior change:** `defaultAnalyticsConfig.cloudflare` no longer carries Body of Health's zone and account ids; set yours in `pack.analytics.cloudflare`. `dateKey`, `localDateKey` and `BrevoClient.nextSendSlot` default to UTC instead of America/Los_Angeles; pass `pack.content.timezone`.
