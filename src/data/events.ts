/**
 * One shared live-update connection (server-sent events). The server sends
 * topic names like "notebooks" or "pages:abc"; subscribers refetch. After a
 * reconnect every subscriber refetches, since changes may have been missed.
 */
type Listener = { matches: (topic: string) => boolean; refresh: () => void };

const listeners = new Set<Listener>();
const statusListeners = new Set<(connected: boolean) => void>();
let source: EventSource | null = null;
let connected = true;
let wasDisconnected = false;

function setConnected(value: boolean) {
  if (value === connected) return;
  connected = value;
  for (const l of statusListeners) l(value);
}

function ensureSource() {
  if (source || typeof EventSource === 'undefined') return;
  source = new EventSource('/api/events');
  source.onopen = () => {
    setConnected(true);
    if (wasDisconnected) for (const l of listeners) l.refresh();
    wasDisconnected = false;
  };
  source.onerror = () => {
    wasDisconnected = true;
    setConnected(false);
    if (source && source.readyState === 2) {
      source.close();
      source = null;
    }
  };
  source.onmessage = (event) => {
    let topic: unknown;
    try {
      topic = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (typeof topic !== 'string') return;
    for (const l of listeners) if (l.matches(topic)) l.refresh();
  };
}

export function onTopic(topics: string[], refresh: () => void): () => void {
  ensureSource();
  const listener: Listener = { matches: (t) => topics.includes(t), refresh };
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Requests report their outcome too, so a dead connection is noticed even if the stream hasn't errored yet. */
export function markReachable(reachable: boolean) {
  if (!reachable) wasDisconnected = true;
  setConnected(reachable);
}

/** Whether the live connection to the local server is up. */
export function onConnection(listener: (connected: boolean) => void): () => void {
  ensureSource();
  statusListeners.add(listener);
  listener(connected);
  return () => statusListeners.delete(listener);
}

/** Closes the stream (after sign-out, so the next user starts clean). */
export function closeEvents() {
  source?.close();
  source = null;
  listeners.clear();
}

/**
 * Builds a live subscription: loads once, then reloads whenever one of the
 * topics changes. Overlapping loads are coalesced; results arrive in order.
 */
export function live<T>(load: () => Promise<T>, topics: string[], next: (value: T) => void, fail: (e: unknown) => void) {
  let active = true;
  let running = false;
  let again = false;
  const run = async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        const value = await load();
        if (active && !again) next(value);
      } while (again && active);
    } catch (error) {
      if (active) fail(error);
    } finally {
      running = false;
    }
  };
  void run();
  const off = onTopic(topics, () => void run());
  return () => {
    active = false;
    off();
  };
}
