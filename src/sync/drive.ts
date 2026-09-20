import { NeedsSignIn, accessToken, forgetToken } from './google';
import type { RemoteFile, RemoteStore, WriteResult } from './engine';

/**
 * Úložiště zálohy na Google Disku.
 *
 * Soubor je obyčejný `studium-prehled.json` v kořeni Disku — vidíš ho, můžeš si
 * ho stáhnout i otevřít v prohlížeči. Aplikace k němu má přístup jen proto, že
 * ho sama vytvořila (rozsah `drive.file`); zbytek Disku pro ni neexistuje.
 *
 * Aby ho druhé zařízení našlo i po přejmenování, nese značku v `appProperties`.
 * Ta je pro ostatní aplikace neviditelná a přejmenování ani přesun ji nesmažou.
 */

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export const DRIVE_FILE_NAME = 'studium-prehled.json';

const MARKER_KEY = 'studiumPrehled';
const MARKER_VALUE = 'data';
const FIND_QUERY = `appProperties has { key='${MARKER_KEY}' and value='${MARKER_VALUE}' } and trashed=false`;

interface DriveFile {
  id: string;
  /** Roste s každým zápisem. Slouží k poznání, že do souboru sáhlo jiné zařízení. */
  version: string;
}

export interface DriveStoreOptions {
  /** Id souboru, které si zařízení pamatuje z minula. */
  fileId: string | null;
  /** Zavolá se, jakmile je id známé — ať se příště nemusí hledat. */
  onFileId: (id: string) => void | Promise<void>;
  /** Kvůli testům: jak se získá token. */
  token?: (mode: 'silent' | 'interactive') => Promise<string>;
  fetchImpl?: typeof fetch;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    const message = body.error?.message;
    if (typeof message === 'string' && message !== '') return message;
  } catch {
    /* odpověď nemusí být JSON, třeba u výpadku proxy */
  }
  return `Google Disk odpověděl ${response.status}.`;
}

export function driveStore(options: DriveStoreOptions): RemoteStore & { account(): Promise<string | null> } {
  const getToken = options.token ?? accessToken;
  const call = options.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  let fileId = options.fileId;

  /** Dotaz na API s jedním zopakováním, když token mezitím vypršel. */
  async function api(url: string, init: RequestInit = {}, retry = true): Promise<Response> {
    const token = await getToken('silent');
    const response = await call(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
    if (response.status === 401 && retry) {
      forgetToken();
      return api(url, init, false);
    }
    if (response.status === 401 || response.status === 403) {
      const message = await readError(response);
      // 403 bývá i kvóta; rozlišuje se podle toho, jestli je token vůbec platný.
      if (response.status === 401) throw new NeedsSignIn(message);
      throw new Error(message);
    }
    return response;
  }

  async function findFile(): Promise<DriveFile | null> {
    const url = `${API}/files?q=${encodeURIComponent(FIND_QUERY)}&fields=${encodeURIComponent('files(id,version)')}&pageSize=5&orderBy=createdTime&spaces=drive`;
    const response = await api(url);
    if (!response.ok) throw new Error(await readError(response));
    const body = (await response.json()) as { files?: DriveFile[] };
    return body.files?.[0] ?? null;
  }

  /** Vrátí soubor, se kterým se pracuje. `null` = na Disku zatím žádný není. */
  async function resolve(): Promise<DriveFile | null> {
    if (fileId !== null) {
      const response = await api(`${API}/files/${fileId}?fields=version`);
      if (response.ok) {
        const body = (await response.json()) as { version: string };
        return { id: fileId, version: body.version };
      }
      // Smazaný nebo vyhozený do koše: zapomenout a zkusit hledat znovu.
      if (response.status !== 404) throw new Error(await readError(response));
      fileId = null;
    }
    const found = await findFile();
    if (found !== null) {
      fileId = found.id;
      await options.onFileId(found.id);
    }
    return found;
  }

  async function create(): Promise<string> {
    const response = await api(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: DRIVE_FILE_NAME,
        mimeType: 'application/json',
        description: 'Data aplikace Přehled přednášek. Slouží k synchronizaci mezi zařízeními.',
        appProperties: { [MARKER_KEY]: MARKER_VALUE },
      }),
    });
    if (!response.ok) throw new Error(await readError(response));
    const body = (await response.json()) as { id: string };
    fileId = body.id;
    await options.onFileId(body.id);
    return body.id;
  }

  async function upload(id: string, text: string): Promise<string> {
    const response = await api(`${UPLOAD}/files/${id}?uploadType=media&fields=version`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: text,
    });
    if (!response.ok) throw new Error(await readError(response));
    const body = (await response.json()) as { version: string };
    return body.version;
  }

  return {
    async version(): Promise<string | null> {
      const found = await resolve();
      return found?.version ?? null;
    },

    async read(): Promise<RemoteFile | null> {
      const found = await resolve();
      if (found === null) return null;
      const response = await api(`${API}/files/${found.id}?alt=media`);
      if (response.status === 404) {
        fileId = null;
        return null;
      }
      if (!response.ok) throw new Error(await readError(response));
      return { version: found.version, text: await response.text() };
    },

    async write(text: string, expected: string | null): Promise<WriteResult> {
      const found = await resolve();
      if (found === null) {
        if (expected !== null) return { ok: false, reason: 'conflict' };
        return { ok: true, version: await upload(await create(), text) };
      }
      // Disk neumí „zapiš jen když se nic nezměnilo“, tak se to ověří těsně předtím.
      // Kdyby se přesto někdo vešel mezi kontrolu a zápis, jeho zařízení si při
      // příštím kole všimne, že má novější záznamy, a pošle je znovu.
      if (found.version !== expected) return { ok: false, reason: 'conflict' };
      return { ok: true, version: await upload(found.id, text) };
    },

    /** Adresa přihlášeného účtu, jen na zobrazení. Když ji Google nedá, nevadí. */
    async account(): Promise<string | null> {
      try {
        const response = await api(`${API}/about?fields=${encodeURIComponent('user(emailAddress)')}`);
        if (!response.ok) return null;
        const body = (await response.json()) as { user?: { emailAddress?: string } };
        return body.user?.emailAddress ?? null;
      } catch {
        return null;
      }
    },
  };
}
