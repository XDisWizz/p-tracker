import { describe, expect, it } from 'vitest';
import {
  PIPELINE_STATUSES,
  isAtLeast,
  isDone,
  isLectureStatus,
  isPending,
  nextStatus,
  statusRank,
} from './status';
import { LECTURE_STATUSES } from './types';

describe('pipeline', () => {
  it('obsahuje pět stavů ve správném pořadí, bez přeskočeno', () => {
    expect(PIPELINE_STATUSES).toEqual([
      'not_started',
      'materials',
      'summary',
      'flashcards',
      'tested',
    ]);
  });

  it('každý stav má definovanou pozici', () => {
    for (const status of LECTURE_STATUSES) {
      expect(Number.isInteger(statusRank(status))).toBe(true);
    }
  });
});

describe('isAtLeast', () => {
  it('porovnává podle pozice v pipeline', () => {
    expect(isAtLeast('tested', 'summary')).toBe(true);
    expect(isAtLeast('summary', 'summary')).toBe(true);
    expect(isAtLeast('materials', 'summary')).toBe(false);
  });

  it('přeskočeno není nikdy „aspoň“ nic — ani nad nezačato', () => {
    expect(isAtLeast('skipped', 'not_started')).toBe(false);
    expect(isAtLeast('skipped', 'tested')).toBe(false);
  });
});

describe('isDone / isPending', () => {
  it('hotové je od shrnutí výš', () => {
    expect(isDone('summary')).toBe(true);
    expect(isDone('flashcards')).toBe(true);
    expect(isDone('tested')).toBe(true);
    expect(isDone('materials')).toBe(false);
    expect(isDone('not_started')).toBe(false);
    expect(isDone('skipped')).toBe(false);
  });

  it('čeká na mě jen nezačato a podklady', () => {
    expect(isPending('not_started')).toBe(true);
    expect(isPending('materials')).toBe(true);
    expect(isPending('summary')).toBe(false);
    expect(isPending('skipped')).toBe(false);
  });

  it('hotové a čekající se nikdy nepřekrývají', () => {
    for (const status of LECTURE_STATUSES) {
      expect(isDone(status) && isPending(status)).toBe(false);
    }
  });
});

describe('nextStatus', () => {
  it('posouvá o krok dál', () => {
    expect(nextStatus('not_started')).toBe('materials');
    expect(nextStatus('materials')).toBe('summary');
    expect(nextStatus('flashcards')).toBe('tested');
  });

  it('z posledního stavu se vrací na začátek, ať jde opravit překlik', () => {
    expect(nextStatus('tested')).toBe('not_started');
  });

  it('z přeskočeno vrací zpátky do pipeline', () => {
    expect(nextStatus('skipped')).toBe('not_started');
  });

  it('opakovaným klikáním se projde celá pipeline a vrátí na začátek', () => {
    let status = nextStatus('not_started');
    const seen = ['not_started'];
    while (status !== 'not_started') {
      seen.push(status);
      status = nextStatus(status);
    }
    expect(seen).toEqual(PIPELINE_STATUSES);
  });
});

describe('isLectureStatus', () => {
  it('pozná platné stavy a odmítne smetí z importu', () => {
    expect(isLectureStatus('summary')).toBe(true);
    expect(isLectureStatus('hotovo')).toBe(false);
    expect(isLectureStatus(3)).toBe(false);
    expect(isLectureStatus(null)).toBe(false);
  });
});
