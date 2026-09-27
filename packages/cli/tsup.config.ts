import { defineConfig } from 'tsup';

// `index` is the bin; `answers` exposes the init answers Zod schema so the
// repo's gen-schema script can emit schemas/init-answers.schema.json.
export default defineConfig({
  entry: { index: 'src/index.ts', answers: 'src/init/answers.ts' },
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: true,
});
