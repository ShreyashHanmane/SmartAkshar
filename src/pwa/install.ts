import { useSyncExternalStore } from 'react';

/** Chromium's install prompt event (not in the standard DOM types). */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function listenForInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // show our own button instead of the browser's mini-bar
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export type InstallState = 'installed' | 'available' | 'unavailable';

function read(): InstallState {
  if (window.matchMedia('(display-mode: standalone)').matches) return 'installed';
  return deferred ? 'available' : 'unavailable';
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    read,
    () => 'unavailable',
  );
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  await event.prompt();
  const { outcome } = await event.userChoice;
  deferred = null;
  notify();
  return outcome === 'accepted';
}
