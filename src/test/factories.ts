import { createDb, type StudiumDB } from '../db/db';
import type { Lecture, ScheduleSlot, Subject, Term } from '../domain/types';

let counter = 0;

/** Čerstvá izolovaná databáze pro jeden test. */
export function freshDb(): StudiumDB {
  counter += 1;
  return createDb(`test-${Date.now()}-${counter}`);
}

const BASE_TIME = '2026-09-01T08:00:00.000Z';

export function makeSubject(overrides: Partial<Subject> = {}): Subject {
  counter += 1;
  return {
    id: `subject-${counter}`,
    name: 'Základy matematické analýzy',
    code: 'ZMA',
    term: '2026/27 ZS',
    color: 'sky',
    lmsUrl: null,
    defaultLecturer: null,
    archived: false,
    sortOrder: 0,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    deletedAt: null,
    ...overrides,
  };
}

export function makeLecture(overrides: Partial<Lecture> = {}): Lecture {
  counter += 1;
  return {
    id: `lecture-${counter}`,
    subjectId: 'subject-1',
    number: 1,
    title: '',
    date: '2026-09-21',
    lecturer: null,
    hasSlides: false,
    hasTranscript: false,
    status: 'not_started',
    statusAt: {},
    note: '',
    url: null,
    tags: [],
    slotId: null,
    summary: '',
    focus: '',
    transcript: '',
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    deletedAt: null,
    ...overrides,
  };
}

export function makeSlot(overrides: Partial<ScheduleSlot> = {}): ScheduleSlot {
  counter += 1;
  return {
    id: `slot-${counter}`,
    subjectId: 'subject-1',
    kind: 'lecture',
    dayOfWeek: 1,
    start: '09:00',
    end: '10:30',
    room: 'NA-A01',
    teacher: null,
    parity: 'every',
    note: '',
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    deletedAt: null,
    ...overrides,
  };
}

/** Zimní semestr 2026/27 na FEI: výuka 14. 9. – 12. 12. 2026, 13 týdnů, tři státní svátky. */
export function makeTerm(overrides: Partial<Term> = {}): Term {
  return {
    id: '2026/27 ZS',
    teachingStart: '2026-09-14',
    teachingEnd: '2026-12-12',
    skipDates: ['2026-09-28', '2026-10-28', '2026-11-17'],
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    deletedAt: null,
    ...overrides,
  };
}
