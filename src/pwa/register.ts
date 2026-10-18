/** Registers the service worker in production builds (development serves files straight from Vite). */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // The app works without it; it just won't open while the server is stopped.
    });
  });
}
