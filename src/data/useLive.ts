import { useEffect, useRef, useState } from 'react';

export type Live<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

type Subscribe<T> = (next: (data: T) => void, fail: (error: unknown) => void) => () => void;

/**
 * Subscribes to a data-layer stream (a function returning an unsubscribe).
 * Re-subscribes only when `key` changes; `null` means "nothing to load yet".
 */
export function useLive<T>(key: string | null, subscribe: Subscribe<T>): Live<T> {
  const [state, setState] = useState<{ key: string | null; live: Live<T> }>({
    key,
    live: { status: 'loading' },
  });
  const latest = useRef(subscribe);

  useEffect(() => {
    latest.current = subscribe;
  });

  useEffect(() => {
    if (key === null) return;
    return latest.current(
      (data) => setState({ key, live: { status: 'ready', data } }),
      (error) => {
        if (import.meta.env.DEV) console.warn('live query failed', error);
        setState({ key, live: { status: 'error' } });
      },
    );
  }, [key]);

  return state.key === key ? state.live : { status: 'loading' };
}
