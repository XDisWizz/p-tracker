import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { localFingerprint, syncOnce, type RemoteStore, type WriteResult } from './engine';
import { exportAll, serializeExport } from '../db/transfer';
import type { StudiumDB } from '../db/db';
import { freshDb, makeLecture, makeSubject } from '../test/factories';

/**
 * Dvě zařízení proti jednomu souboru. Přesně tahle situace je na synchronizaci
 * nebezpečná — a v testu je zadarmo, protože jádro nezná síť ani Google.
 */

interface FakeDrive extends RemoteStore {
  /** Kolikrát se opravdu zapisovalo. Zbytečný zápis je chyba, ne detail. */
  writes: number;
  reads: number;
  /** Vnutí konflikt: tolik nejbližších zápisů skončí jako „někdo byl rychlejší“. */
  failNextWrites: number;
  content: string | null;
}

function fakeDrive(initial: string | null = null): FakeDrive {
  let version = initial === null ? 0 : 1;
  const drive: FakeDrive = {
    writes: 0,
    reads: 0,
    failNextWrites: 0,
    content: initial,
    async version(): Promise<string | null> {
      return drive.content === null ? null : String(version);
    },
    async read() {
      drive.reads += 1;
      return drive.content === null ? null : { version: String(version), text: drive.content };
    },
    async write(text, expected): Promise<WriteResult> {
      if (drive.failNextWrites > 0) {
        drive.failNextWrites -= 1;
        version += 1; // jako by mezitím zapsalo jiné zařízení
        return { ok: false, reason: 'conflict' };
      }
      const current = drive.content === null ? null : String(version);
      if (expected !== current) return { ok: false, reason: 'conflict' };
      drive.writes += 1;
      version += 1;
      drive.content = text;
      return { ok: true, version: String(version) };
    },
  };
  return drive;
}

let a: StudiumDB;
let b: StudiumDB;

beforeEach(() => {
  a = freshDb();
  b = freshDb();
});

afterEach(async () => {
  await a.delete();
  await b.delete();
});

async function seedA(): Promise<void> {
  await a.subjects.add(makeSubject({ id: 'zma', name: 'Analýza' }));
  await a.lectures.add(makeLecture({ id: 'l1', subjectId: 'zma', number: 1, title: 'Limity' }));
}

describe('syncOnce', () => {
  it('prázdný Disk dostane první nahrání', async () => {
    await seedA();
    const drive = fakeDrive();

    const result = await syncOnce(a, drive);

    expect(result.ok && result.status).toBe('created');
    expect(drive.content).not.toBeNull();
    expect(result.ok && result.fingerprint).toBe(await localFingerprint(a));
  });

  it('druhé zařízení si stáhne, co tam nahrálo první', async () => {
    await seedA();
    const drive = fakeDrive();
    await syncOnce(a, drive);

    const result = await syncOnce(b, drive);

    expect(result.ok && result.status).toBe('pulled');
    expect(result.ok && result.pulled).toEqual({ added: 2, updated: 0 });
    expect((await b.subjects.toArray()).map((s) => s.name)).toEqual(['Analýza']);
    expect(await b.lectures.count()).toBe(1);
  });

  it('shodná data se nikam nezapisují', async () => {
    await seedA();
    const drive = fakeDrive();
    await syncOnce(a, drive);
    const after = drive.writes;

    const result = await syncOnce(a, drive);

    expect(result.ok && result.status).toBe('in-sync');
    expect(drive.writes).toBe(after);
  });

  it('změny z obou stran se sloučí, novější úprava vyhrává', async () => {
    await seedA();
    const drive = fakeDrive();
    await syncOnce(a, drive);
    await syncOnce(b, drive);

    // A přejmenuje přednášku dřív a přidá druhou, B tu první přejmenuje později
    // a založí vlastní předmět. Každá strana tedy má něco, co ta druhá nezná.
    await a.lectures.update('l1', { title: 'Limity funkcí', updatedAt: '2026-09-10T10:00:00.000Z' });
    await a.lectures.add(makeLecture({ id: 'l2', subjectId: 'zma', number: 2, title: 'Derivace' }));
    await syncOnce(a, drive);
    await b.lectures.update('l1', { title: 'Spojitost', updatedAt: '2026-09-10T12:00:00.000Z' });
    await b.subjects.add(makeSubject({ id: 'upa', name: 'Programování' }));

    const onB = await syncOnce(b, drive);
    const onA = await syncOnce(a, drive);

    expect(onB.ok && onB.status).toBe('merged');
    expect(onB.ok && onB.pulled).toEqual({ added: 1, updated: 0 });
    expect(onA.ok && onA.status).toBe('pulled');
    expect((await a.lectures.get('l1'))?.title).toBe('Spojitost');
    expect(await b.lectures.count()).toBe(2);
    expect((await a.subjects.toArray()).map((s) => s.id).toSorted()).toEqual(['upa', 'zma']);
    // Obě strany skončí na stejném obsahu, ne jen „skoro“.
    expect(await localFingerprint(a)).toBe(await localFingerprint(b));
  });

  it('smazání se přenese na druhé zařízení, ne že se vrátí zpátky', async () => {
    await seedA();
    const drive = fakeDrive();
    await syncOnce(a, drive);
    await syncOnce(b, drive);

    await a.lectures.update('l1', { deletedAt: '2026-09-11T09:00:00.000Z', updatedAt: '2026-09-11T09:00:00.000Z' });
    await syncOnce(a, drive);
    await syncOnce(b, drive);

    expect((await b.lectures.get('l1'))?.deletedAt).toBe('2026-09-11T09:00:00.000Z');

    // A teď to nejdůležitější: B nesmí smazanou přednášku poslat zpátky jako živou.
    await syncOnce(b, drive);
    await syncOnce(a, drive);
    expect((await a.lectures.get('l1'))?.deletedAt).not.toBeNull();
  });

  it('konflikt zápisu se zkusí znovu nad novější verzí', async () => {
    await seedA();
    const drive = fakeDrive();
    await syncOnce(a, drive);
    await a.subjects.add(makeSubject({ id: 'upa', name: 'Programování' }));
    drive.failNextWrites = 1;

    const result = await syncOnce(a, drive);

    expect(result.ok).toBe(true);
    expect(drive.reads).toBeGreaterThan(2);
    expect(drive.content).toContain('Programování');
  });

  it('cizí nebo poškozený soubor se nepřepíše', async () => {
    await seedA();
    const drive = fakeDrive('{"format":"neco-jineho"}');

    const result = await syncOnce(a, drive);

    expect(result).toMatchObject({ ok: false, kind: 'remote-invalid' });
    expect(drive.writes).toBe(0);
    expect(drive.content).toBe('{"format":"neco-jineho"}');
  });

  it('záloha z novější verze aplikace se nepřepíše starší', async () => {
    await seedA();
    const file = await exportAll(a);
    const drive = fakeDrive(serializeExport({ ...file, schemaVersion: 99 }));

    const result = await syncOnce(a, drive);

    expect(result).toMatchObject({ ok: false, kind: 'remote-invalid' });
    expect(drive.writes).toBe(0);
  });

  it('výpadek sítě nic nerozbije a ohlásí se jako chyba', async () => {
    await seedA();
    const drive = fakeDrive();
    drive.read = async () => {
      throw new Error('Síť není k dispozici.');
    };

    const result = await syncOnce(a, drive);

    expect(result).toMatchObject({ ok: false, kind: 'remote-failed', error: 'Síť není k dispozici.' });
    expect(await a.lectures.count()).toBe(1);
  });
});
