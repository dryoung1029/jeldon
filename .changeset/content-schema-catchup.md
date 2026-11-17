---
"@jeldon/config": minor
"@jeldon/content-model": minor
"@jeldon/schema-graph": minor
"@jeldon/store": minor
"@jeldon/cli": minor
"@jeldon/drafting": patch
"@jeldon/aeo-audit": patch
---

Content, schema and ops catch-up from Body of Health.

- **content-model:** new `autonomous` frontmatter flag (provenance: written by an unattended pipeline) with `isAutonomousDraft` / `selectAutonomousDrafts`. `docReviewed` / `docNotes` and `content.lifecycle.docReviewed` are deprecated (still parsed and honored when enabled). New `videoUrl` / `videoTitle` / `videoUploadDate` fields and `parseYouTubeUrl` (watch, Shorts, youtu.be, embed, live, `t=` / `start=`). New `content.heroImagePathPrefixes` rejects hero paths outside the allowed prefixes, and `validateArticle(…, { heroImageExists })` rejects paths that don't exist.
- **schema-graph:** `videoObjectGraph()` emits a VideoObject only when the upload date is known (Google requires it).
- **store:** `getArticlesBulk(store, slugs)` reads through 6 lanes, retries only 429/5xx/network errors, and returns partial results with the failures listed.
- **cli:** `jeldon check-meta-length [file…]` checks `const title` / `const description` in hand-coded `.astro` pages against the article scorer's bands and rejects HTML entities. Configure roots with `scoring.seo.staticPages`.
- **drafting / aeo-audit:** draft prompts and "win the query" action items carry the extraction-first checklist (answer in sentences 1–3, query-literal title, liftable structured block).
