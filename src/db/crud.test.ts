import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subjectsRepo, type SubjectsRepo } from './subjects';
import { lecturesRepo, type LecturesRepo } from './lectures';
import { metaRepo } from './meta';
import { freshDb } from '../test/factories';
import { nextSubjectInput } from '../domain/defaults';
import { createDb, openVerified, type StudiumDB } from './db';
import type { SubjectInput } from '../domain/types';

let db: StudiumDB;
let subjects: SubjectsRepo;
let lectures: LecturesRepo;

function subjectInput(overrides: Partial<SubjectInput> = {}): SubjectInput {
  return { ...nextSubjectInput([]), name: 'Fyzika I', code: 'FYZ', ...overrides };
}

beforeEach(() => {
  db = freshDb();
  subjects = subjectsRepo(db);
  lectures = lecturesRepo(db);
});

afterEach(async () => {
  await db.delete();
});

describe('předměty — CRUD', () => {
  it('vytvoří předmět s vygenerovaným id a razítky', async () => {
    const subject = await subjects.create(subjectInput());
    expect(subject.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(subject.createdAt).toBe(subject.updatedAt);
    expect(subject.deletedAt).toBeNull();
  });

  it('dva předměty nikdy nedostanou stejné id', async () => {
    const a = await subjects.create(subjectInput());
    const b = await subjects.create(subjectInput());
    expect(a.id).not.toBe(b.id);
  });

  it('úprava posune updatedAt, ale createdAt nechá být', async () => {
    const subject = await subjects.create(subjectInput(), '2026-09-01T08:00:00.000Z');
    const updated = await subjects.update(subject.id, { name: 'Fyzika II' }, '2026-09-02T08:00:00.000Z');
    expect(updated.name).toBe('Fyzika II');
    expect(updated.createdAt).toBe('2026-09-01T08:00:00.000Z');
    expect(updated.updatedAt).toBe('2026-09-02T08:00:00.000Z');
  });

  it('úprava neexistujícího předmětu skončí chybou, ne tichým vytvořením', async () => {
    await expect(subjects.update('neexistuje', { name: 'X' })).rejects.toThrow();
  });

  it('seznam řadí podle sortOrder a pak podle názvu', async () => {
    await subjects.create(subjectInput({ name: 'Béčko', sortOrder: 1 }));
    await subjects.create(subjectInput({ name: 'Áčko', sortOrder: 1 }));
    await subjects.create(subjectInput({ name: 'Céčko', sortOrder: 0 }));
    expect((await subjects.list()).map((s) => s.name)).toEqual(['Céčko', 'Áčko', 'Béčko']);
  });

  it('archivovaný předmět zmizí ze seznamu, dokud si ho nevyžádám', async () => {
    const subject = await subjects.create(subjectInput());
    await subjects.setArchived(subject.id, true);
    expect(await subjects.list()).toHaveLength(0);
    expect(await subjects.list({ includeArchived: true })).toHaveLength(1);
  });
});

describe('předměty — měkké mazání', () => {
  it('smazaný předmět zmizí z dotazů, ale zůstane v databázi jako tombstone', async () => {
    const subject = await subjects.create(subjectInput());
    await subjects.softDelete(subject.id);

    expect(await subjects.get(subject.id)).toBeUndefined();
    expect(await subjects.list()).toHaveLength(0);
    expect(await subjects.listRaw()).toHaveLength(1);
  });

  it('smazání předmětu schová i jeho přednášky', async () => {
    const subject = await subjects.create(subjectInput());
    await lectures.createNext(subject.id);
    await lectures.createNext(subject.id);

    await subjects.softDelete(subject.id);
    expect(await lectures.listBySubject(subject.id)).toHaveLength(0);
    expect(await lectures.listRaw()).toHaveLength(2);
  });

  it('obnovení vrátí předmět i přednášky smazané s ním', async () => {
    const subject = await subjects.create(subjectInput());
    await lectures.createNext(subject.id);

    await subjects.softDelete(subject.id, '2026-09-10T10:00:00.000Z');
    await subjects.restore(subject.id);

    expect(await subjects.get(subject.id)).toBeDefined();
    expect(await lectures.listBySubject(subject.id)).toHaveLength(1);
  });

  it('obnovení předmětu nevzkřísí přednášku smazanou dřív ručně', async () => {
    const subject = await subjects.create(subjectInput());
    const keep = await lectures.createNext(subject.id);
    const trashed = await lectures.createNext(subject.id);

    await lectures.softDelete(trashed.id, '2026-09-05T10:00:00.000Z');
    await subjects.softDelete(subject.id, '2026-09-10T10:00:00.000Z');
    await subjects.restore(subject.id);

    const alive = await lectures.listBySubject(subject.id);
    expect(alive.map((l) => l.id)).toEqual([keep.id]);
  });
});

describe('přednášky — CRUD', () => {
  it('vytvoří přednášku navázanou na předmět', async () => {
    const subject = await subjects.create(subjectInput());
    const lecture = await lectures.createNext(subject.id);
    expect(lecture.subjectId).toBe(subject.id);
    expect(lecture.number).toBe(1);
  });

  it('createNext pro neexistující předmět selže', async () => {
    await expect(lectures.createNext('neexistuje')).rejects.toThrow();
  });

  it('opakované volání createNext čísluje vzestupně', async () => {
    const subject = await subjects.create(subjectInput());
    await lectures.createNext(subject.id);
    await lectures.createNext(subject.id);
    const third = await lectures.createNext(subject.id);
    expect(third.number).toBe(3);
  });

  it('seznam předmětu je seřazený podle čísla, ne podle času vložení', async () => {
    const subject = await subjects.create(subjectInput());
    await lectures.createNext(subject.id, { number: 3 });
    await lectures.createNext(subject.id, { number: 1 });
    await lectures.createNext(subject.id, { number: 2 });
    expect((await lectures.listBySubject(subject.id)).map((l) => l.number)).toEqual([1, 2, 3]);
  });

  it('nemíchá přednášky různých předmětů', async () => {
    const a = await subjects.create(subjectInput({ code: 'A' }));
    const b = await subjects.create(subjectInput({ code: 'B' }));
    await lectures.createNext(a.id);
    await lectures.createNext(b.id);

    expect(await lectures.listBySubject(a.id)).toHaveLength(1);
    expect(await lectures.listAll()).toHaveLength(2);
  });

  it('tři rychlá přidání za sebou očíslují 1, 2, 3 — ne třikrát stejně', async () => {
    const subject = await subjects.create(subjectInput());
    // Bez transakce v createNext si všechna tři volání přečtou stejné nejvyšší
    // číslo dřív, než kterékoliv z nich stihne zapsat.
    await Promise.all([
      lectures.createNext(subject.id),
      lectures.createNext(subject.id),
      lectures.createNext(subject.id),
    ]);

    const created = await lectures.listBySubject(subject.id);
    expect(created.map((l) => l.number)).toEqual([1, 2, 3]);
  });

  it('createNext respektuje ruční přepsání polí', async () => {
    const subject = await subjects.create(subjectInput());
    const lecture = await lectures.createNext(subject.id, { title: 'Newtonovy zákony', number: 4 });
    expect(lecture.title).toBe('Newtonovy zákony');
    expect(lecture.number).toBe(4);
  });
});

describe('přednášky — stav a razítka', () => {
  it('přepnutí stavu zapíše razítko', async () => {
    const subject = await subjects.create(subjectInput());
    const lecture = await lectures.createNext(subject.id);

    const updated = await lectures.setStatus(lecture.id, 'summary', '2026-09-22T18:00:00.000Z');
    expect(updated.status).toBe('summary');
    expect(updated.statusAt.summary).toBe('2026-09-22T18:00:00.000Z');
  });

  it('razítko si pamatuje první dosažení, překlik tam a zpět ho nepřepíše', async () => {
    const subject = await subjects.create(subjectInput());
    const lecture = await lectures.createNext(subject.id);

    await lectures.setStatus(lecture.id, 'summary', '2026-09-22T18:00:00.000Z');
    await lectures.setStatus(lecture.id, 'materials', '2026-09-23T18:00:00.000Z');
    const back = await lectures.setStatus(lecture.id, 'summary', '2026-09-24T18:00:00.000Z');

    expect(back.statusAt.summary).toBe('2026-09-22T18:00:00.000Z');
    expect(back.statusAt.materials).toBe('2026-09-23T18:00:00.000Z');
  });

  it('nastavení téhož stavu znovu razítko nepřidá', async () => {
    const subject = await subjects.create(subjectInput());
    const lecture = await lectures.createNext(subject.id);
    const same = await lectures.setStatus(lecture.id, 'not_started', '2026-09-22T18:00:00.000Z');
    expect(same.statusAt.not_started).toBeUndefined();
  });

  it('přednáška založená rovnou v nějakém stavu dostane razítko hned', async () => {
    const subject = await subjects.create(subjectInput());
    const lecture = await lectures.createNext(
      subject.id,
      { status: 'materials' },
      '2026-09-22T18:00:00.000Z',
    );
    expect(lecture.statusAt.materials).toBe('2026-09-22T18:00:00.000Z');
  });
});

describe('přednášky — mazání a obnovení', () => {
  it('smazaná přednáška zmizí ze seznamů, ale jde vrátit', async () => {
    const subject = await subjects.create(subjectInput());
    const lecture = await lectures.createNext(subject.id);

    await lectures.softDelete(lecture.id);
    expect(await lectures.listBySubject(subject.id)).toHaveLength(0);

    await lectures.restore(lecture.id);
    expect(await lectures.listBySubject(subject.id)).toHaveLength(1);
  });

  it('mazání neexistující přednášky nespadne', async () => {
    await expect(lectures.softDelete('neexistuje')).resolves.toBeUndefined();
  });

  it('smazaná přednáška neblokuje pořadové číslo', async () => {
    const subject = await subjects.create(subjectInput());
    const first = await lectures.createNext(subject.id);
    await lectures.softDelete(first.id);
    const next = await lectures.createNext(subject.id);
    expect(next.number).toBe(1);
  });
});

describe('otevření databáze', () => {
  it('čerstvá databáze projde kontrolou tabulek', async () => {
    await expect(openVerified(db)).resolves.toBeUndefined();
  });

  it('cizí databázi se stejným jménem a vyšší verzí po otevření použít jde', async () => {
    const name = `cizi-${Date.now()}`;
    // Dexie 4 takovou databázi neodmítne, ale doplní do ní chybějící tabulky.
    // Dotazy spuštěné ještě před dokončením otevření ale selžou — proto aplikace
    // před prvním dotazem čeká na `openVerified`.
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name, 500);
      request.onupgradeneeded = () => request.result.createObjectStore('jineData');
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    const foreign = createDb(name);
    await openVerified(foreign);
    await expect(subjectsRepo(foreign).list()).resolves.toEqual([]);
    await foreign.delete();
  });

  it('když tabulky po otevření přesto chybí, skončí to srozumitelnou chybou', async () => {
    const broken = createDb(`rozbita-${Date.now()}`);
    vi.spyOn(broken, 'open').mockResolvedValue(broken);
    vi.spyOn(broken, 'backendDB').mockReturnValue({
      objectStoreNames: { contains: (store: string) => store === 'meta' },
    } as unknown as IDBDatabase);

    await expect(openVerified(broken)).rejects.toMatchObject({
      name: 'SchemaMismatchError',
      message: expect.stringContaining('subjects, lectures'),
    });
  });
});

describe('meta', () => {
  it('uloží a přečte hodnotu, neznámý klíč vrátí undefined', async () => {
    const meta = metaRepo(db);
    expect(await meta.get('lastExportAt')).toBeUndefined();

    await meta.set('lastExportAt', '2026-09-15T10:00:00.000Z');
    expect(await meta.get('lastExportAt')).toBe('2026-09-15T10:00:00.000Z');

    await meta.set('lastExportAt', null);
    expect(await meta.get('lastExportAt')).toBeNull();
  });
});

describe('pořadí předmětů', () => {
  it('posune předmět nahoru i dolů a pořadí přečísluje souvisle', async () => {
    const a = await subjects.create(subjectInput({ name: 'A', sortOrder: 5 }));
    const b = await subjects.create(subjectInput({ name: 'B', sortOrder: 5 }));
    const c = await subjects.create(subjectInput({ name: 'C', sortOrder: 9 }));

    await subjects.move(c.id, -1);
    expect((await subjects.list()).map((s) => s.name)).toEqual(['A', 'C', 'B']);
    expect((await subjects.list()).map((s) => s.sortOrder)).toEqual([0, 1, 2]);

    await subjects.move(a.id, 1);
    expect((await subjects.list()).map((s) => s.name)).toEqual(['C', 'A', 'B']);
    void b;
  });

  it('na okraji seznamu nic neudělá', async () => {
    const a = await subjects.create(subjectInput({ name: 'A', sortOrder: 0 }));
    await subjects.move(a.id, -1);
    expect((await subjects.list()).map((s) => s.name)).toEqual(['A']);
  });
});

describe('pořadí a archiv', () => {
  it('posun přeskočí skryté archivované předměty', async () => {
    const a = await subjects.create(subjectInput({ name: 'A', sortOrder: 0 }));
    const hidden = await subjects.create(subjectInput({ name: 'Archiv', sortOrder: 1, archived: true }));
    const b = await subjects.create(subjectInput({ name: 'B', sortOrder: 2 }));
    await subjects.move(b.id, -1);
    expect((await subjects.list()).map((s) => s.name)).toEqual(['B', 'A']);
    void a;
    void hidden;
  });
});
