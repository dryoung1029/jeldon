# @jeldon/aeo-audit

## 0.1.1

### Patch Changes

- 90ade5c: Bump the `tsup` build-tool devDependency from 8.3 to 9.x across every engine
  package (one major version). No public API or build-output-format change for
  this simple `--format esm --dts --clean` usage; verified with a clean
  build + typecheck across all 15 packages. Part of a security/platform audit
  pass — tsup 9's bundled esbuild (^0.28.2) clears the low-severity
  GHSA-g7r4-m6w7-qqqr advisory flagged by `pnpm audit`.
- b653b6e: Bump the `vitest` test-runner devDependency from 2.1 to 5.1 (three major
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

- Updated dependencies [90ade5c]
- Updated dependencies [b653b6e]
- Updated dependencies [7eda101]
- Updated dependencies [d9cd81b]
  - @jeldon/config@0.2.0
