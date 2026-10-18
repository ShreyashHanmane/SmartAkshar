import { spawn } from 'node:child_process';

/**
 * Development: runs the local API server (port 5174, data in ./data) and the
 * Vite dev server (which proxies /api to it). Ctrl+C stops both.
 */
const children = [
  spawn(process.execPath, ['--watch-path=server', '--watch-path=src/shared', 'server/index.ts'], {
    stdio: 'inherit',
    env: { ...process.env, AKSHAR_SERVE_DIST: '0' },
  }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }),
];

const stop = () => {
  for (const child of children) child.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) child.on('exit', (code) => code && stop());
