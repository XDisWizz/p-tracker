import { addDays, daysBetween } from './date';
import type {
  Id,
  IsoDate,
  Lecture,
  ScheduleSlot,
  SlotKind,
  Subject,
  Term,
  TimeOfDay,
  WeekParity,
} from './types';

/* ---------- popisky ---------- */

export const DAY_LABELS = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle'] as const;
export const DAY_SHORT = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'] as const;

export function dayLabel(dayOfWeek: number): string {
  return DAY_LABELS[dayOfWeek - 1] ?? '?';
}

export function dayShort(dayOfWeek: number): string {
  return DAY_SHORT[dayOfWeek - 1] ?? '?';
}

export const SLOT_KIND_LABELS: Record<SlotKind, string> = {
  lecture: 'Přednáška',
  exercise: 'Cvičení',
  lab: 'Laboratoř',
  seminar: 'Seminář',
  other: 'Jiné',
};

/** Jednopísmenná značka do mřížky rozvrhu, jak ji zná Edison. */
export const SLOT_KIND_SHORT: Record<SlotKind, string> = {
  lecture: 'P',
  exercise: 'C',
  lab: 'L',
  seminar: 'S',
  other: '•',
};

export const PARITY_LABELS: Record<WeekParity, string> = {
  every: 'každý týden',
  odd: 'liché týdny',
  even: 'sudé týdny',
};

/**
 * Obvyklé vyučovací bloky, ze kterých jde rozvrh naklikat bez psaní časů.
 * Odpovídají běžnému členění výuky na VŠB (90 minut, 15 minut přestávka);
 * když nějaká hodina začíná jinak, čas jde zadat ručně.
 */
export const TEACHING_BLOCKS: ReadonlyArray<{ start: TimeOfDay; end: TimeOfDay }> = [
  { start: '07:15', end: '08:45' },
  { start: '09:00', end: '10:30' },
  { start: '10:45', end: '12:15' },
  { start: '12:30', end: '14:00' },
  { start: '14:15', end: '15:45' },
  { start: '16:00', end: '17:30' },
  { start: '17:45', end: '19:15' },
];

/* ---------- čas ---------- */

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(value: string): value is TimeOfDay {
  return TIME_PATTERN.test(value);
}

export function timeToMinutes(time: TimeOfDay): number {
  const [h, m] = time.split(':');
  return Number(h) * 60 + Number(m);
}

export function minutesToTime(minutes: number): TimeOfDay {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  const h = String(Math.floor(clamped / 60)).padStart(2, '0');
  const m = String(clamped % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/** Formát pro UI: „9:00“ — úvodní nula u hodin jen překáží. */
export function formatTime(time: TimeOfDay): string {
  return time.replace(/^0(\d)/, '$1');
}

/** Minuty od půlnoci podle místního času. */
export function minutesOfDay(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** „za 5 min“, „za 1 h 20 min“ — kolik zbývá do začátku. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/* ---------- týdny výuky ---------- */

/** Den v týdnu podle ISO: 1 = pondělí … 7 = neděle. */
export function isoWeekday(date: IsoDate): number {
  const [y, mo, d] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y ?? 1970, (mo ?? 1) - 1, d ?? 1)).getUTCDay();
  return day === 0 ? 7 : day;
}

export function mondayOf(date: IsoDate): IsoDate {
  return addDays(date, 1 - isoWeekday(date));
}

/**
 * Pořadí týdne výuky (1 = první) pro dané datum, nebo `null` mimo období výuky.
 * Počítá se po kalendářních týdnech od pondělí, takže když výuka začne ve
 * středu, je pondělí téhož týdne pořád „1. týden“ — jen se v něm nic nekoná.
 */
export function teachingWeek(term: Pick<Term, 'teachingStart' | 'teachingEnd'>, date: IsoDate): number | null {
  if (date < term.teachingStart || date > term.teachingEnd) return null;
  return Math.floor(daysBetween(mondayOf(term.teachingStart), mondayOf(date)) / 7) + 1;
}

export function teachingWeekCount(term: Pick<Term, 'teachingStart' | 'teachingEnd'>): number {
  if (term.teachingEnd < term.teachingStart) return 0;
  return teachingWeek(term, term.teachingEnd) ?? 0;
}

export function matchesParity(parity: WeekParity, week: number): boolean {
  if (parity === 'every') return true;
  return parity === 'odd' ? week % 2 === 1 : week % 2 === 0;
}

/** Všechna data, kdy se hodina v semestru koná. Dny volna vynechá. */
export function slotDates(slot: Pick<ScheduleSlot, 'dayOfWeek' | 'parity'>, term: Term): IsoDate[] {
  const weeks = teachingWeekCount(term);
  const firstMonday = mondayOf(term.teachingStart);
  const skip = new Set(term.skipDates);
  const out: IsoDate[] = [];
  for (let week = 1; week <= weeks; week += 1) {
    if (!matchesParity(slot.parity, week)) continue;
    const date = addDays(firstMonday, (week - 1) * 7 + slot.dayOfWeek - 1);
    if (date < term.teachingStart || date > term.teachingEnd || skip.has(date)) continue;
    out.push(date);
  }
  return out;
}

export interface OccurrenceCheck {
  occurs: boolean;
  /** Připadá na den volna — v rozvrhu se ukáže přeškrtnutě. */
  cancelled: boolean;
}

/**
 * Koná se hodina v daný den? Bez zadaného semestru se bere každý týden —
 * paritu pak určit nejde, ale rozvrh je i tak použitelný.
 */
export function occursOn(slot: ScheduleSlot, date: IsoDate, term: Term | undefined): OccurrenceCheck {
  if (isoWeekday(date) !== slot.dayOfWeek) return { occurs: false, cancelled: false };
  if (term === undefined) return { occurs: true, cancelled: false };
  const week = teachingWeek(term, date);
  if (week === null || !matchesParity(slot.parity, week)) return { occurs: false, cancelled: false };
  return { occurs: true, cancelled: term.skipDates.includes(date) };
}

/* ---------- konkrétní hodiny v kalendáři ---------- */

export interface Occurrence {
  slot: ScheduleSlot;
  subject: Subject;
  date: IsoDate;
  cancelled: boolean;
  startMin: number;
  endMin: number;
}

export interface ScheduleContext {
  slots: readonly ScheduleSlot[];
  subjects: readonly Subject[];
  terms: readonly Term[];
}

/** Hodiny v daný den, seřazené podle začátku. Archivované a smazané předměty vynechá. */
export function occurrencesOn(date: IsoDate, context: ScheduleContext): Occurrence[] {
  const subjects = new Map(
    context.subjects.filter((s) => s.deletedAt === null && !s.archived).map((s) => [s.id, s]),
  );
  const terms = new Map(context.terms.filter((t) => t.deletedAt === null).map((t) => [t.id, t]));
  const out: Occurrence[] = [];

  for (const slot of context.slots) {
    if (slot.deletedAt !== null) continue;
    const subject = subjects.get(slot.subjectId);
    if (subject === undefined) continue;
    const check = occursOn(slot, date, terms.get(subject.term));
    if (!check.occurs) continue;
    out.push({
      slot,
      subject,
      date,
      cancelled: check.cancelled,
      startMin: timeToMinutes(slot.start),
      endMin: timeToMinutes(slot.end),
    });
  }

  return out.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
}

export interface NowNext {
  /** Právě probíhající hodina. */
  current: Occurrence | null;
  /** Nejbližší další hodina — dnes, nebo v některém z příštích dnů. */
  next: Occurrence | null;
}

/**
 * Orientace mezi hodinami: co teď probíhá a kam jít potom. Hledá až dva
 * týdny dopředu, aby v pátek odpoledne ukázal pondělní ráno.
 */
export function nowAndNext(
  today: IsoDate,
  nowMinutes: number,
  context: ScheduleContext,
  horizonDays = 14,
): NowNext {
  const todays = occurrencesOn(today, context).filter((o) => !o.cancelled);
  const current = todays.find((o) => o.startMin <= nowMinutes && nowMinutes < o.endMin) ?? null;

  let next = todays.find((o) => o.startMin > nowMinutes) ?? null;
  for (let offset = 1; next === null && offset <= horizonDays; offset += 1) {
    next = occurrencesOn(addDays(today, offset), context).find((o) => !o.cancelled) ?? null;
  }

  return { current, next };
}

/* ---------- přednášky podle rozvrhu ---------- */

/**
 * Přednáška, na kterou uživatel ještě nesáhl. Jen takovou smí synchronizace
 * s rozvrhem smazat — cokoliv s poznámkou, přepisem nebo posunutým stavem je
 * práce, kterou nikdy nezahodíme.
 */
export function isUntouched(lecture: Lecture): boolean {
  return (
    lecture.status === 'not_started' &&
    lecture.title.trim() === '' &&
    lecture.summary.trim() === '' &&
    lecture.focus.trim() === '' &&
    lecture.transcript.trim() === '' &&
    lecture.note.trim() === '' &&
    lecture.url === null &&
    !lecture.hasSlides &&
    !lecture.hasTranscript
  );
}

export interface PlannedLecture {
  date: IsoDate;
  slotId: Id;
  number: number;
}

export interface LectureSyncPlan {
  create: PlannedLecture[];
  /** Ručně přidané přednášky, které sedí na termín z rozvrhu — jen se k němu přiřadí. */
  link: Array<{ id: Id; slotId: Id }>;
  /** Nedotčené budoucí přednášky, které po změně rozvrhu už nesedí. */
  remove: Id[];
  renumber: Array<{ id: Id; number: number }>;
}

export function isEmptyPlan(plan: LectureSyncPlan): boolean {
  return (
    plan.create.length === 0 &&
    plan.link.length === 0 &&
    plan.remove.length === 0 &&
    plan.renumber.length === 0
  );
}

/**
 * Co udělat, aby přednášky předmětu odpovídaly rozvrhu.
 *
 * Pravidla, na kterých záleží:
 *   – nikdy nevzniknou dvě přednášky na tentýž termín (ani s ručně přidanou),
 *   – smaže se jen nedotčená budoucí přednáška; minulost ani rozpracované se nemažou,
 *   – čísla se srovnají podle data, protože u předmětu s rozvrhem je pořadí dané časem,
 *   – opakované volání bez změny rozvrhu nedělá nic.
 */
export function planLectureSync(
  subjectId: Id,
  slots: readonly ScheduleSlot[],
  term: Term,
  lectures: readonly Lecture[],
  today: IsoDate,
): LectureSyncPlan {
  const live = lectures.filter((l) => l.subjectId === subjectId && l.deletedAt === null);
  const lectureSlots = slots
    .filter((s) => s.subjectId === subjectId && s.deletedAt === null && s.kind === 'lecture')
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || timeToMinutes(a.start) - timeToMinutes(b.start));

  const targets: Array<{ date: IsoDate; slot: ScheduleSlot }> = [];
  for (const slot of lectureSlots) {
    for (const date of slotDates(slot, term)) targets.push({ date, slot });
  }
  targets.sort(
    (a, b) =>
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
      timeToMinutes(a.slot.start) - timeToMinutes(b.slot.start),
  );

  const claimed = new Set<Id>();
  const toCreate: Array<{ date: IsoDate; slotId: Id }> = [];
  const link: Array<{ id: Id; slotId: Id }> = [];

  for (const target of targets) {
    const sameDay = live.filter((l) => l.date === target.date && !claimed.has(l.id));
    const exact = sameDay.find((l) => l.slotId === target.slot.id);
    const manual = sameDay.find((l) => l.slotId === null);
    const match = exact ?? manual;
    if (match === undefined) {
      toCreate.push({ date: target.date, slotId: target.slot.id });
      continue;
    }
    claimed.add(match.id);
    if (match.slotId === null) link.push({ id: match.id, slotId: target.slot.id });
  }

  const remove = live
    .filter(
      (l) =>
        l.slotId !== null &&
        !claimed.has(l.id) &&
        l.date !== null &&
        l.date > today &&
        isUntouched(l),
    )
    .map((l) => l.id);
  const removed = new Set(remove);

  // Výsledné pořadí: podle data, nedatované na konec v původním pořadí.
  type Row = { kind: 'existing'; lecture: Lecture } | { kind: 'new'; index: number; date: IsoDate };
  const rows: Row[] = [
    ...live.filter((l) => !removed.has(l.id)).map((lecture): Row => ({ kind: 'existing', lecture })),
    ...toCreate.map((t, index): Row => ({ kind: 'new', index, date: t.date })),
  ];
  const dateOf = (row: Row): string => (row.kind === 'new' ? row.date : (row.lecture.date ?? '9999-99-99'));
  const numberOf = (row: Row): number => (row.kind === 'new' ? Number.MAX_SAFE_INTEGER : row.lecture.number);
  rows.sort((a, b) => (dateOf(a) < dateOf(b) ? -1 : dateOf(a) > dateOf(b) ? 1 : numberOf(a) - numberOf(b)));

  const create: PlannedLecture[] = toCreate.map((t) => ({ ...t, number: 0 }));
  const renumber: Array<{ id: Id; number: number }> = [];
  rows.forEach((row, position) => {
    const number = position + 1;
    if (row.kind === 'new') {
      const planned = create[row.index];
      if (planned !== undefined) planned.number = number;
    } else if (row.lecture.number !== number) {
      renumber.push({ id: row.lecture.id, number });
    }
  });

  return { create, link, remove, renumber };
}

/* ---------- navazování přednášek ---------- */

/**
 * Předchozí přednáška téhož předmětu — ta, jejíž „co se probíralo“ se ukáže
 * jako rekapitulace. Bere první dřívější, která má aspoň nějaký zápis;
 * když žádná zápis nemá, vrátí prostě tu předchozí.
 */
export function previousLecture(lecture: Lecture, lectures: readonly Lecture[]): Lecture | null {
  const earlier = lectures
    .filter((l) => l.subjectId === lecture.subjectId && l.deletedAt === null && l.id !== lecture.id)
    .filter((l) => l.number < lecture.number)
    .sort((a, b) => b.number - a.number);
  const withNotes = earlier.find((l) => l.summary.trim() !== '' || l.focus.trim() !== '');
  return withNotes ?? earlier[0] ?? null;
}

export function nextLectureOf(lecture: Lecture, lectures: readonly Lecture[]): Lecture | null {
  return (
    lectures
      .filter((l) => l.subjectId === lecture.subjectId && l.deletedAt === null && l.number > lecture.number)
      .sort((a, b) => a.number - b.number)[0] ?? null
  );
}

/** Přednáška, která k danému konání hodiny patří (stejný předmět a den). */
export function lectureForOccurrence(occurrence: Occurrence, lectures: readonly Lecture[]): Lecture | null {
  const sameDay = lectures.filter(
    (l) => l.deletedAt === null && l.subjectId === occurrence.subject.id && l.date === occurrence.date,
  );
  return sameDay.find((l) => l.slotId === occurrence.slot.id) ?? sameDay[0] ?? null;
}

/**
 * Poslední přednáška předmětu před daným dnem, která má zápis — pro
 * „minule se probíralo“ u hodiny, ke které ještě přednáška neexistuje (cvičení).
 */
export function latestNotesBefore(subjectId: Id, date: IsoDate, lectures: readonly Lecture[]): Lecture | null {
  return (
    lectures
      .filter(
        (l) =>
          l.subjectId === subjectId &&
          l.deletedAt === null &&
          l.date !== null &&
          l.date < date &&
          (l.summary.trim() !== '' || l.focus.trim() !== ''),
      )
      .sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? 1 : -1))[0] ?? null
  );
}

/* ---------- validace hodiny ---------- */

export function validateSlot(input: {
  dayOfWeek: number;
  start: string;
  end: string;
}): string | null {
  if (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 1 || input.dayOfWeek > 7) return 'Vyber den.';
  if (!isValidTime(input.start) || !isValidTime(input.end)) return 'Čas zadej jako HH:MM.';
  if (timeToMinutes(input.end) <= timeToMinutes(input.start)) return 'Konec musí být po začátku.';
  return null;
}
