import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Bind every interface rather than Vite's default. Left to itself it can
    // listen on IPv6 loopback only, which makes http://127.0.0.1:5173 refuse
    // connections even though http://localhost:5173 works — and it also lets
    // you open the app from a phone on the same network, which matters for a
    // product whose users are mostly on mobile.
    host: true,
    // Proxying keeps the browser on a single origin in development, so there
    // are no CORS preflights on every request and cookies would behave the
    // same as they will behind a reverse proxy in production.
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // three.js and the r3f stack dominate the bundle; splitting them out
        // means the login screen does not pay for the 3D explorer.
        manualChunks: {
          three: ['three', '@react-three/fiber', '@react-three/drei'],
          charts: ['recharts'],
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
});
