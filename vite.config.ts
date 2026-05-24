import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify - file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      // When watching IS enabled, explicitly ignore noisy paths so writes from
      // npm install / Vite's own dep cache / git / Vercel CLI don't trigger
      // spurious full-page reloads while the user is working.
      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : {
              ignored: [
                '**/node_modules/**',
                '**/.git/**',
                '**/dist/**',
                '**/.vercel/**',
                '**/coverage/**',
                '**/*.log',
                '**/.env.local',
                '**/api/**',
              ],
            },
    },
    optimizeDeps: {
      // Pre-bundle the heavy deps up front. Otherwise, the first time a new
      // submodule is imported, Vite re-optimizes and triggers a full page
      // reload - which the user perceives as the site "refreshing every few
      // seconds" while it warms up its cache.
      include: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'firebase/app',
        'firebase/auth',
        'firebase/firestore',
        'lucide-react',
        'motion/react',
        'xlsx',
      ],
    },
    build: {
      chunkSizeWarningLimit: 1500,
    },
  };
});
