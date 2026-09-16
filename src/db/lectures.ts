import type { StudiumDB } from './db';
import { newId } from './db';
import { nowIso } from '../domain/date';
import { compareByNumber } from '../domain/filter';
import { nextLectureInput } from '../domain/defaults';
import type {
  Id,
  Lecture,
  LectureInput,
  LecturePatch,
  LectureStatus,
  StatusTimestamps,
} from '../domain/types';

export function lecturesRepo(db: StudiumDB) {
  return {
    /** Živé přednášky jednoho předmětu, seřazené podle pořadového čísla. */
    async listBySubject(subjectId: Id): Promise<Lecture[]> {
      const rows = await db.lectures.where('subjectId').equals(subjectId).toArray();
      return rows.filter((l) => l.deletedAt === null).sort(compareByNumber);
    },

    /** Všechny živé přednášky napříč předměty — podklad pro „Co mě čeká“ a filtry. */
    async listAll(): Promise<Lecture[]> {
      const rows = await db.lectures.toArray();
      return rows.filter((l) => l.deletedAt === null);
    },

    /** Včetně smazaných — pro export. */
    async listRaw(): Promise<Lecture[]> {
      return db.lectures.toArray();
    },

    async get(id: Id): Promise<Lecture | undefined> {
      const found = await db.lectures.get(id);
      return found?.deletedAt === null ? found : undefined;
    },

    async create(input: LectureInput, now: string = nowIso()): Promise<Lecture> {
      const statusAt: StatusTimestamps = {};
      if (input.status !== 'not_started') statusAt[input.status] = now;

      const lecture: Lecture = {
        ...input,
        id: newId(),
        statusAt,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await db.lectures.add(lecture);
      return lecture;
    },

    /**
     * Přidání přednášky na dva kliky: všechno se odvodí z předchozí přednášky
     * téhož předmětu. Formulář z toho jen udělá předvyplněný návrh.
     *
     * Běží v transakci, protože mezi „zjisti nejvyšší číslo“ a „zapiš nové“ je
     * okno, do kterého se vejde druhé volání. Bez ní dvě rychlá klepnutí na
     * „Rychle přidat“ vyrobí dvě přednášky se stejným pořadovým číslem.
     */
    async createNext(subjectId: Id, overrides: LecturePatch = {}, now: string = nowIso()): Promise<Lecture> {
      return db.transaction('rw', db.subjects, db.lectures, async () => {
        const subject = await db.subjects.get(subjectId);
        if (subject === undefined) throw new Error(`Předmět ${subjectId} neexistuje.`);
        const existing = await db.lectures.where('subjectId').equals(subjectId).toArray();
        const draft = nextLectureInput(subject, existing);
        return this.create({ ...draft, ...overrides }, now);
      });
    },

    async update(id: Id, patch: LecturePatch, now: string = nowIso()): Promise<Lecture> {
      const current = await db.lectures.get(id);
      if (current === undefined) throw new Error(`Přednáška ${id} neexistuje.`);

      const statusAt: StatusTimestamps = { ...current.statusAt };
      // Razítko se zapisuje jen při prvním dosažení stavu, aby překlik tam a zpět
      // nepřepsal datum, kdy jsi shrnutí opravdu dodělal.
      if (patch.status !== undefined && patch.status !== current.status) {
        statusAt[patch.status] ??= now;
      }

      const updated: Lecture = { ...current, ...patch, statusAt, updatedAt: now };
      await db.lectures.put(updated);
      return updated;
    },

    /** Přepnutí stavu přímo ze seznamu, bez otevírání detailu. */
    async setStatus(id: Id, status: LectureStatus, now: string = nowIso()): Promise<Lecture> {
      return this.update(id, { status }, now);
    },

    async softDelete(id: Id, now: string = nowIso()): Promise<void> {
      const lecture = await db.lectures.get(id);
      if (lecture === undefined) return;
      await db.lectures.put({ ...lecture, deletedAt: now, updatedAt: now });
    },

    async restore(id: Id, now: string = nowIso()): Promise<void> {
      const lecture = await db.lectures.get(id);
      if (lecture === undefined) return;
      await db.lectures.put({ ...lecture, deletedAt: null, updatedAt: now });
    },

    async purgeDeleted(days: number, now: Date = new Date()): Promise<number> {
      const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString();
      const stale = (await db.lectures.toArray()).filter(
        (l) => l.deletedAt !== null && l.deletedAt < cutoff,
      );
      await db.lectures.bulkDelete(stale.map((l) => l.id));
      return stale.length;
    },
  };
}

export type LecturesRepo = ReturnType<typeof lecturesRepo>;
