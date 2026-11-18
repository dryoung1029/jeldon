---
"@jeldon/business-info": patch
"@jeldon/crawler-analytics": patch
"@jeldon/content-model": minor
"@jeldon/config": minor
---

Fixes from review:

- `buildRegularHours` splits a Google period that closes on a later day (e.g. Mon 22:00 → Tue 02:00) across the days it covers, so `isOpenNow` reports open during the whole shift.
- The engagement beacon accepts the homepage path `/`; homepage views and call/book taps were being dropped.
- **Breaking:** `content.topicClusters.pathPrefix` is removed and `clusterPath(id, prefix?)` takes the prefix as an argument (default `/articles/topic/`). The prefix is where the host's cluster route lives; a configurable prefix without a matching route produced links to pages that were never generated.
