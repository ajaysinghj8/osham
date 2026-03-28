import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const adminApiTarget = process.env.OSHAM_ADMIN_API_TARGET || 'http://127.0.0.1:26192';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4173,
    proxy: {
      '/__osham': {
        target: adminApiTarget,
        changeOrigin: true,
      },
    },
  },
});
