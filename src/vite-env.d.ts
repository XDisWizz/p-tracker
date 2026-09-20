/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

/** Verze z package.json, dosazená při sestavení (viz `define` ve vite.config.ts). */
declare const __APP_VERSION__: string;

/** Doplněk k typům z `vite/client` — vlastní proměnné prostředí téhle aplikace. */
interface ImportMetaEnv {
  /** Nepovinné id klienta Google OAuth. Bez něj se synchronizace nastaví v aplikaci. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}
