import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, serve /api/turn the same way api/turn.js does on Vercel (reads METERED_TURN_URL from .env).
const turnDevApi = (url) => ({
  name: 'turn-dev-api',
  configureServer(server) {
    server.middlewares.use('/api/turn', async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const r = await fetch(url);
        res.statusCode = r.ok ? 200 : 502;
        res.end(r.ok ? JSON.stringify(await r.json()) : '{}');
      } catch {
        res.statusCode = 502;
        res.end('{}');
      }
    });
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), ...(env.METERED_TURN_URL ? [turnDevApi(env.METERED_TURN_URL)] : [])],
    build: {
      // three.js is shared by the games and loaded only on game pages.
      chunkSizeWarningLimit: 1500,
    },
  };
});
