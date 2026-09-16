import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

/**
 * Ikony aplikace z jednoho SVG. Přegeneruj po změně public/icon.svg:  npm run icons
 * Preset „minimal 2023“ = favicon, 192 a 512 px, maskovatelná ikona pro Android, apple-touch-icon.
 */
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#2f63d6' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#2f63d6' } },
  },
  images: ['public/icon.svg'],
});
