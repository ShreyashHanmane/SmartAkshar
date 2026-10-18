import type { ServerResponse } from 'node:http';

/**
 * Server-sent events: tells a user's open tabs which data changed (topic names
 * only, never content) so they can refetch. Replaces Firestore live listeners.
 */
export class EventHub {
  private clients = new Map<string, Set<ServerResponse>>();

  add(userId: string, res: ServerResponse) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    res.write('retry: 2000\n\n');
    const set = this.clients.get(userId) ?? new Set();
    set.add(res);
    this.clients.set(userId, set);
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    res.on('close', () => {
      clearInterval(ping);
      set.delete(res);
      if (set.size === 0) this.clients.delete(userId);
    });
  }

  publish(userId: string, ...topics: string[]) {
    const set = this.clients.get(userId);
    if (!set) return;
    for (const topic of topics) for (const res of set) res.write(`data: ${JSON.stringify(topic)}\n\n`);
  }

  closeAll(userId?: string) {
    for (const [uid, set] of this.clients) if (!userId || uid === userId) for (const res of set) res.end();
  }
}
