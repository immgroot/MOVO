import { spawn } from 'node:child_process';
const children = [
  spawn(
    process.execPath,
    ['--env-file-if-exists=.env', '--import', 'tsx', 'server/index.ts'],
    {
      stdio: 'inherit',
      windowsHide: true,
    },
  ),
  spawn(
    process.execPath,
    [
      'node_modules/vinext/dist/cli.js',
      'dev',
      '--host',
      '0.0.0.0',
      '--port',
      '3000',
    ],
    { stdio: 'inherit', windowsHide: true },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500).unref();
}
for (const child of children) {
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code) => stop(code ?? 0));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
