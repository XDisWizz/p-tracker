import { LECTURE_STATUSES, type IsoDate, type Lecture, type LectureStatus } from './types';
import { isDone, isPending, isSkipped } from './status';

export interface Progress {
  /** Přednášky započítané do procent — všechny kromě přeskočených. */
  total: number;
  /** Ve stavu „shrnutí hotové“ nebo dál. */
  done: number;
  /** Nezačato nebo jen podklady stažené. Tohle číslo bolí. */
  pending: number;
  /** Vědomě přeskočené. Do `total` se nepočítají. */
  skipped: number;
  /**
   * Přednášky, které ještě neproběhly a nejsou hotové. Do `total` se nepočítají —
   * přednášky vygenerované z rozvrhu na celý semestr by jinak v září ukazovaly 1/13.
   */
  upcoming: number;
  /** Přesný podíl 0–1. Předmět bez přednášek má 0. */
  ratio: number;
  /** Zaokrouhlená procenta 0–100 pro popisek. */
  percent: number;
  /** Rozpad po stavech pro segmentovaný ukazatel. */
  byStatus: Record<LectureStatus, number>;
}

function emptyByStatus(): Record<LectureStatus, number> {
  const out = {} as Record<LectureStatus, number>;
  for (const status of LECTURE_STATUSES) out[status] = 0;
  return out;
}

/**
 * Spočítá postup nad libovolnou množinou přednášek — jednoho předmětu i všech dohromady.
 *
 * Smazané (tombstone) záznamy si odfiltruj předem; tahle funkce o databázi nic neví.
 */
export function computeProgress(lectures: readonly Lecture[], today: IsoDate | null = null): Progress {
  const byStatus = emptyByStatus();
  let done = 0;
  let pending = 0;
  let skipped = 0;
  let upcoming = 0;

  for (const lecture of lectures) {
    byStatus[lecture.status] += 1;
    if (isSkipped(lecture.status)) {
      skipped += 1;
      continue;
    }
    if (isDone(lecture.status)) {
      // Hotovou budoucí přednášku (připravená dopředu) počítáme normálně.
      done += 1;
      continue;
    }
    if (today !== null && lecture.date !== null && lecture.date > today) {
      upcoming += 1;
      continue;
    }
    if (isPending(lecture.status)) pending += 1;
  }

  const total = lectures.length - skipped - upcoming;
  const ratio = total === 0 ? 0 : Math.min(1, done / total);

  return { total, done, pending, skipped, upcoming, ratio, percent: Math.round(ratio * 100), byStatus };
}

/** Rozdělí přednášky podle předmětu. Pořadí uvnitř skupin zůstává zachované. */
export function groupBySubject(lectures: readonly Lecture[]): Map<string, Lecture[]> {
  const map = new Map<string, Lecture[]>();
  for (const lecture of lectures) {
    const bucket = map.get(lecture.subjectId);
    if (bucket) bucket.push(lecture);
    else map.set(lecture.subjectId, [lecture]);
  }
  return map;
}

/** Postup pro každý předmět naráz. Předměty bez přednášek dostanou nulový záznam. */
export function progressBySubject(
  lectures: readonly Lecture[],
  subjectIds: readonly string[],
  today: IsoDate | null = null,
): Map<string, Progress> {
  const grouped = groupBySubject(lectures);
  const out = new Map<string, Progress>();
  for (const id of subjectIds) out.set(id, computeProgress(grouped.get(id) ?? [], today));
  return out;
}

export const EMPTY_PROGRESS: Progress = computeProgress([]);
