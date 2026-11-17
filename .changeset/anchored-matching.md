---
"@jeldon/config": minor
"@jeldon/crawler-analytics": minor
"@jeldon/aeo-audit": minor
"@jeldon/strategy": minor
"@jeldon/entity-presence": patch
---

Anchor every host and term match; substring matching produced wrong answers that looked right.

- New shared matchers in `@jeldon/config`: `hostOf`, `hostIs` (exact or parent domain), `termRegex`, `mentionsTerm` (whole term, optional periods, generic-phrase exclusions).
- **Breaking:** `analytics.refererChannelMap` rules take `hosts` / `hostPatterns` / `utmSources` / `hostContains` instead of substring `needles`; validation rejects `needles` with a migration message (see docs/MIGRATION.md). Defaults rewritten and gain Claude, Copilot, Pinterest and Nextdoor; `redd.it` maps to Reddit. Own-domain navigation is dropped through the new `analytics.ownHosts`, which `analyticsConfigFromPack()` fills from `brand.siteUrl` — the brand literal is gone from the defaults.
- `botUaPattern` default uses `pinterestbot` and `duckduckbot|duckassist`, so the Pinterest in-app browser and the DuckDuckGo browser count as humans.
- AEO audit: citations count when the URL's hostname is ours (not a substring), brand mentions match as whole terms ("dr young" no longer matches "Dr. Younger"), new `aeo.brandMentionExclusions` strips generic phrasings, and each engine result records `redditCitations` ({url, rank}). New export `citationsOnHost()`.
- **Breaking:** `strategy.refererGroups` entries are exact channel labels; the social group now includes Reddit, Pinterest and Nextdoor, and search no longer counts Google Business.
- Entity presence classifies sources by hostname and checks NAP fields as whole terms.
