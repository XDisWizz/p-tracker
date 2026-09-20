/**
 * Kde se bere id klienta pro přihlášení ke Google Disku.
 *
 * Id klienta není tajemství — putuje v adrese přihlašovacího okna a je vidět
 * v každé takové aplikaci. Tajný je jen `client_secret`, který se tady vůbec
 * nepoužívá: přihlášení běží tokenovým tokem přímo v prohlížeči, bez serveru.
 *
 * Dá se nastavit dvěma způsoby:
 *  - při sestavení proměnnou `VITE_GOOGLE_CLIENT_ID` (pro vlastní nasazení),
 *  - nebo přímo v Nastavení, což si zařízení zapamatuje u sebe.
 */

const STORAGE_KEY = 'studium-prehled:google-client-id';

const BUILD_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();

/** Bylo id zadané už při sestavení? Pak ho není potřeba nikam opisovat. */
export const CLIENT_ID_FROM_BUILD = BUILD_ID !== '';

/** Přesně to, co Google vypíše u „OAuth 2.0 Client ID“. */
export function isClientId(value: string): boolean {
  return /^[\w-]+\.apps\.googleusercontent\.com$/.test(value.trim());
}

export function googleClientId(): string | null {
  if (CLIENT_ID_FROM_BUILD) return BUILD_ID;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved !== null && saved.trim() !== '' ? saved.trim() : null;
  } catch {
    // Soukromý režim může localStorage zakázat. Pak se synchronizace prostě nenabídne.
    return null;
  }
}

export function setGoogleClientId(value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value.trim());
  } catch {
    /* viz výše */
  }
}
