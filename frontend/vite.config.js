import { defineConfig } from 'vite';

// During `npm run dev` the API calls are proxied to the gateway (docker compose), so the
// frontend can be developed alone; without a backend it falls back to the bundled seed.
export default defineConfig({
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.ZIL_GATEWAY || 'http://localhost:8080', changeOrigin: true } }
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } }
  }
});
