import { formatCsDate } from './date';
import { lectureDisplayTitle } from './defaults';
import type { Lecture, Subject } from './types';
import { NONE_PENDING, isAhead, type NotYetHeld } from './held';

export interface SheetEntry {
  lecture: Lecture;
  summary: string;
  focus: string;
}

/** Přednášky předmětu, které mají co ukázat, seřazené podle čísla. */
export function sheetEntries(subject: Subject, lectures: readonly Lecture[]): SheetEntry[] {
  return lectures
    .filter((l) => l.subjectId === subject.id && l.deletedAt === null && l.status !== 'skipped')
    .filter((l) => l.summary.trim() !== '' || l.focus.trim() !== '')
    .toSorted((a, b) => a.number - b.number)
    .map((lecture) => ({ lecture, summary: lecture.summary.trim(), focus: lecture.focus.trim() }));
}

/** Kolik přednášek ještě zápis nemá — ať je jasné, že přehled není úplný. */
export function missingNotes(
  subject: Subject,
  lectures: readonly Lecture[],
  today: string,
  notYet: NotYetHeld = NONE_PENDING,
): Lecture[] {
  return lectures.filter(
    (l) =>
      l.subjectId === subject.id &&
      l.deletedAt === null &&
      l.status !== 'skipped' &&
      !isAhead(l, today, notYet) &&
      l.summary.trim() === '' &&
      l.focus.trim() === '',
  );
}

function heading(lecture: Lecture): string {
  const date = lecture.date === null ? '' : ` (${formatCsDate(lecture.date)})`;
  const title = lecture.title.trim() === '' ? '' : ` — ${lecture.title.trim()}`;
  return `${lecture.number}. přednáška${title}${date}`;
}

/**
 * Celý předmět jako Markdown — do Obsidianu, na Google Disk, nebo vytisknout.
 * Nahoře souhrn „na co se zaměřit“ ze všech přednášek, pod ním učivo po přednáškách.
 */
export function studySheetMarkdown(subject: Subject, lectures: readonly Lecture[]): string {
  const entries = sheetEntries(subject, lectures);
  const exam = subject.examDate === null ? '' : ` · zkouška ${formatCsDate(subject.examDate)}`;
  const lines: string[] = [`# ${subject.code ? `${subject.code} — ` : ''}${subject.name}`, '', `Semestr ${subject.term}${exam}`, ''];

  const focused = entries.filter((e) => e.focus !== '');
  if (focused.length > 0) {
    lines.push('## Na co se zaměřit', '');
    for (const entry of focused) {
      lines.push(`### ${lectureDisplayTitle(entry.lecture)}`, '', entry.focus, '');
    }
  }

  if (entries.length > 0) {
    lines.push('## Učivo po přednáškách', '');
    for (const entry of entries) {
      lines.push(`### ${heading(entry.lecture)}`, '');
      if (entry.summary !== '') lines.push(entry.summary, '');
      if (entry.focus !== '') lines.push(`**Zaměřit se:** ${entry.focus}`, '');
    }
  } else {
    lines.push('_Zatím žádné zápisky._', '');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

export function studySheetFilename(subject: Subject): string {
  const base = (subject.code || subject.name || 'predmet')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${base || 'predmet'}-priprava.md`;
}
