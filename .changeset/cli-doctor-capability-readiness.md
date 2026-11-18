---
"@jeldon/cli": minor
---

`jeldon doctor` checks capability readiness: errors when `capabilities.audio` is on without `media.narration.voiceId` or the required `media.podcast` fields, or when `capabilities.competitiveIntel` is on without a `competitors` block; warns when hero images use the neutral default style, when `competitors.highValuePatterns` is unset, and when `engagementAnalytics` is on without a referer drop rule for the site's own host.
