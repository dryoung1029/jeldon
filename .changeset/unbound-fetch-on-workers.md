---
'@jeldon/store': patch
'@jeldon/amplify': patch
'@jeldon/crawler-analytics': patch
'@jeldon/drafting': patch
'@jeldon/media': patch
'@jeldon/ideation': patch
---

Never call `fetch` as a method. Cloudflare Workers throw "Illegal invocation" when the global `fetch` runs with a `this` other than `globalThis`, which broke every GitHubStore read and write on Workers. Stored fetch implementations are now wrapped in an arrow function (or called as a plain function), so the default and a caller-supplied bare `fetch` both work.
