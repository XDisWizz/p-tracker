import type { StudiumDB } from './db';
import { newId } from './db';
import { nowIso } from '../domain/date';
import type { Id, Subject, SubjectInput, SubjectPatch } from '../domain/types';

export function subjectsRepo(db: StudiumDB) {
  return {
    /** Všechny živé předměty, seřazené podle ručního pořadí a pak názvu. */
    async list(options: { includeArchived?: boolean } = {}): Promise<Subject[]> {
      const all = await db.subjects.toArray();
      return all
        .filter((s) => s.deletedAt === null)
        .filter((s) => options.includeArchived === true || !s.archived)
        .toSorted((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'cs'));
    },

    /** Včetně archivovaných i smazaných — pro export a diagnostiku. */
    async listRaw(): Promise<Subject[]> {
      return db.subjects.toArray();
    },

    async get(id: Id): Promise<Subject | undefined> {
      const found = await db.subjects.get(id);
      return found?.deletedAt === null ? found : undefined;
    },

    async create(input: SubjectInput, now: string = nowIso()): Promise<Subject> {
      const subject: Subject = {
        ...input,
        id: newId(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await db.subjects.add(subject);
      return subject;
    },

    async update(id: Id, patch: SubjectPatch, now: string = nowIso()): Promise<Subject> {
      const current = await db.subjects.get(id);
      if (current === undefined) throw new Error(`Předmět ${id} neexistuje.`);
      const updated: Subject = { ...current, ...patch, updatedAt: now };
      await db.subjects.put(updated);
      return updated;
    },

    /**
     * Měkké smazání. Záznam zůstává jako tombstone kvůli funkci Zpět a kvůli
     * tomu, aby se při budoucí synchronizaci smazání přeneslo na druhé zařízení.
     *
     * Přednášky se označí stejným časovým razítkem — podle něj se při obnovení
     * pozná, které patřily k tomuhle smazání a které jsi smazal dřív ručně.
     */
    async softDelete(id: Id, now: string = nowIso()): Promise<void> {
      await db.transaction('rw', [db.subjects, db.lectures, db.slots], async () => {
        const subject = await db.subjects.get(id);
        if (subject === undefined) return;
        await db.subjects.put({ ...subject, deletedAt: now, updatedAt: now });
        const lectures = await db.lectures.where('subjectId').equals(id).toArray();
        const touched = lectures
          .filter((l) => l.deletedAt === null)
          .map((l) => ({ ...l, deletedAt: now, updatedAt: now }));
        if (touched.length > 0) await db.lectures.bulkPut(touched);
        // Hodiny v rozvrhu jdou s předmětem — jinak by v rozvrhu visely hodiny bez předmětu.
        const slots = await db.slots.where('subjectId').equals(id).toArray();
        const slotsTouched = slots
          .filter((s) => s.deletedAt === null)
          .map((s) => ({ ...s, deletedAt: now, updatedAt: now }));
        if (slotsTouched.length > 0) await db.slots.bulkPut(slotsTouched);
      });
    },

    async restore(id: Id, now: string = nowIso()): Promise<void> {
      await db.transaction('rw', [db.subjects, db.lectures, db.slots], async () => {
        const subject = await db.subjects.get(id);
        if (subject === undefined || subject.deletedAt === null) return;
        const deletedAt = subject.deletedAt;
        await db.subjects.put({ ...subject, deletedAt: null, updatedAt: now });
        const lectures = await db.lectures.where('subjectId').equals(id).toArray();
        const touched = lectures
          .filter((l) => l.deletedAt === deletedAt)
          .map((l) => ({ ...l, deletedAt: null, updatedAt: now }));
        if (touched.length > 0) await db.lectures.bulkPut(touched);
        const slots = await db.slots.where('subjectId').equals(id).toArray();
        const slotsTouched = slots
          .filter((s) => s.deletedAt === deletedAt)
          .map((s) => ({ ...s, deletedAt: null, updatedAt: now }));
        if (slotsTouched.length > 0) await db.slots.bulkPut(slotsTouched);
      });
    },

    async setArchived(id: Id, archived: boolean, now: string = nowIso()): Promise<Subject> {
      return this.update(id, { archived }, now);
    },

    /**
     * Posune předmět v seznamu o jedno místo. Pořadí se přitom přečísluje
     * souvisle od nuly — po importech a mazání v něm můžou být díry a duplicity,
     * a prosté prohození dvou čísel by pak nic neudělalo.
     */
    async move(id: Id, direction: -1 | 1, now: string = nowIso()): Promise<void> {
      await db.transaction('rw', db.subjects, async () => {
        const target = await db.subjects.get(id);
        if (target === undefined) return;
        // Jen mezi předměty, které jsou vidět spolu — jinak by posun přes skrytý
        // archivovaný předmět vypadal, že nic neudělal.
        const ordered = (await db.subjects.toArray())
          .filter((s) => s.deletedAt === null && s.archived === target.archived)
          .toSorted((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'cs'));
        const from = ordered.findIndex((s) => s.id === id);
        const to = from + direction;
        if (from === -1 || to < 0 || to >= ordered.length) return;
        const [moved] = ordered.splice(from, 1);
        if (moved === undefined) return;
        ordered.splice(to, 0, moved);
        const changed = ordered
          .map((subject, index) => ({ subject, index }))
          .filter(({ subject, index }) => subject.sortOrder !== index)
          .map(({ subject, index }) => ({ ...subject, sortOrder: index, updatedAt: now }));
        if (changed.length > 0) await db.subjects.bulkPut(changed);
      });
    },
  };
}

export type SubjectsRepo = ReturnType<typeof subjectsRepo>;
