import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { GeminiProvider } from './ai/gemini.ts';
import { createApp } from './app.ts';

/**
 * Starts AKSHAR locally. Binds to 127.0.0.1 only, so other computers on the
 * network can't reach it. Data lives in ./data (or AKSHAR_DATA_DIR).
 */
// Local settings and secrets (gitignored). Node's built-in loader; values stay in this process.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const port = Number(process.env.PORT ?? 5174);
// Loopback only: exposing the server to the network needs HTTPS and a deliberate decision (CLAUDE.md §7.2).
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);
const host = process.env.HOST ?? '127.0.0.1';
if (!LOOPBACK.has(host)) {
  console.error(`Refusing to listen on ${host}: AKSHAR only runs on this computer (127.0.0.1).`);
  process.exit(1);
}
const dataDir = resolve(process.env.AKSHAR_DATA_DIR ?? 'data');
const distDir =
  process.env.AKSHAR_SERVE_DIST === '0' ? undefined : resolve(process.env.AKSHAR_DIST ?? 'dist');

// AI is optional: only on when a Gemini key is configured.
const key = process.env.GEMINI_API_KEY?.trim();
const ai = key ? new GeminiProvider(key, process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash') : null;

const app = createApp({ dataDir, distDir, ai, log: (m) => console.error(m) });
app.server.listen(port, host, () => {
  console.log(`AKSHAR is running at http://${host}:${port}  (data: ${dataDir})`);
  console.log(
    ai
      ? 'AI: on (Gemini). Remember to set a budget alert in your Google AI account.'
      : 'AI: off (set GEMINI_API_KEY in .env.local to turn it on)',
  );
});

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    app.close();
    process.exit(0);
  });
