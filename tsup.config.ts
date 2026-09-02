import fs from 'node:fs';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'react/index': 'src/react/index.ts',
    vite: 'src/vite.ts',
    poster: 'src/poster.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['react', 'react-dom', 'three', 'vite', 'fs', 'path', 'node:fs', 'node:path'],
  async onSuccess() {
    for (const file of ['dist/react/index.js', 'dist/react/index.mjs']) {
      const src = fs.readFileSync(file, 'utf8');
      if (!src.startsWith('"use client"')) {
        fs.writeFileSync(file, `"use client";\n${src}`);
      }
    }
  },
});
