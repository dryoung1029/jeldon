---
"@jeldon/config": minor
---

`defaultMediaConfig` no longer carries Body of Health values. `narration.voiceId`, `narration.outroText` and the podcast identity fields (`title`, `subtitle`, `description`, `author`, `ownerEmail`, `category`, `coverImage`) are blank, the trailer and copyright are gone, `pronunciationOverrides` is empty, `abbreviationExpansions` keeps only the unit expansions, and the hero `promptTemplate` / `proposalSystem` are neutral (the art-director prompt reads `{BRAND}` / `{PERSONA}` at call time). The analytics `refererChannelMap` no longer drops `yourbodyofhealth.com`; add your own host's drop rule. New `capabilityReadiness(pack)`, `missingPodcastFields(cfg)` and `REQUIRED_PODCAST_FIELDS` report pack fields an enabled capability needs. A project that relied on the old values sets `pack.media` explicitly; the old block is in `fixtures/domain-packs/body-of-health.media.ts`.
