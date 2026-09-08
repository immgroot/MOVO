import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
// Node serves the UI; the separate authority handles persistent Socket.IO rooms.
// A Worker dev proxy cannot own the Node WebSocket upgrade.
export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    proxy: {
      '/socket.io': { target: 'http://127.0.0.1:3001', ws: true },
      '/api/auth': { target: 'http://127.0.0.1:3001' },
    },
  },
  plugins: [vinext(), sites()],
});
