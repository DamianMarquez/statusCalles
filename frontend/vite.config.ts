import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  envDir: '..',
  server: {
    allowedHosts: ['bladder-sandpaper-tilt.ngrok-free.dev'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyRequest) => {
            proxyRequest.setHeader('origin', 'http://localhost:5173');
          });
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
