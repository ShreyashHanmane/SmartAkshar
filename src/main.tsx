import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/500.css';
import '@fontsource/noto-sans/600.css';
import '@fontsource/noto-sans/700.css';
// Whiteboard text fonts; files download only when text uses them.
import '@fontsource/noto-serif/400.css';
import '@fontsource/caveat/400.css';
import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { APPEARANCE_CACHE_KEY } from './app/settings/SettingsProvider';
import { applyAppearance, parseAppearance } from './theme/appearance';
import { listenForInstallPrompt } from './pwa/install';
import { registerServiceWorker } from './pwa/register';

function cachedAppearance(): unknown {
  try {
    const raw = localStorage.getItem(APPEARANCE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// First paint uses the last saved appearance; SettingsProvider then applies the account's settings.
applyAppearance(document.documentElement, parseAppearance(cachedAppearance()));

registerServiceWorker();
listenForInstallPrompt();

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
