import { createDb, type StudiumDB } from '../db/db';
import type { Lecture, Subject } from '../domain/types';

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
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    deletedAt: null,
    ...overrides,
  };
}
