import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: '/public/index.html'
  },
  build: {
    outDir: 'dist',
    lib: {
      entry: {
        index: 'src/index.ts',
        react: 'src/react/index.ts'
      },
      formats: ['es', 'cjs']
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'three'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          three: 'THREE'
        }
      }
    }
  }
}); 