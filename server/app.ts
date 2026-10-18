import { createReadStream, existsSync, statSync } from 'node:fs';
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { type Db, openDb } from './db.ts';
import { EventHub } from './events.ts';
import { HttpError, sendJson } from './http.ts';
import { aiRun, aiStatus } from './ai/route.ts';
import type { AiProvider } from './ai/provider.ts';
import { type Ctx, match, matchFile, serveImage } from './routes.ts';
import { checkCsrf, setSecurityHeaders } from './security.ts';

export interface AppOptions {
  /** Folder holding akshar.db and uploaded files. */
  dataDir: string;
  /** Built front end to serve (production); omit in development (Vite serves it). */
  distDir?: string | undefined;
  /** Log unexpected errors and AI usage (metadata only, never request bodies). */
  log?: (message: string) => void;
  /** AI provider; null or omitted turns AI off ("Not configured"). */
  ai?: AiProvider | null;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(distDir: string, pathname: string, res: ServerResponse): boolean {
  const root = resolve(distDir);
  let rel: string;
  try {
    rel = normalize(decodeURIComponent(pathname));
  } catch {
    return false;
  }
  let file = join(root, rel);
  if (!file.startsWith(root)) return false;
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html'); // SPA fallback
  if (!existsSync(file)) return false;
  const immutable = file.includes(`${root}/assets/`);
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
  return true;
}

export function createApp(options: AppOptions): { server: Server; db: Db; hub: EventHub; close: () => void } {
  const db = openDb(join(options.dataDir, 'akshar.db'));
  const hub = new EventHub();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    setSecurityHeaders(res);
    const url = new URL(req.url ?? '/', 'http://localhost');
    const method = req.method ?? 'GET';
    try {
      if (url.pathname.startsWith('/api/')) {
        checkCsrf(req);
        const ctx: Ctx = {
          req,
          res,
          db,
          hub,
          dataDir: options.dataDir,
          params: {},
          query: url.searchParams,
          secure: false,
        };
        const image = method === 'GET' ? matchFile(url.pathname) : null;
        if (image) return serveImage(ctx, image);
        const aiCtx = { req, res, db, ai: options.ai ?? null, log: options.log };
        if (method === 'GET' && url.pathname === '/api/ai/status') return aiStatus(aiCtx);
        if (method === 'POST' && url.pathname === '/api/ai/run') return await aiRun(aiCtx);
        const found = match(method, url.pathname);
        if (!found) throw new HttpError(404, 'not-found');
        ctx.params = found.params;
        await found.handler(ctx);
        return;
      }
      if (
        (method === 'GET' || method === 'HEAD') &&
        options.distDir &&
        serveStatic(options.distDir, url.pathname, res)
      )
        return;
      throw new HttpError(404, 'not-found');
    } catch (error) {
      if (res.headersSent) return void res.end();
      if (error instanceof HttpError) return sendJson(res, error.status, { error: error.code });
      options.log?.(`error ${method} ${url.pathname}: ${error instanceof Error ? error.name : 'unknown'}`);
      sendJson(res, 500, { error: 'server' });
    }
  });

  return {
    server,
    db,
    hub,
    close: () => {
      hub.closeAll();
      server.close();
      db.close();
    },
  };
}
