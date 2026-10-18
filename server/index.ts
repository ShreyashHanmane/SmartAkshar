import { resolve } from 'node:path';
import { createApp } from './app.ts';

/**
 * Starts AKSHAR locally. Binds to 127.0.0.1 only, so other computers on the
 * network can't reach it. Data lives in ./data (or AKSHAR_DATA_DIR).
 */
const port = Number(process.env.PORT ?? 5174);
const host = process.env.HOST ?? '127.0.0.1';
const dataDir = resolve(process.env.AKSHAR_DATA_DIR ?? 'data');
const distDir =
  process.env.AKSHAR_SERVE_DIST === '0' ? undefined : resolve(process.env.AKSHAR_DIST ?? 'dist');

const app = createApp({ dataDir, distDir, log: (m) => console.error(m) });
app.server.listen(port, host, () => {
  console.log(`AKSHAR is running at http://${host}:${port}  (data: ${dataDir})`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    app.close();
    process.exit(0);
  });
