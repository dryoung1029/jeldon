---
"@jeldon/cli": minor
---

Add the `jeldon check-geo-floor [file…]` subcommand. It scores articles with the
same `@jeldon/core-scoring` the editor dial uses (no mirrored scoring logic) and
exits non-zero if any live article is below its category target — the GEO floor
is the backstop for categories with no explicit target. With no file arguments it
scans every `.md` under `services.contentDir` (default `src/content/articles`);
drafts are skipped. `--json` emits a machine-readable report. This promotes the
template's `check-geo-floor.mjs` CI step to a first-class command so consumers can
drop the script.
