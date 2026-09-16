import { describe, expect, it } from 'vitest';
import {
  lectureDisplayTitle,
  lectureToInput,
  nextLectureInput,
  nextSubjectInput,
  subjectToInput,
} from './defaults';
import { makeLecture, makeSubject } from '../test/factories';

const subject = makeSubject({ id: 'zma', defaultLecturer: 'doc. Novák' });

describe('nextLectureInput', () => {
  it('první přednáška dostane číslo 1 a dnešní datum', () => {
    const draft = nextLectureInput(subject, [], '2026-09-21');
    expect(draft.number).toBe(1);
    expect(draft.date).toBe('2026-09-21');
    expect(draft.status).toBe('not_started');
  });

  it('další přednáška je o týden později', () => {
    const existing = [makeLecture({ subjectId: 'zma', number: 1, date: '2026-09-21' })];
    const draft = nextLectureInput(subject, existing, '2026-10-05');
    expect(draft.number).toBe(2);
    expect(draft.date).toBe('2026-09-28');
  });

  it('číslo bere z nejvyššího, ne z počtu — díry v číslování nevadí', () => {
    const existing = [
      makeLecture({ subjectId: 'zma', number: 1 }),
      makeLecture({ subjectId: 'zma', number: 7 }),
    ];
    expect(nextLectureInput(subject, existing, '2026-10-05').number).toBe(8);
  });

  it('při díře v číslování posune datum o odpovídající počet týdnů', () => {
    const existing = [makeLecture({ subjectId: 'zma', number: 3, date: '2026-09-21' })];
    // ze trojky na čtyřku je jeden týden
    const draft = nextLectureInput(subject, existing, '2026-10-05');
    expect(draft.number).toBe(4);
    expect(draft.date).toBe('2026-09-28');
  });

  it('zdědí přednášejícího a tagy z předchozí přednášky', () => {
    const existing = [
      makeLecture({ subjectId: 'zma', number: 1, lecturer: 'Ing. Dvořák', tags: ['limity'] }),
    ];
    const draft = nextLectureInput(subject, existing, '2026-10-05');
    expect(draft.lecturer).toBe('Ing. Dvořák');
    expect(draft.tags).toEqual(['limity']);
  });

  it('tagy kopíruje, nesdílí referenci s předchozí přednáškou', () => {
    const previous = makeLecture({ subjectId: 'zma', number: 1, tags: ['limity'] });
    const draft = nextLectureInput(subject, [previous], '2026-10-05');
    draft.tags.push('derivace');
    expect(previous.tags).toEqual(['limity']);
  });

  it('bez předchozí přednášky vezme výchozího přednášejícího z předmětu', () => {
    expect(nextLectureInput(subject, [], '2026-09-21').lecturer).toBe('doc. Novák');
  });

  it('ignoruje smazané přednášky', () => {
    const existing = [
      makeLecture({ subjectId: 'zma', number: 1 }),
      makeLecture({ subjectId: 'zma', number: 9, deletedAt: '2026-09-22T10:00:00.000Z' }),
    ];
    expect(nextLectureInput(subject, existing, '2026-10-05').number).toBe(2);
  });

  it('ignoruje přednášky cizího předmětu', () => {
    const existing = [makeLecture({ subjectId: 'jiny', number: 12 })];
    expect(nextLectureInput(subject, existing, '2026-10-05').number).toBe(1);
  });

  it('nedatovaná poslední přednáška nezabrání odvození data', () => {
    const existing = [
      makeLecture({ subjectId: 'zma', number: 1, date: '2026-09-21' }),
      makeLecture({ subjectId: 'zma', number: 2, date: null }),
    ];
    const draft = nextLectureInput(subject, existing, '2026-10-05');
    expect(draft.number).toBe(3);
    // Poslední známé datum je u jedničky, k trojce jsou dva týdny.
    expect(draft.date).toBe('2026-10-05');
  });

  it('název nechává prázdný, aby přidání bylo na dva kliky', () => {
    expect(nextLectureInput(subject, [], '2026-09-21').title).toBe('');
  });
});

describe('nextSubjectInput', () => {
  it('nepoužije barvu, kterou už jiný předmět má', () => {
    const existing = [makeSubject({ color: 'sky' }), makeSubject({ color: 'emerald' })];
    const draft = nextSubjectInput(existing);
    expect(draft.color).not.toBe('sky');
    expect(draft.color).not.toBe('emerald');
  });

  it('řadí nový předmět na konec', () => {
    const existing = [makeSubject({ sortOrder: 0 }), makeSubject({ sortOrder: 5 })];
    expect(nextSubjectInput(existing).sortOrder).toBe(6);
  });

  it('předvyplní semestr podle data', () => {
    expect(nextSubjectInput([], new Date('2026-10-15T12:00:00Z')).term).toBe('2026/27 ZS');
    expect(nextSubjectInput([], new Date('2027-03-15T12:00:00Z')).term).toBe('2026/27 LS');
  });
});

describe('lectureDisplayTitle', () => {
  it('prázdný název nahradí pořadovým číslem', () => {
    expect(lectureDisplayTitle({ number: 5, title: '' })).toBe('5. přednáška');
    expect(lectureDisplayTitle({ number: 5, title: '   ' })).toBe('5. přednáška');
  });

  it('vyplněný název nechá být', () => {
    expect(lectureDisplayTitle({ number: 5, title: 'Derivace' })).toBe('Derivace');
  });
});

describe('lectureToInput / subjectToInput', () => {
  it('vynechá metadata, která formulář nemá měnit', () => {
    const lectureKeys = Object.keys(lectureToInput(makeLecture()));
    for (const key of ['id', 'createdAt', 'updatedAt', 'deletedAt', 'statusAt']) {
      expect(lectureKeys).not.toContain(key);
    }
    const subjectKeys = Object.keys(subjectToInput(makeSubject()));
    for (const key of ['id', 'createdAt', 'updatedAt', 'deletedAt']) {
      expect(subjectKeys).not.toContain(key);
    }
  });

  it('tagy formuláře nesdílí pole se záznamem', () => {
    const lecture = makeLecture({ tags: ['a'] });
    lectureToInput(lecture).tags.push('b');
    expect(lecture.tags).toEqual(['a']);
  });
});
