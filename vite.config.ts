import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Must carry BOTH a leading and a trailing slash.
// Vite adds a missing leading slash but never a trailing one, and vite-plugin-pwa
// concatenates it raw -> '/VehicleManagementsw.js'. See docs/04-RESEARCH.md section 6.
const BASE = '/VehicleManagement/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      // 'prompt' rather than 'autoUpdate': GitHub Pages serves index.html with a ten-minute
      // max-age, so a silent swap can leave a stale document pointing at chunks the new
      // service worker has already cleaned up. Letting the user trigger the reload means
      // the new document and its assets activate together.
      registerType: 'prompt',
      // The React hook in PwaStatus.tsx does the registering; the injected script would
      // register a second time.
      injectRegister: null,
      includeAssets: ['favicon.svg', 'icon-180.png'],
      manifest: {
        // `id` is set explicitly on day one. Left out it defaults to start_url, and
        // changing start_url later would orphan every existing install.
        id: BASE,
        start_url: BASE,
        scope: BASE,
        name: 'VehicleManagement — Quản lý phương tiện',
        short_name: 'Quản lý xe',
        description: 'Theo dõi chi phí nhiên liệu và lịch bảo dưỡng xe của bạn.',
        lang: 'vi',
        dir: 'ltr',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fbfaf7',
        theme_color: '#1d4f4a',
        categories: ['productivity', 'utilities'],
        // Relative paths: the plugin does not prefix these, the browser resolves
        // them against the manifest URL.
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Đổ xăng', short_name: 'Đổ xăng', url: `${BASE}#/them/nhien-lieu` },
          { name: 'Thêm chi phí', short_name: 'Chi phí', url: `${BASE}#/them/chi-phi` },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Resolved relative to the service worker's own location — do NOT prefix with base.
        navigateFallback: 'index.html',
        // Never cache auth or API endpoints. Deliberately no runtimeCaching for
        // accounts.google.com or *.googleapis.com.
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
})
