import type { IsoDate, Lecture, LectureInput, Subject, SubjectInput } from './types';
import { addDays, currentTerm, todayIso } from './date';
import { SUBJECT_COLORS } from './types';

/** Obvyklý rozestup přednášek — jednou týdně. */
const WEEK = 7;

/**
 * Předvyplnění nové přednášky. Celý smysl je v tom, aby stačilo dvakrát kliknout:
 * otevřít formulář a uložit. Název je proto nepovinný.
 *
 * Pravidla:
 *   číslo       — o jedna vyšší než nejvyšší existující (ne počet, kvůli dírám v číslování)
 *   datum       — od poslední *datované* přednášky o týden za každé chybějící číslo
 *   přednášející— zděděný z poslední přednášky, jinak výchozí z předmětu
 *   tagy        — zděděné, protože se u jednoho předmětu opakují
 */
export function nextLectureInput(
  subject: Subject,
  existing: readonly Lecture[],
  today: IsoDate = todayIso(),
): LectureInput {
  const live = existing.filter((l) => l.deletedAt === null && l.subjectId === subject.id);
  const highestNumber = live.reduce((max, l) => Math.max(max, l.number), 0);
  const number = highestNumber + 1;

  const previous = [...live].toSorted((a, b) => b.number - a.number)[0];
  const lastDated = [...live].filter((l) => l.date !== null).toSorted((a, b) => b.number - a.number)[0];

  let date: IsoDate = today;
  if (lastDated?.date) {
    // Chybí-li mezi poslední datovanou a novou přednáškou čísla, posuň se o odpovídající počet týdnů.
    const gap = Math.max(1, number - lastDated.number);
    date = addDays(lastDated.date, gap * WEEK);
  }

  return {
    subjectId: subject.id,
    number,
    title: '',
    date,
    lecturer: previous?.lecturer ?? subject.defaultLecturer,
    hasSlides: false,
    hasTranscript: false,
    status: 'not_started',
    note: '',
    url: null,
    tags: previous ? [...previous.tags] : [],
    slotId: null,
    summary: '',
    focus: '',
    transcript: '',
  };
}

/** Předvyplnění nového předmětu — barva se točí dokola, ať dva sousední nejsou stejné. */
export function nextSubjectInput(existing: readonly Subject[], now: Date = new Date()): SubjectInput {
  const live = existing.filter((s) => s.deletedAt === null);
  const usedColors = new Set(live.map((s) => s.color));
  const freeColor = SUBJECT_COLORS.find((c) => !usedColors.has(c));
  const fallback = SUBJECT_COLORS[live.length % SUBJECT_COLORS.length] ?? 'sky';
  const maxOrder = live.reduce((max, s) => Math.max(max, s.sortOrder), -1);

  return {
    name: '',
    code: '',
    term: currentTerm(now),
    color: freeColor ?? fallback,
    lmsUrl: null,
    defaultLecturer: null,
    archived: false,
    sortOrder: maxOrder + 1,
  };
}

/** Zobrazovaný název přednášky. Prázdný název je běžný stav, ne chyba. */
export function lectureDisplayTitle(lecture: Pick<Lecture, 'number' | 'title'>): string {
  const trimmed = lecture.title.trim();
  return trimmed.length > 0 ? trimmed : `${lecture.number}. přednáška`;
}

/** Záznam → hodnoty pro formulář. Metadata (id, razítka, tombstone) formulář nemá co měnit. */
export function lectureToInput(lecture: Lecture): LectureInput {
  return {
    subjectId: lecture.subjectId,
    number: lecture.number,
    title: lecture.title,
    date: lecture.date,
    lecturer: lecture.lecturer,
    hasSlides: lecture.hasSlides,
    hasTranscript: lecture.hasTranscript,
    status: lecture.status,
    note: lecture.note,
    url: lecture.url,
    tags: [...lecture.tags],
    slotId: lecture.slotId,
    summary: lecture.summary,
    focus: lecture.focus,
    transcript: lecture.transcript,
  };
}

export function subjectToInput(subject: Subject): SubjectInput {
  return {
    name: subject.name,
    code: subject.code,
    term: subject.term,
    color: subject.color,
    lmsUrl: subject.lmsUrl,
    defaultLecturer: subject.defaultLecturer,
    archived: subject.archived,
    sortOrder: subject.sortOrder,
  };
}
