import type { StudiumDB } from './db';

/** Smazané záznamy mladší než tohle se nechávají kvůli slučování záloh mezi zařízeními. */
export const CLEANUP_AFTER_DAYS = 30;

export interface StaleCounts {
  subjects: number;
  lectures: number;
  slots: number;
  total: number;
}

function cutoffIso(days: number, now: Date): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

/**
 * Trvalé odstranění starých smazaných záznamů (tombstones).
 *
 * Smazání se v aplikaci jen poznamená, aby šlo vrátit a aby se při sloučení
 * záloh přeneslo i na druhé zařízení. Po měsíci už obojí ztrácí smysl a záznamy
 * jen zabírají místo — hlavně smazané přednášky s dlouhým přepisem.
 */
export function cleanupRepo(db: StudiumDB) {
  const stale = <T extends { deletedAt: string | null }>(rows: T[], cutoff: string): T[] =>
    rows.filter((r) => r.deletedAt !== null && r.deletedAt < cutoff);

  return {
    async count(days = CLEANUP_AFTER_DAYS, now: Date = new Date()): Promise<StaleCounts> {
      const cutoff = cutoffIso(days, now);
      const [subjects, lectures, slots] = await Promise.all([
        db.subjects.toArray(),
        db.lectures.toArray(),
        db.slots.toArray(),
      ]);
      const counts = {
        subjects: stale(subjects, cutoff).length,
        lectures: stale(lectures, cutoff).length,
        slots: stale(slots, cutoff).length,
      };
      return { ...counts, total: counts.subjects + counts.lectures + counts.slots };
    },

    async purge(days = CLEANUP_AFTER_DAYS, now: Date = new Date()): Promise<StaleCounts> {
      const cutoff = cutoffIso(days, now);
      return db.transaction('rw', [db.subjects, db.lectures, db.slots], async () => {
        const [subjects, lectures, slots] = await Promise.all([
          db.subjects.toArray(),
          db.lectures.toArray(),
          db.slots.toArray(),
        ]);
        const s = stale(subjects, cutoff).map((r) => r.id);
        const l = stale(lectures, cutoff).map((r) => r.id);
        const sl = stale(slots, cutoff).map((r) => r.id);
        await Promise.all([db.subjects.bulkDelete(s), db.lectures.bulkDelete(l), db.slots.bulkDelete(sl)]);
        return { subjects: s.length, lectures: l.length, slots: sl.length, total: s.length + l.length + sl.length };
      });
    },
  };
}
