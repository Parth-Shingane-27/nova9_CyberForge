import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The FastAPI backend (planned, see ../README.md) is expected on :8000.
// Auth uses an HttpOnly session cookie, so the browser must see the API as same-origin: proxy /api.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: false } },
  },
});
