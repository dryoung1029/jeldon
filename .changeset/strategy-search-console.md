---
"@jeldon/strategy": minor
"@jeldon/config": patch
---

Two new strategy rules read Search Console signals: `sc-striking-distance` (queries at positions 5–15) and `sc-low-ctr` (page-1 URLs well under the expected CTR for their position, linking to the snippet lab). Pass `searchConsole: { strikingDistance, lowCtr, lowCtrRatio }` in `StrategyInput`, built with `@jeldon/search-console`'s `strikingDistance` / `lowCtr`; without it both rules produce nothing. Copy templates and the `snippetLab` deep-link are in `defaultStrategyConfig`.
