/// <reference types="vitest/config" />
import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
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

export default defineConfig({
  plugins: [react(), tailwindcss(), pdfjsAssets()],
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
