import { build } from 'esbuild';
await build({
  entryPoints: ['server/index.ts', 'server/production.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outdir: 'dist/game',
  outExtension: { '.js': '.mjs' },
  sourcemap: true,
});
