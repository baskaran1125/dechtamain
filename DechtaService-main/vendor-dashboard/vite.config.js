import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const vendorProxyTarget =
    env.VITE_VENDOR_PROXY_TARGET || env.VITE_VENDOR_API_URL || 'http://localhost:5000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: vendorProxyTarget,
          changeOrigin: true,
        },
      },
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined;
            }

            if (id.includes('react-dom') || id.includes('/react/')) {
              return 'react-core';
            }
            if (id.includes('chart.js') || id.includes('react-chartjs-2')) {
              return 'charts';
            }
            if (id.includes('socket.io-client')) {
              return 'realtime';
            }
            return 'vendor';
          },
        },
      },
    },
  };
});
