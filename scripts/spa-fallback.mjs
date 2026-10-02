// GitHub Pages serves a real HTTP 404 for unmatched deep links; a byte-identical
// 404.html makes the first cold load of /VehicleManagement/bao-cao boot the SPA.
// After the service worker installs, navigateFallback takes over (and works offline).
// See docs/04-RESEARCH.md §6.
import { copyFileSync, existsSync } from 'node:fs'

const SRC = 'dist/index.html'
const DEST = 'dist/404.html'

if (!existsSync(SRC)) {
  console.error(`[spa-fallback] ${SRC} not found — did vite build run?`)
  process.exit(1)
}
copyFileSync(SRC, DEST)
console.log(`[spa-fallback] ${SRC} -> ${DEST}`)
