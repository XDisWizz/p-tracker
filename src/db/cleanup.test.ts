import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanupRepo } from './cleanup';
import type { StudiumDB } from './db';
import { freshDb, makeLecture, makeSlot, makeSubject } from '../test/factories';

let db: StudiumDB;
const now = new Date('2026-12-01T12:00:00.000Z');

beforeEach(async () => {
  db = freshDb();
  await db.subjects.bulkAdd([
    makeSubject({ id: 'zivy' }),
    makeSubject({ id: 'stary-smazany', deletedAt: '2026-09-01T00:00:00.000Z' }),
    makeSubject({ id: 'cerstve-smazany', deletedAt: '2026-11-25T00:00:00.000Z' }),
  ]);
  await db.lectures.bulkAdd([
    makeLecture({ id: 'l-ziva' }),
    makeLecture({ id: 'l-stara', deletedAt: '2026-10-01T00:00:00.000Z' }),
  ]);
  await db.slots.bulkAdd([makeSlot({ id: 's-stara', deletedAt: '2026-10-01T00:00:00.000Z' })]);
});

afterEach(async () => {
  await db.delete();
});

describe('úklid smazaných', () => {
  it('spočítá jen smazané starší než 30 dní', async () => {
    expect(await cleanupRepo(db).count(30, now)).toEqual({ subjects: 1, lectures: 1, slots: 1, total: 3 });
  });

  it('odstraní staré tombstones a živé i čerstvě smazané nechá', async () => {
    await cleanupRepo(db).purge(30, now);
    expect((await db.subjects.toArray()).map((s) => s.id).toSorted()).toEqual(['cerstve-smazany', 'zivy']);
    expect((await db.lectures.toArray()).map((l) => l.id)).toEqual(['l-ziva']);
    expect(await db.slots.count()).toBe(0);
    expect((await cleanupRepo(db).count(30, now)).total).toBe(0);
  });
});
