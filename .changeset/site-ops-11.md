---
"@jeldon/site-alert": minor
"@jeldon/access": minor
"@jeldon/business-info": minor
"@jeldon/config": minor
"@jeldon/schema-graph": minor
"@jeldon/cli": patch
---

Site ops: site alert, admin access, opening hours (port of Body of Health 2026-10/11).

- New `@jeldon/site-alert`: one admin-editable site-wide alert. Start/end are wall-clock strings in `content.timezone`, compared in the browser so a scheduled alert appears and expires without a rebuild (end inclusive to the minute). `messageHtml` escapes everything and links only `https://` URLs and email addresses. Dismissal is keyed per revision. `normalizeAlert` validates against `siteAlert.limits`. `waitForLiveVersion` polls the live homepage until it carries the saved revision, because the host serves the most recently completed build, not the newest commit.
- New `@jeldon/access`: `canonicalPath` (decode up to 3 times, `\` → `/`, strip `;params`, collapse `//`, resolve `.`/`..`, lowercase; null = protected), `isProtected` on both the canonical path and the matched route pattern, `verifyAccessJwt` (RS256 via WebCrypto, JWKS cache with one forced refetch on an unknown kid, iss/aud/exp/nbf; a token without `exp` is refused), and `createAccessMiddleware`, which answers 500 when `teamDomain`/`aud` are missing instead of passing through. Only an explicit `devBypass: true` skips it.
- New `@jeldon/business-info`: `fetchPlaceHours` behind an injected fetch, `mergeSpecialHours` (Google wins on a shared date, manual entries kept, past dates dropped, a null Google result leaves stored hours untouched, `[]` clears Google entries), `refreshHoursData` (`fetchedAt` vs `checkedAt`), and `isOpenNow` / `describeOpenStatus` in the business timezone (`unknown` when there are no hours).
- `@jeldon/config`: new optional `brand.contact`, `brand.hours`, `services.places`, `siteAlert`, `security`, `capabilities.siteAlert` / `businessHours`; `defaultSiteAlertConfig`, `defaultSecurityConfig`.
- `@jeldon/schema-graph`: `openingHoursSpecification` and `specialOpeningHoursSpecification`.
- `@jeldon/cli`: doctor warns when `security.access` is unset, and when the site-alert / hours capabilities are on without their pack data.
