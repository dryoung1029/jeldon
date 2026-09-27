import { defineConfig } from 'tsup';

// `index` is isomorphic (Worker-safe: the contact route imports it).
// `node` carries the fs/jiti pieces: loading kit.config.ts, the registered
// doctor checks, the workbench functions.
export default defineConfig({
  entry: { index: 'src/index.ts', node: 'src/node.ts' },
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: true,
});
