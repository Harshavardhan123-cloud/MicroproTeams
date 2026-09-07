import { defineConfig, createLogger } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const logger = createLogger();
const logError = logger.error.bind(logger);
logger.error = (msg, options) => {
  if (msg.includes('ws proxy')) return;
  logError(msg, options);
};

export default defineConfig({
  base: './',
  customLogger: logger,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    proxy: {
      '/api/v1/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err: any) => {
            // Silence harmless socket reset errors from dev proxy
            if (err.code === 'ECONNRESET' || err.message?.includes('ended by the other party')) return;
          });
        }
      },
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/sfu': {
        target: 'http://localhost:3010',
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sfu/, ''),
        configure: (proxy) => {
          proxy.on('error', (err: any) => {
            if (err.code === 'ECONNRESET' || err.message?.includes('ended by the other party')) return;
          });
        }
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err: any) => {
            if (err.code === 'ECONNRESET' || err.message?.includes('ended by the other party')) return;
          });
        }
      },
    },
  },
});
