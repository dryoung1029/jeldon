---
'@jeldon/cli': minor
---

`jeldon doctor` checks Search Console setup when `searchConsole` is
configured: env names present and non-empty (an empty value is flagged as the
misspelled-GitHub-secret case, with similarly named vars listed), the key JSON
parses with `client_email`/`private_key`, and the property format is valid.
New `--online` flag (off by default) does a token exchange plus a 1-row query
and reports the diagnosed fix on failure. New `jeldon fetch-search-console`
command for the cron: skips with a `::warning::` when secrets are missing.
