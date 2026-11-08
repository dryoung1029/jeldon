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

Bump the `vitest` test-runner devDependency from 2.1 to 5.1 (three major
versions) across every engine package, with an explicit `vite@^8.3.6`
devDependency to satisfy vitest 5's peer requirement (vitest 5 needs vite's
`./module-runner` export, not present before vite 6.4). No test file changes
were needed — this workspace uses plain `describe`/`it`/`expect`, no
`vi.mock`/`vi.hoisted`/`mockReset`, no config file, no `@vitest/ui`. Verified
with a full `pnpm build` + `typecheck` + `test` pass (15/15, 21/21, 21/21).

Clears 21 of the 26 `pnpm audit` findings from a security/platform audit pass
— every critical, moderate, and low-severity advisory in the dev/build
toolchain (vite, vitest, @vitest/mocker, tinypool, esbuild, postcss,
source-map-js), including two critical prototype-pollution-to-RCE advisories
in `tinypool`.
