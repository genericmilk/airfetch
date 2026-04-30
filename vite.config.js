import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

// Vite builds the renderer to renderer/dist/. Electron loads that built
// index.html in main.js — base: './' keeps asset URLs relative so file://
// doesn't break absolute paths.
export default defineConfig({
  root: resolve(__dirname, 'renderer'),
  base: './',
  plugins: [vue()],
  build: {
    outDir: resolve(__dirname, 'renderer/dist'),
    emptyOutDir: true,
    target: 'esnext',
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
