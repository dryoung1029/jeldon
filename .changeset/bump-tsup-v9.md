---
"@jeldon/config": patch
"@jeldon/core-scoring": patch
"@jeldon/content-model": patch
"@jeldon/schema-graph": patch
"@jeldon/store": patch
"@jeldon/aeo-audit": patch
"@jeldon/verify": patch
"@jeldon/strategy": patch
"@jeldon/cli": patch
"@jeldon/drafting": patch
"@jeldon/amplify": patch
"@jeldon/media": patch
"@jeldon/competitive-intel": patch
"@jeldon/crawler-analytics": patch
"@jeldon/entity-presence": patch
---

Bump the `tsup` build-tool devDependency from 8.3 to 9.x across every engine
package (one major version). No public API or build-output-format change for
this simple `--format esm --dts --clean` usage; verified with a clean
build + typecheck across all 15 packages. Part of a security/platform audit
pass — tsup 9's bundled esbuild (^0.28.2) clears the low-severity
GHSA-g7r4-m6w7-qqqr advisory flagged by `pnpm audit`.
