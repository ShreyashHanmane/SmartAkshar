/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { cpSync, createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { join, normalize, resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { type Plugin, defineConfig } from 'vite';

/**
 * Self-hosts pdf.js data files (character maps, standard fonts, image-decoder
 * wasm) under /pdfjs/ so PDFs in any script render without fetching from a CDN.
 */
function pdfjsAssets(): Plugin {
  const root = resolve('node_modules/pdfjs-dist');
  const dirs = ['cmaps', 'standard_fonts', 'wasm'];
  const serve: Plugin['configureServer'] = (server) => {
    server.middlewares.use('/pdfjs', (req, res, next) => {
      const path = normalize(decodeURIComponent((req.url ?? '').split('?')[0] ?? ''));
      const [, dir] = path.split('/');
      const file = join(root, path);
      if (
        !dir ||
        !dirs.includes(dir) ||
        !file.startsWith(root) ||
        !existsSync(file) ||
        !statSync(file).isFile()
      )
        return next();
      if (file.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
      createReadStream(file).pipe(res);
    });
  };
  return {
    name: 'pdfjs-assets',
    configureServer: serve,
    configurePreviewServer: serve as Plugin['configurePreviewServer'],
    writeBundle(options) {
      for (const dir of dirs)
        cpSync(join(root, dir), join(options.dir ?? 'dist', 'pdfjs', dir), { recursive: true });
    },
  };
}

/**
 * Builds /sw.js from src/pwa/sw.js with the list of files to keep for opening
 * the app while the local server is stopped (code and styles; fonts and pdf.js
 * data are cached the first time they're used).
 */
function serviceWorker(): Plugin {
  return {
    name: 'akshar-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => f.startsWith('assets/') && /\.(m?js|css)$/.test(f))
        .sort();
      const precache = [
        '/index.html',
        '/manifest.webmanifest',
        '/icons/icon-192.png',
        '/icons/favicon-48.png',
        ...files.map((f) => `/${f}`),
      ];
      const version = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12);
      const source = readFileSync(resolve('src/pwa/sw.js'), 'utf8')
        .replace("'__VERSION__'", JSON.stringify(version))
        .replace('/* __PRECACHE__ */ []', JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), pdfjsAssets(), serviceWorker()],
  build: {
    sourcemap: false,
  },
  // In development the local API server (npm run dev starts it) answers /api.
  server: {
    proxy: { '/api': { target: 'http://127.0.0.1:5174', changeOrigin: false } },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
