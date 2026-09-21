import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { SCHEMA_V1, SCHEMA_V2_ADDED, SCHEMA_VERSION, createDb, openVerified, type StudiumDB } from './db';
import { scheduleRepo, slotsRepo, termsRepo } from './schedule';
import { subjectsRepo } from './subjects';
import { lecturesRepo } from './lectures';
import { nextSubjectInput } from '../domain/defaults';
import { freshDb } from '../test/factories';
import type { SlotInput, Subject } from '../domain/types';

let db: StudiumDB;

beforeEach(() => {
  db = freshDb();
});

afterEach(async () => {
  await db.delete();
});

async function subject(overrides: Partial<Subject> = {}): Promise<Subject> {
  return subjectsRepo(db).create({ ...nextSubjectInput([]), name: 'Analýza', code: 'ZMA', term: '2026/27 ZS', ...overrides });
}

function slotInput(subjectId: string, overrides: Partial<SlotInput> = {}): SlotInput {
  return {
    subjectId,
    kind: 'lecture',
    dayOfWeek: 1,
    start: '09:00',
    end: '10:30',
    room: 'NA-A01',
    teacher: 'doc. Novák',
    parity: 'every',
    weekFrom: null,
    weekTo: null,
    note: '',
    ...overrides,
  };
}

describe('syncSubject', () => {
  it('vytvoří přednášky podle rozvrhu se semestrem z předvolby', async () => {
    const s = await subject();
    await slotsRepo(db).create(slotInput(s.id));

    const result = await scheduleRepo(db).syncSubject(s.id, '2026-09-10');
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.created).toBe(12);

    const lectures = await lecturesRepo(db).listBySubject(s.id);
    expect(lectures.map((l) => l.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(lectures[0]?.date).toBe('2026-09-14');
    expect(lectures[0]?.lecturer).toBe('doc. Novák');
    // Předvolba semestru se při tom uložila do databáze.
    expect(await termsRepo(db).get('2026/27 ZS')).toBeDefined();
  });

  it('dvě zařízení vytvoří z téže hodiny záznamy se stejným id', async () => {
    const s = await subject();
    const slot = await slotsRepo(db).create(slotInput(s.id));
    await scheduleRepo(db).syncSubject(s.id, '2026-09-10');

    const other = createDb(`druhe-zarizeni-${Date.now()}`);
    try {
      await other.subjects.put(s);
      await other.slots.put(slot);
      await scheduleRepo(other).syncSubject(s.id, '2026-09-10');
      const ids = async (d: StudiumDB): Promise<string[]> => (await d.lectures.toArray()).map((l) => l.id).toSorted();
      expect(await ids(other)).toEqual(await ids(db));
    } finally {
      await other.delete();
    }
  });

  it('ručně přesunutá přednáška o své id nepřijde, i když se její termín doplní znovu', async () => {
    const s = await subject();
    await slotsRepo(db).create(slotInput(s.id));
    await scheduleRepo(db).syncSubject(s.id, '2026-09-10');
    const firstId = (await lecturesRepo(db).listBySubject(s.id))[0]?.id ?? '';
    expect(firstId).not.toBe('');
    // Přesun o dva týdny: od rozvrhu se odpojí a jeho původní termín zůstane volný.
    await lecturesRepo(db).update(firstId, { date: '2026-09-30', summary: 'limity' });

    await scheduleRepo(db).syncSubject(s.id, '2026-09-10');

    expect((await db.lectures.get(firstId))?.summary).toBe('limity');
    const onOldDate = (await lecturesRepo(db).listBySubject(s.id)).filter((l) => l.date === '2026-09-14');
    expect(onOldDate).toHaveLength(1);
    expect(onOldDate[0]?.id).not.toBe(firstId);
  });

  it('bez známého semestru nic nevytvoří a řekne proč', async () => {
    const s = await subject({ term: '2031/32 LS' });
    await slotsRepo(db).create(slotInput(s.id));
    expect(await scheduleRepo(db).syncSubject(s.id)).toEqual({ status: 'no-term', term: '2031/32 LS' });
  });

  it('druhé spuštění nic nezmění', async () => {
    const s = await subject();
    await slotsRepo(db).create(slotInput(s.id));
    await scheduleRepo(db).syncSubject(s.id, '2026-09-10');
    const second = await scheduleRepo(db).syncSubject(s.id, '2026-09-10');
    expect(second.status === 'ok' && second.created + second.removed + second.renumbered).toBe(0);
  });

  it('zachová rozpracovanou práci i po přesunu hodiny', async () => {
    const s = await subject();
    const slot = await slotsRepo(db).create(slotInput(s.id));
    await scheduleRepo(db).syncSubject(s.id, '2026-09-10');
    const lectures = await lecturesRepo(db).listBySubject(s.id);
    const future = lectures[5];
    if (future === undefined) throw new Error('chybí přednáška');
    await lecturesRepo(db).update(future.id, { summary: 'Předběžné poznámky' });

    await slotsRepo(db).update(slot.id, { dayOfWeek: 3 });
    await scheduleRepo(db).syncSubject(s.id, '2026-09-10');

    const after = await lecturesRepo(db).listBySubject(s.id);
    expect(after.find((l) => l.id === future.id)?.summary).toBe('Předběžné poznámky');
  });

  it('ručně přesunutá přednáška se od rozvrhu odpojí a při další synchronizaci nezmizí', async () => {
    const s = await subject();
    const slot = await slotsRepo(db).create(slotInput(s.id));
    await scheduleRepo(db).syncSubject(s.id, '2026-09-10');
    const lectures = await lecturesRepo(db).listBySubject(s.id);
    const moved = lectures.find((l) => l.date === '2026-10-05');
    if (moved === undefined) throw new Error('chybí přednáška');

    // Přeložená hodina: z pondělí 5. 10. na středu 7. 10.
    const updated = await lecturesRepo(db).update(moved.id, { date: '2026-10-07' });
    expect(updated.slotId).toBeNull();

    // Úprava rozvrhu spustí synchronizaci — přesunutá přednáška musí zůstat.
    await slotsRepo(db).update(slot.id, { room: 'NA-A02' });
    await scheduleRepo(db).syncSubject(s.id, '2026-09-10');
    const after = await lecturesRepo(db).listBySubject(s.id);
    expect(after.find((l) => l.id === moved.id)?.date).toBe('2026-10-07');
    // A na původní termín nevznikla přednáška navíc.
    expect(after.some((l) => l.date === '2026-10-05')).toBe(false);
    expect(after).toHaveLength(12);
  });

  it('změna jiných údajů přednášku od rozvrhu neodpojí', async () => {
    const s = await subject();
    await slotsRepo(db).create(slotInput(s.id));
    await scheduleRepo(db).syncSubject(s.id, '2026-09-10');
    const first = (await lecturesRepo(db).listBySubject(s.id))[0];
    if (first === undefined) throw new Error('chybí přednáška');
    const updated = await lecturesRepo(db).update(first.id, { title: 'Úvod', date: first.date });
    expect(updated.slotId).not.toBeNull();
  });

  it('vrácení synchronizace obnoví přesně původní stav', async () => {
    const s = await subject();
    await lecturesRepo(db).createNext(s.id, { date: '2026-09-14', title: 'Ruční' });
    const before = await lecturesRepo(db).listRaw();

    await slotsRepo(db).create(slotInput(s.id));
    const result = await scheduleRepo(db).syncSubject(s.id, '2026-09-10');
    if (result.status !== 'ok') throw new Error('synchronizace selhala');
    await scheduleRepo(db).undoSync(result.undo);

    expect(await lecturesRepo(db).listRaw()).toEqual(before);
  });
});

describe('semestry', () => {
  it('uložení odmítne nesmyslné zadání', async () => {
    const result = await termsRepo(db).save({
      id: '2026/27 LS',
      teachingStart: '2027-05-01',
      teachingEnd: '2027-02-01',
      skipDates: [],
    });
    expect(typeof result).toBe('string');
  });

  it('volno uloží seřazené a bez duplicit', async () => {
    const result = await termsRepo(db).save({
      id: '2026/27 LS',
      teachingStart: '2027-02-15',
      teachingEnd: '2027-05-15',
      skipDates: ['2027-05-08', '2027-05-01', '2027-05-08'],
    });
    expect(typeof result !== 'string' && result.skipDates).toEqual(['2027-05-01', '2027-05-08']);
  });
});

describe('předmět a jeho rozvrh', () => {
  it('smazání předmětu schová i jeho hodiny, obnovení je vrátí', async () => {
    const s = await subject();
    await slotsRepo(db).create(slotInput(s.id));
    await subjectsRepo(db).softDelete(s.id);
    expect(await slotsRepo(db).listBySubject(s.id)).toHaveLength(0);
    await subjectsRepo(db).restore(s.id);
    expect(await slotsRepo(db).listBySubject(s.id)).toHaveLength(1);
  });
});

describe('migrace schématu 1 → 2', () => {
  it('stará data přežijí a přednášky dostanou nová pole', async () => {
    const name = `migrace-${Date.now()}`;

    // Databáze přesně tak, jak ji založila verze 1 aplikace.
    const legacy = new Dexie(name);
    legacy.version(1).stores(SCHEMA_V1);
    await legacy.open();
    await legacy.table('subjects').add({
      id: 's1',
      name: 'Analýza',
      code: 'ZMA',
      term: '2026/27 ZS',
      color: 'sky',
      lmsUrl: null,
      defaultLecturer: null,
      archived: false,
      sortOrder: 0,
      createdAt: '2026-09-01T08:00:00.000Z',
      updatedAt: '2026-09-01T08:00:00.000Z',
      deletedAt: null,
    });
    await legacy.table('lectures').add({
      id: 'l1',
      subjectId: 's1',
      number: 1,
      title: 'Limity',
      date: '2026-09-14',
      lecturer: null,
      hasSlides: true,
      hasTranscript: false,
      status: 'summary',
      statusAt: { summary: '2026-09-15T18:00:00.000Z' },
      note: 'důležité',
      url: null,
      tags: ['zkouška'],
      createdAt: '2026-09-01T08:00:00.000Z',
      updatedAt: '2026-09-15T18:00:00.000Z',
      deletedAt: null,
    });
    legacy.close();

    const upgraded = createDb(name);
    try {
      await openVerified(upgraded);
      const lecture = await upgraded.lectures.get('l1');
      expect(lecture).toMatchObject({
        title: 'Limity',
        status: 'summary',
        note: 'důležité',
        tags: ['zkouška'],
        slotId: null,
        summary: '',
        focus: '',
        transcript: '',
      });
      expect(await upgraded.slots.count()).toBe(0);
      expect(await upgraded.terms.count()).toBe(0);
      expect(upgraded.verno).toBe(SCHEMA_VERSION);
      expect((await upgraded.subjects.get('s1'))?.examDate).toBeNull();
    } finally {
      await upgraded.delete();
    }
  });
});

describe('migrace schématu 2 → 3', () => {
  it('předměty dostanou prázdný termín zkoušky, rozvrh zůstane', async () => {
    const name = `migrace-v2-${Date.now()}`;
    const legacy = new Dexie(name);
    legacy.version(1).stores(SCHEMA_V1);
    legacy.version(2).stores(SCHEMA_V2_ADDED);
    await legacy.open();
    await legacy.table('subjects').add({
      id: 's1',
      name: 'Fyzika',
      code: 'FYZ',
      term: '2026/27 ZS',
      color: 'amber',
      lmsUrl: null,
      defaultLecturer: null,
      archived: false,
      sortOrder: 0,
      createdAt: '2026-09-01T08:00:00.000Z',
      updatedAt: '2026-09-01T08:00:00.000Z',
      deletedAt: null,
    });
    await legacy.table('slots').add({
      id: 'slot1',
      subjectId: 's1',
      kind: 'lecture',
      dayOfWeek: 4,
      start: '14:15',
      end: '15:45',
      room: 'NA-A03',
      teacher: null,
      parity: 'every',
      note: '',
      createdAt: '2026-09-01T08:00:00.000Z',
      updatedAt: '2026-09-01T08:00:00.000Z',
      deletedAt: null,
    });
    legacy.close();

    const upgraded = createDb(name);
    try {
      await openVerified(upgraded);
      expect((await upgraded.subjects.get('s1'))?.examDate).toBeNull();
      // Migrace 3 → 4: stará hodina platí dál celý semestr.
      expect(await upgraded.slots.get('slot1')).toMatchObject({ room: 'NA-A03', weekFrom: null, weekTo: null });
    } finally {
      await upgraded.delete();
    }
  });
});
