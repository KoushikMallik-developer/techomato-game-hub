import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // three.js is shared by the games and loaded only on game pages.
    chunkSizeWarningLimit: 1500,
  },
});
