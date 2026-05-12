import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:4000',
      '/api': 'http://localhost:4000',
      '/wallet': 'http://localhost:4000',
      '/ims': 'http://localhost:4000',
    },
  },
});
