import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import compression from 'vite-plugin-compression';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, 'react-src');

export default defineConfig({
  plugins: [
    react(),
    compression({
      algorithm: 'brotliCompress',
      threshold: 1024,
    }),
  ],
  root: frontendDir,
  publicDir: false,
  build: {
    outDir: path.resolve(__dirname, 'public'),
    emptyOutDir: true,
    target: 'esnext',
    minify: 'esbuild',
    cssMinify: true,
    rollupOptions: {
      input: path.resolve(frontendDir, 'index.html'),
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-chart': ['chart.js', 'react-chartjs-2'],
          'vendor-map': ['leaflet', 'react-leaflet'],
          'vendor-icons': ['lucide-react'],
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    chunkSizeWarningLimit: 300,
  },
  server: {
    port: 18991,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:18990',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 18991,
  },
});
