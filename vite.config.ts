import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

/**
 * `base` musí na GitHub Pages odpovídat názvu repozitáře (`/nazev-repa/`).
 * Lokálně zůstává `/`. Workflow ho odvodí z názvu repozitáře sám, viz .github/workflows/deploy.yml.
 */
const base = process.env['VITE_BASE'] ?? '/';

const THEME_COLOR = '#2f63d6';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // „prompt“: nová verze se nenasadí sama uprostřed práce, aplikace nabídne tlačítko.
      registerType: 'prompt',
      // Service worker v dev režimu vypnutý — cache by jinak při vývoji servírovala staré soubory.
      devOptions: { enabled: false },
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Přehled přednášek',
        short_name: 'Přednášky',
        description: 'Co mám zpracované a co mě čeká. Běží offline, data zůstávají v zařízení.',
        lang: 'cs',
        dir: 'ltr',
        // Relativní cesty, aby aplikace fungovala pod libovolným `base` (podsložka GitHub Pages).
        start_url: './',
        scope: './',
        id: './',
        display: 'standalone',
        orientation: 'any',
        theme_color: THEME_COLOR,
        background_color: '#121418',
        categories: ['education', 'productivity'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Co mě čeká', url: './#/', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
          { name: 'Předměty', url: './#/predmety', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        // Celá aplikace do cache — po prvním načtení běží bez sítě.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
});
