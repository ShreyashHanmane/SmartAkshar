import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApiHandler } from '../server/app.ts';

let handler: ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | null = null;

function getHandler() {
  if (!handler) {
    const dataDir = process.env.AKSHAR_DATA_DIR || '/tmp/akshar_data';
    const api = createApiHandler({ dataDir });
    handler = api.handle;
  }
  return handler;
}

export default async function (req: IncomingMessage, res: ServerResponse) {
  const h = getHandler();
  return h(req, res);
}
