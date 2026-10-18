import { mkdirSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from '../../server/app.ts';
import type { AiProvider } from '../../server/ai/provider.ts';

/** Starts a server on a random port with a fresh data folder inside the project. */
export async function startServer(options: { ai?: AiProvider; log?: (m: string) => void } = {}) {
  const dataDir = resolve('.tmp-test', randomBytes(6).toString('hex'));
  mkdirSync(dataDir, { recursive: true });
  const app = createApp({
    dataDir,
    ...(options.ai ? { ai: options.ai } : {}),
    ...(options.log ? { log: options.log } : {}),
  });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  return {
    base,
    dataDir,
    app,
    stop: () => {
      app.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/** A tiny API client that keeps its own session cookie. */
export class Client {
  cookie = '';
  base: string;
  constructor(base: string) {
    this.base = base;
  }

  async raw(
    method: string,
    path: string,
    init: { body?: BodyInit; headers?: Record<string, string>; csrf?: boolean } = {},
  ) {
    const res = await fetch(this.base + path, {
      method,
      body: init.body ?? null,
      headers: {
        ...(init.csrf === false ? {} : { 'X-Akshar': '1' }),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...init.headers,
      },
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0] ?? '';
    return res;
  }

  json(method: string, path: string, body?: unknown, extra: { csrf?: boolean } = {}) {
    return this.raw(method, path, {
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
      ...extra,
    });
  }

  async signUp(username: string, password = 'study1234', name = username, starter = false) {
    const res = await this.json('POST', '/api/auth/signup', { name, username, password, starter });
    if (res.status !== 201) throw new Error(`signup failed ${res.status}`);
    return this;
  }
}

export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export const dataPath = (dataDir: string, ...parts: string[]) => join(dataDir, ...parts);
