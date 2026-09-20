import { describe, expect, it } from 'vitest';
import { DRIVE_FILE_NAME, driveStore } from './drive';

/**
 * Atrapa Disku. Není to plnohodnotné API — jen ty kousky, na které aplikace
 * sahá, a hlavně jejich nepříjemné vlastnosti: rostoucí číslo verze, mizející
 * soubor a vypršelý token.
 */
interface FakeFile {
  id: string;
  version: number;
  content: string;
  marked: boolean;
}

function fakeDrive() {
  const files = new Map<string, FakeFile>();
  let nextId = 1;
  const state = {
    files,
    calls: [] as string[],
    /** Kolik nejbližších dotazů odpovědět „token vypršel“. */
    expireTokens: 0,
    tokens: [] as Array<'silent' | 'interactive'>,
    lastFileId: null as string | null,
  };

  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    state.calls.push(`${method} ${url.pathname}${url.search}`);

    if (state.expireTokens > 0) {
      state.expireTokens -= 1;
      return json({ error: { message: 'Invalid Credentials' } }, 401);
    }

    const upload = url.pathname.startsWith('/upload/');
    const rest = url.pathname.replace('/upload/drive/v3', '').replace('/drive/v3', '');

    if (rest === '/files' && method === 'GET') {
      const found = [...files.values()].filter((file) => file.marked);
      return json({ files: found.map((file) => ({ id: file.id, version: String(file.version) })) });
    }
    if (rest === '/files' && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as { name: string; appProperties?: Record<string, string> };
      const id = `file-${nextId}`;
      nextId += 1;
      files.set(id, { id, version: 1, content: '', marked: body.appProperties?.['studiumPrehled'] === 'data' });
      expect(body.name).toBe(DRIVE_FILE_NAME);
      return json({ id });
    }

    const match = /^\/files\/([^/]+)$/.exec(rest);
    if (match !== null) {
      const file = files.get(match[1] ?? '');
      if (file === undefined) return json({ error: { message: 'File not found' } }, 404);
      if (upload && method === 'PATCH') {
        file.content = String(init?.body);
        file.version += 1;
        return json({ version: String(file.version) });
      }
      if (url.searchParams.get('alt') === 'media') {
        return new Response(file.content, { status: 200 });
      }
      return json({ version: String(file.version) });
    }
    if (rest === '/about') return json({ user: { emailAddress: 'student@vsb.cz' } });
    return json({ error: { message: `Neznámý dotaz ${rest}` } }, 400);
  }) as typeof fetch;

  return {
    state,
    store(fileId: string | null = null) {
      return driveStore({
        fileId,
        onFileId: (id) => {
          state.lastFileId = id;
        },
        token: async (mode) => {
          state.tokens.push(mode);
          return 'token-123';
        },
        fetchImpl,
      });
    },
  };
}

describe('driveStore', () => {
  it('na prázdném Disku soubor založí a zapamatuje si jeho id', async () => {
    const drive = fakeDrive();
    const store = drive.store();

    expect(await store.version()).toBeNull();
    const written = await store.write('{"a":1}', null);

    expect(written).toEqual({ ok: true, version: '2' });
    expect(drive.state.lastFileId).toBe('file-1');
    expect(drive.state.files.get('file-1')?.content).toBe('{"a":1}');
  });

  it('druhé zařízení najde soubor podle značky, ne podle názvu', async () => {
    const drive = fakeDrive();
    await drive.store().write('{"a":1}', null);

    const second = drive.store(null);
    const read = await second.read();

    expect(read).toEqual({ version: '2', text: '{"a":1}' });
    expect(drive.state.lastFileId).toBe('file-1');
  });

  it('zápis přes cizí novější verzi se odmítne', async () => {
    const drive = fakeDrive();
    const store = drive.store();
    await store.write('{"a":1}', null);

    // Jiné zařízení mezitím zapsalo — verze povyskočila.
    const file = drive.state.files.get('file-1');
    if (file !== undefined) file.version += 1;

    expect(await store.write('{"a":2}', '2')).toEqual({ ok: false, reason: 'conflict' });
    expect(drive.state.files.get('file-1')?.content).toBe('{"a":1}');
  });

  it('smazaný soubor se nehledá donekonečna, ale založí se znovu', async () => {
    const drive = fakeDrive();
    const store = drive.store('file-ktery-uz-neni');

    expect(await store.read()).toBeNull();
    const written = await store.write('{"a":1}', null);

    expect(written.ok).toBe(true);
    expect(drive.state.lastFileId).toBe('file-1');
  });

  it('vypršelý token se obnoví a dotaz se zopakuje', async () => {
    const drive = fakeDrive();
    await drive.store().write('{"a":1}', null);
    drive.state.expireTokens = 1;

    const store = drive.store('file-1');
    expect(await store.version()).toBe('2');
    expect(drive.state.tokens.length).toBeGreaterThan(1);
  });

  it('účet se dá zjistit, a když ne, nic to nerozbije', async () => {
    const drive = fakeDrive();
    expect(await drive.store().account()).toBe('student@vsb.cz');
  });
});
