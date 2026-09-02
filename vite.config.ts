import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { screenframe } from './src/vite/plugin';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react(), screenframe()],
  server: {
    port: 3000,
    open: '/'
  },
  build: {
    outDir: 'dist-pages',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        playground: resolve(rootDir, 'playground.html'),
      },
    },
  },
});
