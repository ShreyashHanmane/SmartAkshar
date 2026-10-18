import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/500.css';
import '@fontsource/noto-sans/600.css';
import '@fontsource/noto-sans/700.css';
import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { applyAppearance, DEFAULT_APPEARANCE } from './theme/appearance';

// Per-user saved appearance is wired up in the Settings module.
applyAppearance(document.documentElement, DEFAULT_APPEARANCE);

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
