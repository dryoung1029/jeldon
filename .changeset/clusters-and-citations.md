---
"@jeldon/config": minor
"@jeldon/content-model": minor
"@jeldon/schema-graph": minor
"@jeldon/aeo-audit": minor
"@jeldon/cli": patch
---

Topic clusters and "who was cited instead of us".

- **Topic clusters:** new `content.topicClusters` (curated tags + series + slug hints). `@jeldon/content-model` adds `articleClusterIds` (slug hints match whole hyphen segments, so "hip" does not match "c-hip-ractic"), `liveClusterIds`, `clusterPages` (a page only with at least `minLiveArticles` live members, default 2) and `clusterPath`. `@jeldon/schema-graph` adds `collectionPageGraph` (CollectionPage + ItemList). The template ships `/articles/topic/[cluster]` and "More on" links from each article to its built clusters. `jeldon doctor` checks cluster titles and descriptions against the SEO length bands, since the static-page gate can't see dynamic routes.
- **AEO citations:** each engine result now records `citations[]` (the answer's top links as `{url, rank, host, kind, who?, list?}`, kind = us / competitor / directory / reddit / other). Competitor hosts come from `competitorHostsFromRoster(pack.competitors.roster)`; directory hosts and the list-URL pattern are the new `aeo.citations` (default `defaultAeoCitationConfig`). "Win the query" action items carry `citedInstead`, merged across engines, or `'not-recorded'` on older snapshots. Ported from Body of Health commit e09c9a7, which was still awaiting merge there when this shipped.
