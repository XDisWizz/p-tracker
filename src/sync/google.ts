import { googleClientId } from './config';

/**
 * Přihlášení ke Googlu bez serveru.
 *
 * Používá se tokenový tok knihovny Google Identity Services: prohlížeč si sám
 * vyžádá krátkodobý přístupový token (platí hodinu) a ten se posílá v hlavičce
 * dotazů na Disk. Žádný `client_secret`, žádný refresh token, nic se neukládá
 * na disk — po zavření karty je token pryč a obnoví se tiše na pozadí, dokud
 * je uživatel u Googlu přihlášený.
 *
 * Rozsah je schválně ten nejužší, který Google nabízí: `drive.file`. Aplikace
 * uvidí jen soubor, který sama vytvořila. Do zbytku Disku nevidí ani náhodou.
 */

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

/** Token se považuje za vypršelý o minutu dřív, ať nevyprší uprostřed dotazu. */
const EXPIRY_MARGIN_MS = 60_000;

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}

interface GoogleOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type?: string; message?: string }) => void;
  }) => TokenClient;
  revoke: (token: string, done?: () => void) => void;
  hasGrantedAllScopes?: (token: TokenResponse, ...scopes: string[]) => boolean;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

/** Přihlášení vypršelo nebo ho uživatel nikdy nedal — je potřeba klepnout na tlačítko. */
export class NeedsSignIn extends Error {
  constructor(message = 'Přihlášení ke Googlu vypršelo.') {
    super(message);
    this.name = 'NeedsSignIn';
  }
}

let scriptPromise: Promise<GoogleOAuth2> | null = null;

function loadGis(): Promise<GoogleOAuth2> {
  const ready = window.google?.accounts?.oauth2;
  if (ready !== undefined) return Promise.resolve(ready);

  scriptPromise ??= new Promise<GoogleOAuth2>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const script = existing ?? document.createElement('script');
    const onLoad = (): void => {
      const api = window.google?.accounts?.oauth2;
      if (api === undefined) reject(new Error('Přihlašovací knihovna Googlu se načetla poškozená.'));
      else resolve(api);
    };
    script.addEventListener('load', onLoad);
    script.addEventListener('error', () => {
      scriptPromise = null; // ať to jde zkusit znovu, až bude síť
      reject(new Error('Nepodařilo se načíst přihlášení Googlu. Jsi online?'));
    });
    if (existing === null) {
      script.src = GIS_SRC;
      script.async = true;
      document.head.append(script);
    }
  });
  return scriptPromise;
}

let client: TokenClient | null = null;
let clientFor: string | null = null;
let pending: { resolve: (token: string) => void; reject: (error: Error) => void } | null = null;
let cached: { token: string; expiresAt: number } | null = null;

function settleError(error: Error): void {
  const waiting = pending;
  pending = null;
  waiting?.reject(error);
}

async function tokenClient(clientId: string): Promise<TokenClient> {
  if (client !== null && clientFor === clientId) return client;
  const oauth2 = await loadGis();
  client = oauth2.initTokenClient({
    client_id: clientId,
    scope: DRIVE_SCOPE,
    callback: (response) => {
      const waiting = pending;
      pending = null;
      if (response.access_token === undefined || response.access_token === '') {
        waiting?.reject(new NeedsSignIn(response.error_description ?? 'Google token nevydal.'));
        return;
      }
      cached = {
        token: response.access_token,
        expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000 - EXPIRY_MARGIN_MS,
      };
      waiting?.resolve(response.access_token);
    },
    error_callback: (error) => {
      // Zavřené okno, zablokované vyskakovací okno, odmítnuté oprávnění.
      settleError(new NeedsSignIn(error.message ?? 'Přihlášení se nepovedlo.'));
    },
  });
  clientFor = clientId;
  return client;
}

/**
 * Přístupový token. `silent` se používá na pozadí — když by Google potřeboval
 * cokoliv zobrazit, vyhodí se `NeedsSignIn` a aplikace nabídne tlačítko.
 * Interaktivní volání musí přijít z klepnutí uživatele, jinak ho prohlížeč
 * vyhodnotí jako nevyžádané vyskakovací okno a zablokuje.
 */
export async function accessToken(mode: 'silent' | 'interactive'): Promise<string> {
  if (cached !== null && cached.expiresAt > Date.now()) return cached.token;

  const clientId = googleClientId();
  if (clientId === null) throw new NeedsSignIn('Synchronizace zatím není nastavená.');

  const api = await tokenClient(clientId);
  if (pending !== null) throw new NeedsSignIn('Přihlášení už probíhá.');

  return new Promise<string>((resolve, reject) => {
    pending = { resolve, reject };
    try {
      // Prázdné `prompt` znamená „nic nezobrazuj, pokud to jde bez toho“.
      api.requestAccessToken(mode === 'silent' ? { prompt: '' } : {});
    } catch (error) {
      pending = null;
      reject(error instanceof Error ? error : new NeedsSignIn());
    }
  });
}

/** Zapomene token v paměti. Přístup u Googlu zůstává povolený. */
export function forgetToken(): void {
  cached = null;
}

/** Odebere aplikaci přístup na straně Googlu. Data na Disku zůstanou ležet. */
export async function revokeAccess(): Promise<void> {
  const token = cached?.token;
  cached = null;
  if (token === undefined) return;
  try {
    const oauth2 = await loadGis();
    await new Promise<void>((resolve) => oauth2.revoke(token, resolve));
  } catch {
    // Odhlášení tady je úklid navíc; token stejně do hodiny vyprší sám.
  }
}

export function hasToken(): boolean {
  return cached !== null && cached.expiresAt > Date.now();
}
