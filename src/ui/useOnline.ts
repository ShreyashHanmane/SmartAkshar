import { useSyncExternalStore } from 'react';
import { onConnection } from '../data/events';

function subscribeBrowser(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

/** Whether the browser reports a network connection. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeBrowser,
    () => navigator.onLine,
    () => true,
  );
}

let serverUp = true;
function subscribeServer(callback: () => void) {
  return onConnection((up) => {
    serverUp = up;
    callback();
  });
}

/** Whether the local AKSHAR server is reachable (the app's notion of "online"). */
export function useServerReachable(): boolean {
  return useSyncExternalStore(
    subscribeServer,
    () => serverUp,
    () => true,
  );
}
