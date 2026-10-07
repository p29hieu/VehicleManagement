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
      // Was 'prompt', on the reasoning that GitHub Pages' ten-minute max-age could leave a
      // stale document pointing at chunks a new worker had already purged.
      //
      // That risk is real but small, and it was the wrong trade: in practice 'prompt' kept
      // three consecutive fixes from reaching the user at all. They sat on a build whose
      // layout could not be scrolled, being told to reload via a bar they never noticed.
      // A failed lazy import self-heals on the next load; an undeliverable fix does not.
      //
      // The precache also makes the swap safer than that comment assumed: index.html and
      // every chunk are cached as one revisioned generation, and navigateFallback serves
      // that same generation, so a controlled client stays self-consistent.
      registerType: 'autoUpdate',
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
