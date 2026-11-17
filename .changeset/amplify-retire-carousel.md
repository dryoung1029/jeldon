---
"@jeldon/amplify": minor
"@jeldon/config": minor
---

Retire the in-page carousel builder and add the pieces Body of Health replaced it with.

- **Removed:** `generateCarousel`, `CarouselSidecarStore` and their types, plus the `amplify.carouselSchemes`, `amplify.carouselGuidance` and `amplify.carouselStateDir` pack fields and the `CarouselScheme` type. Old keys in a pack are now ignored by validation.
- **Added `importToCarouselStudio()`:** a server-side hand-off to an external carousel studio, following the studio import contract (POST `/api/import-article` with a CF Access service token; upsert by `<prefix>-<slug>`). Configured by the new optional `amplify.carouselStudio`. Failures come back as explicit codes (`NOT_CONFIGURED`, `TIMEOUT`, `UNREACHABLE`, `BAD_UPSTREAM`, `UPSTREAM_ERROR`); an HTML auth page is never read as success.
- **Added the reel-script channel** (`reelScript`: spoken wording only, three hook options, ~260–320 words) and `amplify.ctaPolicy`, which injects an education-only CTA rule for the channels it names.
- **Added `scheduleArticleNewsletter()`** ("Queue in Brevo"): refuses drafts, already-queued and already-sent articles; schedules at the cron's `nextSendSlot` in `content.timezone` (configurable via `amplify.newsletter`); records the campaign in frontmatter, and leaves a failed send-now `queued` with `newsletterError`.
