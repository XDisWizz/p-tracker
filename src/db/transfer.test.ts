import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EXPORT_FORMAT,
  applyImport,
  exportAll,
  exportAndMark,
  exportFilename,
  mergeRecords,
  parseExportFile,
  parseExportText,
  planImport,
  serializeExport,
} from './transfer';
import { SCHEMA_VERSION, type StudiumDB } from './db';
import { subjectsRepo } from './subjects';
import { lecturesRepo } from './lectures';
import { metaRepo } from './meta';
import { freshDb, makeLecture, makeSubject } from '../test/factories';
import { nextSubjectInput } from '../domain/defaults';
import type { ExportFile } from './transfer';

let db: StudiumDB;

beforeEach(() => {
  db = freshDb();
});

afterEach(async () => {
  await db.delete();
});

async function seed(): Promise<void> {
  const subjects = subjectsRepo(db);
  const lectures = lecturesRepo(db);
  const zma = await subjects.create({ ...nextSubjectInput([]), name: 'Analýza', code: 'ZMA' });
  const upa = await subjects.create({ ...nextSubjectInput([]), name: 'Programování', code: 'UPA' });
  await lectures.createNext(zma.id, { title: 'Limity', tags: ['dulezite'] });
  await lectures.createNext(zma.id, { status: 'summary' });
  await lectures.createNext(upa.id, { note: 'dodělat příklady' });
}

function fileFrom(subjects: ExportFile['subjects'], lectures: ExportFile['lectures']): ExportFile {
  return {
    format: EXPORT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: '2026-09-15T10:00:00.000Z',
    subjects,
    lectures,
  };
}

describe('export', () => {
  it('vezme všechno včetně tombstones — jinak by se smazání nepřeneslo', async () => {
    await seed();
    const all = await subjectsRepo(db).list();
    const first = all[0];
    if (first === undefined) throw new Error('chybí testovací data');
    await subjectsRepo(db).softDelete(first.id);

    const file = await exportAll(db);
    expect(file.subjects).toHaveLength(2);
    expect(file.subjects.some((s) => s.deletedAt !== null)).toBe(true);
  });

  it('má hlavičku, podle které jde soubor poznat', async () => {
    const file = await exportAll(db);
    expect(file.format).toBe(EXPORT_FORMAT);
    expect(file.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('poznamená si čas zálohy pro pozdější připomínku', async () => {
    await exportAndMark(db, '2026-09-15T10:00:00.000Z');
    expect(await metaRepo(db).get('lastExportAt')).toBe('2026-09-15T10:00:00.000Z');
  });

  it('název souboru obsahuje datum', () => {
    expect(exportFilename('2026-09-15')).toBe('studium-prehled-2026-09-15.json');
  });
});

describe('round-trip', () => {
  it('export → JSON → import → export dá bitově totéž', async () => {
    await seed();
    const original = await exportAll(db, '2026-09-15T10:00:00.000Z');

    // Průchod přes skutečný text souboru, ne jen přes objekt v paměti.
    const parsed = parseExportFile(JSON.parse(JSON.stringify(original)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const target = freshDb();
    try {
      await applyImport(target, parsed.file, 'replace');
      const reexported = await exportAll(target, '2026-09-15T10:00:00.000Z');
      expect(reexported).toEqual(original);
    } finally {
      await target.delete();
    }
  });

  it('žádné pole se cestou neztratí na undefined', async () => {
    await seed();
    const original = await exportAll(db);
    const text = JSON.stringify(original);
    expect(text).not.toContain('undefined');
    expect(JSON.parse(text)).toEqual(original);
  });
});

describe('validace importu', () => {
  it('odmítne cizí JSON', () => {
    const result = parseExportFile({ neco: 'jineho' });
    expect(result.ok).toBe(false);
  });

  it('odmítne, co není objekt', () => {
    expect(parseExportFile('ahoj').ok).toBe(false);
    expect(parseExportFile(null).ok).toBe(false);
    expect(parseExportFile([]).ok).toBe(false);
  });

  it('odmítne zálohu z novější verze aplikace a řekne proč', () => {
    const result = parseExportFile({
      format: EXPORT_FORMAT,
      schemaVersion: SCHEMA_VERSION + 1,
      subjects: [],
      lectures: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('novější');
  });

  it('odmítne poškozený záznam a pojmenuje ho', () => {
    const broken = { ...makeSubject(), sortOrder: 'nula' };
    const result = parseExportFile(fileFrom([broken] as never, []));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Předmět #1');
  });

  it('odmítne neznámý stav přednášky', () => {
    const broken = { ...makeLecture(), status: 'hotovo' };
    const result = parseExportFile(fileFrom([], [broken] as never));
    expect(result.ok).toBe(false);
  });

  it('projde prázdnou zálohou', () => {
    expect(parseExportFile(fileFrom([], [])).ok).toBe(true);
  });
});

describe('mergeRecords', () => {
  const mine = makeSubject({ id: 'a', name: 'Moje', updatedAt: '2026-09-10T00:00:00.000Z' });
  const theirsNewer = makeSubject({ id: 'a', name: 'Jejich', updatedAt: '2026-09-20T00:00:00.000Z' });
  const theirsOlder = makeSubject({ id: 'a', name: 'Jejich', updatedAt: '2026-09-01T00:00:00.000Z' });
  const foreign = makeSubject({ id: 'b', name: 'Nový' });

  it('replace zahodí, co v souboru není', () => {
    const out = mergeRecords([mine, foreign], [theirsOlder], 'replace');
    expect(out.toRemove).toEqual(['b']);
    expect(out.result.map((s) => s.name)).toEqual(['Jejich']);
  });

  it('merge nic nemaže', () => {
    const out = mergeRecords([mine, foreign], [theirsNewer], 'merge-newer');
    expect(out.toRemove).toEqual([]);
    expect(out.result).toHaveLength(2);
  });

  it('merge-newer nechá vyhrát novější záznam', () => {
    expect(mergeRecords([mine], [theirsNewer], 'merge-newer').result[0]?.name).toBe('Jejich');
    expect(mergeRecords([mine], [theirsOlder], 'merge-newer').result[0]?.name).toBe('Moje');
  });

  it('při shodném čase nesahá na místní data', () => {
    const sameTime = makeSubject({ id: 'a', name: 'Jejich', updatedAt: mine.updatedAt });
    expect(mergeRecords([mine], [sameTime], 'merge-newer').result[0]?.name).toBe('Moje');
  });

  it('merge-keep-mine nechá vyhrát místní i proti novějšímu', () => {
    expect(mergeRecords([mine], [theirsNewer], 'merge-keep-mine').result[0]?.name).toBe('Moje');
  });

  it('spočítá přírůstky, změny a beze změny', () => {
    const out = mergeRecords([mine], [theirsNewer, foreign], 'merge-newer');
    expect(out.diff.added).toBe(1);
    expect(out.diff.updated).toBe(1);
    expect(out.conflicts).toBe(1);
  });

  it('shodný záznam není konflikt, i kdyby měl jinak seřazené klíče', () => {
    // Stejná data, jen klíče v opačném pořadí — tak, jak je může vyplivnout cizí nástroj.
    const reordered = Object.fromEntries(Object.entries(mine).reverse()) as typeof mine;
    const out = mergeRecords([mine], [reordered], 'merge-newer');
    expect(out.conflicts).toBe(0);
    expect(out.diff.unchanged).toBe(1);
  });

  it('přenese i tombstone, aby se smazání propsalo dál', () => {
    const deleted = makeSubject({ id: 'a', updatedAt: '2026-09-20T00:00:00.000Z', deletedAt: '2026-09-20T00:00:00.000Z' });
    const out = mergeRecords([mine], [deleted], 'merge-newer');
    expect(out.result[0]?.deletedAt).toBe('2026-09-20T00:00:00.000Z');
  });
});

describe('planImport a applyImport', () => {
  it('náhled nic nezapíše', async () => {
    await seed();
    const before = await exportAll(db, '2026-09-15T10:00:00.000Z');
    const incoming = fileFrom([makeSubject({ id: 'cizi' })], []);

    const plan = await planImport(db, incoming, 'merge-newer');
    expect(plan.subjects.added).toBe(1);

    const after = await exportAll(db, '2026-09-15T10:00:00.000Z');
    expect(after).toEqual(before);
  });

  it('náhled sedí na to, co import skutečně udělá', async () => {
    await seed();
    const incoming = fileFrom([makeSubject({ id: 'cizi' })], []);

    const plan = await planImport(db, incoming, 'merge-newer');
    const result = await applyImport(db, incoming, 'merge-newer');

    expect(result.subjects).toEqual(plan.subjects);
    expect(result.lectures).toEqual(plan.lectures);
    expect(result.conflicts).toBe(plan.conflicts);
  });

  it('replace vymění obsah databáze', async () => {
    await seed();
    const incoming = fileFrom([makeSubject({ id: 'jediny', name: 'Jediný' })], []);
    await applyImport(db, incoming, 'replace');

    const subjects = await subjectsRepo(db).list();
    expect(subjects.map((s) => s.name)).toEqual(['Jediný']);
    expect(await lecturesRepo(db).listAll()).toHaveLength(0);
  });

  it('merge přidá cizí data a moje nechá být', async () => {
    await seed();
    const mineBefore = await subjectsRepo(db).list();
    const incoming = fileFrom([makeSubject({ id: 'cizi', name: 'Cizí' })], []);

    await applyImport(db, incoming, 'merge-newer');

    const after = await subjectsRepo(db).list();
    expect(after).toHaveLength(mineBefore.length + 1);
    expect(after.some((s) => s.name === 'Cizí')).toBe(true);
  });

  it('import téhož souboru podruhé už nic nezmění', async () => {
    await seed();
    const file = await exportAll(db, '2026-09-15T10:00:00.000Z');

    const second = await applyImport(db, file, 'merge-newer');
    expect(second.conflicts).toBe(0);
    expect(second.subjects.added).toBe(0);
    expect(second.lectures.added).toBe(0);

    const after = await exportAll(db, '2026-09-15T10:00:00.000Z');
    expect(after).toEqual(file);
  });
});

describe('soubor zálohy', () => {
  it('text souboru projde zpět beze ztráty', async () => {
    await seed();
    const file = await exportAll(db, '2026-09-15T10:00:00.000Z');
    const parsed = parseExportText(serializeExport(file));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.file).toEqual(file);
  });

  it('nevalidní JSON vrátí srozumitelnou chybu místo výjimky', () => {
    const result = parseExportText('{ tohle není json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('JSON');
  });

  it('prázdný soubor neshodí aplikaci', () => {
    expect(parseExportText('').ok).toBe(false);
  });
});

describe('vrácení importu', () => {
  it('snímek pořízený před importem vrátí databázi přesně do původního stavu', async () => {
    await seed();
    const before = await exportAll(db, '2026-09-15T10:00:00.000Z');

    // Přesně tohle dělá aplikace: snímek, import, a „Zpět“ = snímek v režimu replace.
    const snapshot = await exportAll(db);
    await applyImport(db, fileFrom([makeSubject({ id: 'cizi' })], [makeLecture({ id: 'cizi-l', subjectId: 'cizi' })]), 'replace');
    await applyImport(db, snapshot, 'replace');

    expect(await exportAll(db, '2026-09-15T10:00:00.000Z')).toEqual(before);
  });
});
