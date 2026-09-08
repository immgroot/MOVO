import { build } from 'esbuild';
await build({
  entryPoints: ['qa/polish-server.ts'],
  outfile: '.data/fixture-server.mjs',
  platform: 'node',
  target: 'node24',
  format: 'esm',
  bundle: true,
  packages: 'external',
});
await build({
  entryPoints: ['qa/full-match.ts'],
  outfile: '.data/full-match.mjs',
  platform: 'node',
  target: 'node24',
  format: 'esm',
  bundle: true,
  packages: 'external',
});
