---
'@jeldon/search-console': minor
---

New package, ported from Body of Health's Search Console cron and admin
endpoints. Service-account auth signs the RS256 JWT with WebCrypto, so it runs
in Workers (BoH used `node:crypto` `createSign`); the key is accepted as raw or
base64 JSON. Adds `fetchSearchAnalytics`, `fetchSnapshot`, `listSites`, pure
`strikingDistance` / `lowCtr` / `searchSignals` (curve and thresholds from
`pack.searchConsole`), the snippet lab (`applySnippetChange`,
`recordSnippetChange`, `compareSince`, limits from `scoring.seo`), and
`diagnoseSearchConsoleError` for the four look-alike setup failures. Unlike
BoH, a malformed baseline is stored as `null` rather than zeros, and an
unreadable snippet log is never overwritten.
