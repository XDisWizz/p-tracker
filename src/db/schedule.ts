import type { StudiumDB } from './db';
import { newId } from './db';
import { nowIso, todayIso } from '../domain/date';
import { planLectureSync, type LectureSyncPlan } from '../domain/schedule';
import { termPreset, validateTerm } from '../domain/terms';
import type {
  Id,
  Lecture,
  ScheduleSlot,
  SlotInput,
  SlotPatch,
  Term,
  TermInput,
} from '../domain/types';

export function slotsRepo(db: StudiumDB) {
  return {
    async listAll(): Promise<ScheduleSlot[]> {
      return (await db.slots.toArray()).filter((s) => s.deletedAt === null);
    },

    async listBySubject(subjectId: Id): Promise<ScheduleSlot[]> {
      const rows = await db.slots.where('subjectId').equals(subjectId).toArray();
      return rows.filter((s) => s.deletedAt === null);
    },

    async get(id: Id): Promise<ScheduleSlot | undefined> {
      const found = await db.slots.get(id);
      return found?.deletedAt === null ? found : undefined;
    },

    async create(input: SlotInput, now: string = nowIso()): Promise<ScheduleSlot> {
      const slot: ScheduleSlot = { ...input, id: newId(), createdAt: now, updatedAt: now, deletedAt: null };
      await db.slots.add(slot);
      return slot;
    },

    async update(id: Id, patch: SlotPatch, now: string = nowIso()): Promise<ScheduleSlot> {
      const current = await db.slots.get(id);
      if (current === undefined) throw new Error(`Hodina ${id} neexistuje.`);
      const updated: ScheduleSlot = { ...current, ...patch, updatedAt: now };
      await db.slots.put(updated);
      return updated;
    },

    async softDelete(id: Id, now: string = nowIso()): Promise<void> {
      const slot = await db.slots.get(id);
      if (slot === undefined) return;
      await db.slots.put({ ...slot, deletedAt: now, updatedAt: now });
    },

    async restore(id: Id, now: string = nowIso()): Promise<void> {
      const slot = await db.slots.get(id);
      if (slot === undefined) return;
      await db.slots.put({ ...slot, deletedAt: null, updatedAt: now });
    },
  };
}

export type SlotsRepo = ReturnType<typeof slotsRepo>;

export function termsRepo(db: StudiumDB) {
  return {
    async list(): Promise<Term[]> {
      return (await db.terms.toArray()).filter((t) => t.deletedAt === null).sort((a, b) => (a.id < b.id ? 1 : -1));
    },

    async get(id: string): Promise<Term | undefined> {
      const found = await db.terms.get(id);
      return found?.deletedAt === null ? found : undefined;
    },

    /** Uloží období výuky. Vrací chybovou hlášku, když zadání nedává smysl. */
    async save(input: TermInput, now: string = nowIso()): Promise<Term | string> {
      const problem = validateTerm(input);
      if (problem !== null) return problem;
      const existing = await db.terms.get(input.id);
      const term: Term = {
        ...input,
        skipDates: [...new Set(input.skipDates)].sort(),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
      };
      await db.terms.put(term);
      return term;
    },

    /** Semestr podle jména; když chybí a je mezi předvolbami, rovnou ho založí. */
    async resolve(id: string, now: string = nowIso()): Promise<Term | undefined> {
      const found = await db.terms.get(id);
      if (found !== undefined && found.deletedAt === null) return found;
      const preset = termPreset(id);
      if (preset === undefined) return undefined;
      const term: Term = { ...preset, createdAt: now, updatedAt: now, deletedAt: null };
      await db.terms.put(term);
      return term;
    },
  };
}

export type TermsRepo = ReturnType<typeof termsRepo>;

export interface SyncUndo {
  /** Stav přednášek předmětu před synchronizací. */
  before: Lecture[];
  /** Přednášky, které synchronizace založila — při vrácení se odstraní úplně. */
  createdIds: Id[];
}

export type SyncResult =
  | { status: 'no-subject' }
  | { status: 'no-term'; term: string }
  | {
      status: 'ok';
      created: number;
      removed: number;
      linked: number;
      renumbered: number;
      plan: LectureSyncPlan;
      undo: SyncUndo;
    };

export function scheduleRepo(db: StudiumDB) {
  const terms = termsRepo(db);

  return {
    /**
     * Srovná přednášky předmětu s jeho rozvrhem: doplní chybějící, nedotčené
     * přesunuté smaže, ručně přidané přiřadí k hodině a přečísluje podle data.
     * Celé v jedné transakci — buď proběhne všechno, nebo nic.
     */
    async syncSubject(subjectId: Id, today: string = todayIso(), now: string = nowIso()): Promise<SyncResult> {
      return db.transaction('rw', [db.subjects, db.lectures, db.slots, db.terms], async (): Promise<SyncResult> => {
        const subject = await db.subjects.get(subjectId);
        if (subject === undefined || subject.deletedAt !== null) return { status: 'no-subject' };

        const term = await terms.resolve(subject.term, now);
        if (term === undefined) return { status: 'no-term', term: subject.term };

        const [slots, lectures] = await Promise.all([
          db.slots.where('subjectId').equals(subjectId).toArray(),
          db.lectures.where('subjectId').equals(subjectId).toArray(),
        ]);
        const plan = planLectureSync(subjectId, slots, term, lectures, today);
        const slotById = new Map(slots.map((s) => [s.id, s]));
        const byId = new Map(lectures.map((l) => [l.id, l]));
        const changed = new Map<Id, Lecture>();
        const touch = (id: Id, patch: Partial<Lecture>): void => {
          const base = changed.get(id) ?? byId.get(id);
          if (base !== undefined) changed.set(id, { ...base, ...patch, updatedAt: now });
        };

        for (const { id, slotId } of plan.link) touch(id, { slotId });
        for (const { id, number } of plan.renumber) touch(id, { number });
        for (const id of plan.remove) touch(id, { deletedAt: now });

        const created: Lecture[] = plan.create.map((planned) => ({
          id: newId(),
          subjectId,
          number: planned.number,
          title: '',
          date: planned.date,
          lecturer: slotById.get(planned.slotId)?.teacher ?? subject.defaultLecturer,
          hasSlides: false,
          hasTranscript: false,
          status: 'not_started',
          statusAt: {},
          note: '',
          url: null,
          tags: [],
          slotId: planned.slotId,
          summary: '',
          focus: '',
          transcript: '',
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        }));

        if (changed.size > 0) await db.lectures.bulkPut([...changed.values()]);
        if (created.length > 0) await db.lectures.bulkAdd(created);

        return {
          status: 'ok',
          created: created.length,
          removed: plan.remove.length,
          linked: plan.link.length,
          renumbered: plan.renumber.length,
          plan,
          undo: { before: lectures, createdIds: created.map((l) => l.id) },
        };
      });
    },

    /** Synchronizuje všechny živé předměty, které mají aspoň jednu hodinu. */
    async syncAll(today: string = todayIso(), now: string = nowIso()): Promise<SyncResult[]> {
      const slots = (await db.slots.toArray()).filter((s) => s.deletedAt === null);
      const subjectIds = [...new Set(slots.map((s) => s.subjectId))];
      const results: SyncResult[] = [];
      for (const id of subjectIds) results.push(await this.syncSubject(id, today, now));
      return results;
    },

    async undoSync(undo: SyncUndo): Promise<void> {
      await db.transaction('rw', db.lectures, async () => {
        if (undo.createdIds.length > 0) await db.lectures.bulkDelete(undo.createdIds);
        if (undo.before.length > 0) await db.lectures.bulkPut(undo.before);
      });
    },
  };
}

export type ScheduleRepo = ReturnType<typeof scheduleRepo>;
