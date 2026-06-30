---
"@jeldon/config": minor
---

Add an optional `content.tags` curated tag vocabulary to the Domain Pack. When
set, the article generator (`@jeldon/drafting`) draws an article's tags from this
list — and backfills by relevance — so every draft lands in the SEO
`scoring.seo.tags` band and the site's taxonomy stays consistent for topic
clustering. Omit or leave empty to let the generator invent free-form tags. The
JSON Schema (`schemas/domain-pack.schema.json`) is regenerated accordingly.
