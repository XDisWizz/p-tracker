import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { subjectsRepo } from '../db/subjects';
import { lecturesRepo } from '../db/lectures';
import { scheduleRepo, slotsRepo, termsRepo } from '../db/schedule';
import type { Id, Lecture, ScheduleSlot, Subject, Term } from '../domain/types';

/**
 * Reaktivní čtení z databáze.
 *
 * Tohle je důvod, proč aplikace nepotřebuje globální store: zdrojem pravdy je
 * IndexedDB a `useLiveQuery` překreslí každou komponentu, které se zápis týká.
 * V React state pak zůstává jen to, co je opravdu jen UI — otevřený modal,
 * rozepsaný formulář, zvolené téma.
 *
 * `undefined` znamená „ještě se načítá“, prázdné pole „opravdu nic tu není“.
 */

export const subjects = subjectsRepo(db);
export const lectures = lecturesRepo(db);
export const slots = slotsRepo(db);
export const terms = termsRepo(db);
export const schedule = scheduleRepo(db);

export function useSubjects(includeArchived = false): Subject[] | undefined {
  return useLiveQuery(() => subjects.list({ includeArchived }), [includeArchived]);
}

export function useSubject(id: Id | null): Subject | undefined | null {
  return useLiveQuery(async () => (id === null ? null : ((await subjects.get(id)) ?? null)), [id]);
}

export function useAllLectures(): Lecture[] | undefined {
  return useLiveQuery(() => lectures.listAll(), []);
}

export function useSubjectLectures(subjectId: Id | null): Lecture[] | undefined {
  return useLiveQuery(
    () => (subjectId === null ? Promise.resolve([]) : lectures.listBySubject(subjectId)),
    [subjectId],
  );
}

export function useLecture(id: Id | null): Lecture | null | undefined {
  return useLiveQuery(async () => (id === null ? null : ((await lectures.get(id)) ?? null)), [id]);
}

export function useSlots(): ScheduleSlot[] | undefined {
  return useLiveQuery(() => slots.listAll(), []);
}

export function useSubjectSlots(subjectId: Id | null): ScheduleSlot[] | undefined {
  return useLiveQuery(
    () => (subjectId === null ? Promise.resolve([]) : slots.listBySubject(subjectId)),
    [subjectId],
  );
}

export function useTerms(): Term[] | undefined {
  return useLiveQuery(() => terms.list(), []);
}
