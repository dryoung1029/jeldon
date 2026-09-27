import { defineConfig } from 'tsup';

// Two entry points. `index` is isomorphic (types, schema, defaults, pure
// helpers); `load` is Node-only (jiti + node:fs). Splitting keeps the shared
// schema in one chunk while `dist/index.js` never statically imports `node:*`
// — the test in test/entrypoints.test.ts greps the dist to prove it.
export default defineConfig({
  entry: { index: 'src/index.ts', load: 'src/load.ts' },
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: true,
  sourcemap: false,
});
