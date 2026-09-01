import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const API_TARGET = process.env.VITE_API_TARGET || 'http://localhost:5174';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
      '@shared': path.resolve(root, '..', 'shared'),
    },
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    // Fail loudly instead of rolling onto the next free port — the next one is
    // 5174, the API's port, and Vite would silently squat the proxy target.
    strictPort: true,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
});
