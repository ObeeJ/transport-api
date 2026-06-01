import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: {
        enabled: false, // disable SW in dev to prevent stale cache issues
      },
      manifest: {
        name: 'Akin',
        short_name: 'Akin',
        description: 'Class transport, together.',
        theme_color: '#1B2A4E',
        background_color: '#F5EFE6',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/akin-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/reports/') || url.pathname.startsWith('/hubs'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'akin-api-public',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 24,
                maxAgeSeconds: 60 * 60 * 24,
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    // Mirror the production topology locally: set VITE_API_URL="/api" and the
    // app talks to the API same-origin, with Vite proxying /api to the Go
    // server. Override the target with VITE_DEV_API_TARGET if it isn't on :8080.
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
})
