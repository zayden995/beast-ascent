import { defineConfig } from 'vite';

// Relative base so the built site works from any sub-path (itch.io, GitHub Pages).
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
