import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  formatTime,
  isUntouched,
  isoWeekday,
  latestNotesBefore,
  lectureForOccurrence,
  matchesParity,
  mondayOf,
  nextLectureOf,
  nowAndNext,
  occurrencesOn,
  occursOn,
  planLectureSync,
  previousLecture,
  slotDates,
  teachingWeek,
  teachingWeekCount,
  timeToMinutes,
  validateSlot,
  type ScheduleContext,
} from './schedule';
import { guessTerm, termPreset, validateTerm } from './terms';
import { makeLecture, makeSlot, makeSubject, makeTerm } from '../test/factories';

const term = makeTerm();

describe('kalendářní pomůcky', () => {
  it('den v týdnu podle ISO', () => {
    expect(isoWeekday('2026-09-14')).toBe(1); // pondělí
    expect(isoWeekday('2026-09-20')).toBe(7); // neděle
  });

  it('pondělí téhož týdne', () => {
    expect(mondayOf('2026-09-17')).toBe('2026-09-14');
    expect(mondayOf('2026-09-14')).toBe('2026-09-14');
    expect(mondayOf('2026-09-20')).toBe('2026-09-14');
  });

  it('formát času a délky', () => {
    expect(formatTime('09:00')).toBe('9:00');
    expect(formatTime('12:45')).toBe('12:45');
    expect(timeToMinutes('10:30')).toBe(630);
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(80)).toBe('1 h 20 min');
    expect(formatDuration(120)).toBe('2 h');
  });
});

describe('týdny výuky', () => {
  it('ZS 2026/27 na FEI má 13 týdnů', () => {
    expect(teachingWeekCount(term)).toBe(13);
  });

  it('první a poslední týden', () => {
    expect(teachingWeek(term, '2026-09-14')).toBe(1);
    expect(teachingWeek(term, '2026-09-21')).toBe(2);
    expect(teachingWeek(term, '2026-12-11')).toBe(13);
  });

  it('mimo výuku vrací null', () => {
    expect(teachingWeek(term, '2026-09-13')).toBeNull();
    expect(teachingWeek(term, '2026-12-14')).toBeNull();
  });

  it('lichý a sudý týden', () => {
    expect(matchesParity('odd', 1)).toBe(true);
    expect(matchesParity('odd', 2)).toBe(false);
    expect(matchesParity('even', 2)).toBe(true);
    expect(matchesParity('every', 7)).toBe(true);
  });
});

describe('slotDates', () => {
  it('pondělní přednáška každý týden vynechá 28. 9.', () => {
    const dates = slotDates(makeSlot({ dayOfWeek: 1 }), term);
    expect(dates).toHaveLength(12);
    expect(dates[0]).toBe('2026-09-14');
    expect(dates).not.toContain('2026-09-28');
    expect(dates.at(-1)).toBe('2026-12-07');
  });

  it('středa vynechá 28. 10., úterý 17. 11.', () => {
    expect(slotDates(makeSlot({ dayOfWeek: 3 }), term)).not.toContain('2026-10-28');
    expect(slotDates(makeSlot({ dayOfWeek: 2 }), term)).not.toContain('2026-11-17');
  });

  it('liché týdny jen každý druhý týden od prvního', () => {
    const dates = slotDates(makeSlot({ dayOfWeek: 4, parity: 'odd' }), term);
    expect(dates.slice(0, 3)).toEqual(['2026-09-17', '2026-10-01', '2026-10-15']);
    expect(dates).toHaveLength(7);
  });

  it('sudé týdny začínají druhým týdnem', () => {
    expect(slotDates(makeSlot({ dayOfWeek: 4, parity: 'even' }), term)[0]).toBe('2026-09-24');
  });

  it('sobota po konci výuky se už nepočítá', () => {
    // Výuka končí v sobotu 12. 12. — sobotní hodina ten den ještě je, neděle už ne.
    expect(slotDates(makeSlot({ dayOfWeek: 6 }), term).at(-1)).toBe('2026-12-12');
    expect(slotDates(makeSlot({ dayOfWeek: 7 }), term).at(-1)).toBe('2026-12-06');
  });
});

describe('occursOn', () => {
  const slot = makeSlot({ dayOfWeek: 1, parity: 'odd' });

  it('jiný den v týdnu se nekoná', () => {
    expect(occursOn(slot, '2026-09-15', term).occurs).toBe(false);
  });

  it('v sudém týdnu lichá hodina odpadá úplně', () => {
    expect(occursOn(slot, '2026-09-21', term).occurs).toBe(false);
  });

  it('ve svátek se koná, ale je zrušená', () => {
    expect(occursOn(makeSlot({ dayOfWeek: 1 }), '2026-09-28', term)).toEqual({ occurs: true, cancelled: true });
  });

  it('bez semestru se bere každý týden', () => {
    expect(occursOn(slot, '2027-05-03', undefined).occurs).toBe(true);
  });
});

describe('occurrencesOn a nowAndNext', () => {
  const zma = makeSubject({ id: 'zma', code: 'ZMA', term: term.id });
  const upa = makeSubject({ id: 'upa', code: 'UPA', term: term.id });
  const old = makeSubject({ id: 'old', code: 'OLD', term: term.id, archived: true });
  const context: ScheduleContext = {
    subjects: [zma, upa, old],
    terms: [term],
    slots: [
      makeSlot({ id: 'zma-p', subjectId: 'zma', dayOfWeek: 2, start: '09:00', end: '10:30' }),
      makeSlot({ id: 'upa-c', subjectId: 'upa', dayOfWeek: 2, start: '12:30', end: '14:00', kind: 'exercise' }),
      makeSlot({ id: 'upa-p', subjectId: 'upa', dayOfWeek: 2, start: '10:45', end: '12:15' }),
      makeSlot({ id: 'old-p', subjectId: 'old', dayOfWeek: 2, start: '08:00', end: '09:00' }),
      makeSlot({ id: 'zma-thu', subjectId: 'zma', dayOfWeek: 4, start: '14:15', end: '15:45' }),
    ],
  };
  const tuesday = '2026-09-15';

  it('seřadí hodiny dne podle času a vynechá archivované předměty', () => {
    expect(occurrencesOn(tuesday, context).map((o) => o.slot.id)).toEqual(['zma-p', 'upa-p', 'upa-c']);
  });

  it('uprostřed hodiny ukáže aktuální i další', () => {
    const result = nowAndNext(tuesday, timeToMinutes('09:30'), context);
    expect(result.current?.slot.id).toBe('zma-p');
    expect(result.next?.slot.id).toBe('upa-p');
  });

  it('o přestávce nic neprobíhá, ale další hodina je známá', () => {
    const result = nowAndNext(tuesday, timeToMinutes('10:35'), context);
    expect(result.current).toBeNull();
    expect(result.next?.slot.id).toBe('upa-p');
  });

  it('po poslední hodině dne najde další v příštích dnech', () => {
    const result = nowAndNext(tuesday, timeToMinutes('18:00'), context);
    expect(result.next?.slot.id).toBe('zma-thu');
    expect(result.next?.date).toBe('2026-09-17');
  });

  it('přeskočí zrušenou hodinu ve svátek', () => {
    // Úterý 17. 11. je svátek — první další hodina je až čtvrtek 19. 11.
    const result = nowAndNext('2026-11-16', timeToMinutes('20:00'), context);
    expect(result.next?.date).toBe('2026-11-19');
  });

  it('bez rozvrhu nic', () => {
    expect(nowAndNext(tuesday, 600, { ...context, slots: [] })).toEqual({ current: null, next: null });
  });
});

describe('planLectureSync', () => {
  const subjectId = 'zma';
  const monday = makeSlot({ id: 'p1', subjectId, dayOfWeek: 1 });
  const today = '2026-09-13';

  it('prázdný předmět dostane přednášku na každý termín, očíslovanou podle data', () => {
    const plan = planLectureSync(subjectId, [monday], term, [], today);
    expect(plan.create).toHaveLength(12);
    expect(plan.create[0]).toEqual({ date: '2026-09-14', slotId: 'p1', number: 1 });
    expect(plan.create[2]).toEqual({ date: '2026-10-05', slotId: 'p1', number: 3 });
  });

  it('cvičení přednášky nevytváří', () => {
    const exercise = makeSlot({ subjectId, kind: 'exercise' });
    expect(planLectureSync(subjectId, [exercise], term, [], today).create).toHaveLength(0);
  });

  it('opakované volání nedělá nic', () => {
    const first = planLectureSync(subjectId, [monday], term, [], today);
    const lectures = first.create.map((c, i) =>
      makeLecture({ id: `l${i}`, subjectId, date: c.date, slotId: c.slotId, number: c.number }),
    );
    const second = planLectureSync(subjectId, [monday], term, lectures, today);
    expect(second).toEqual({ create: [], link: [], remove: [], renumber: [] });
  });

  it('ručně přidanou přednášku na stejný den nezdvojí, jen ji přiřadí k hodině', () => {
    const manual = makeLecture({ id: 'rucni', subjectId, date: '2026-09-14', number: 1, slotId: null });
    const plan = planLectureSync(subjectId, [monday], term, [manual], today);
    expect(plan.link).toEqual([{ id: 'rucni', slotId: 'p1' }]);
    expect(plan.create.map((c) => c.date)).not.toContain('2026-09-14');
    expect(plan.create).toHaveLength(11);
  });

  it('po přesunu hodiny smaže nedotčené budoucí přednášky a vytvoří nové', () => {
    const moved = { ...monday, dayOfWeek: 3 };
    const oldLectures = slotDates(monday, term).map((date, i) =>
      makeLecture({ id: `old${i}`, subjectId, date, slotId: 'p1', number: i + 1 }),
    );
    const plan = planLectureSync(subjectId, [moved], term, oldLectures, '2026-10-01');
    // Minulé přednášky (14. 9., 21. 9.) zůstávají jako historie.
    expect(plan.remove).not.toContain('old0');
    expect(plan.remove).not.toContain('old1');
    expect(plan.remove).toContain('old2');
    expect(plan.create.every((c) => isoWeekday(c.date) === 3)).toBe(true);
  });

  it('rozpracovanou budoucí přednášku nikdy nesmaže', () => {
    const touched = makeLecture({
      id: 'rozpracovana',
      subjectId,
      date: '2026-12-07',
      slotId: 'p1',
      number: 12,
      summary: 'Něco jsem si poznamenal dopředu',
    });
    const plan = planLectureSync(subjectId, [{ ...monday, dayOfWeek: 3 }], term, [touched], '2026-09-01');
    expect(plan.remove).not.toContain('rozpracovana');
  });

  it('po smazání hodiny nedotčené budoucí přednášky zmizí', () => {
    const lectures = [makeLecture({ id: 'x', subjectId, date: '2026-12-07', slotId: 'p1', number: 1 })];
    const plan = planLectureSync(subjectId, [{ ...monday, deletedAt: '2026-09-10T00:00:00.000Z' }], term, lectures, today);
    expect(plan.remove).toEqual(['x']);
  });

  it('dvě přednášky týdně se očíslují napříč oběma hodinami', () => {
    const thursday = makeSlot({ id: 'p2', subjectId, dayOfWeek: 4 });
    const plan = planLectureSync(subjectId, [monday, thursday], term, [], today);
    expect(plan.create.slice(0, 3).map((c) => [c.date, c.number])).toEqual([
      ['2026-09-14', 1],
      ['2026-09-17', 2],
      ['2026-09-21', 3],
    ]);
  });

  it('přečísluje existující přednášky podle data', () => {
    const existing = makeLecture({ id: 'e', subjectId, date: '2026-12-07', number: 1, slotId: null, title: 'Vlastní' });
    const plan = planLectureSync(subjectId, [monday], term, [existing], today);
    // Ruční přednáška 7. 12. je na termínu z rozvrhu — přiřadí se a dostane poslední číslo.
    expect(plan.renumber).toEqual([{ id: 'e', number: 12 }]);
  });

  it('nesahá na přednášky jiného předmětu', () => {
    const foreign = makeLecture({ id: 'cizi', subjectId: 'jiny', date: '2026-09-14', slotId: null });
    const plan = planLectureSync(subjectId, [monday], term, [foreign], today);
    expect(plan.link).toEqual([]);
    expect(plan.create).toHaveLength(12);
  });
});

describe('isUntouched', () => {
  it('čerstvá přednáška je nedotčená, cokoliv vyplněného ne', () => {
    expect(isUntouched(makeLecture())).toBe(true);
    expect(isUntouched(makeLecture({ status: 'materials' }))).toBe(false);
    expect(isUntouched(makeLecture({ transcript: 'x' }))).toBe(false);
    expect(isUntouched(makeLecture({ hasSlides: true }))).toBe(false);
    expect(isUntouched(makeLecture({ note: ' ' }))).toBe(true);
  });
});

describe('navazování přednášek', () => {
  const l1 = makeLecture({ id: 'l1', subjectId: 's', number: 1, date: '2026-09-14', summary: 'Limity' });
  const l2 = makeLecture({ id: 'l2', subjectId: 's', number: 2, date: '2026-09-21' });
  const l3 = makeLecture({ id: 'l3', subjectId: 's', number: 3, date: '2026-10-05' });
  const other = makeLecture({ id: 'o', subjectId: 'jiny', number: 2, summary: 'Cizí' });
  const all = [l1, l2, l3, other];

  it('„minule“ bere poslední dřívější se zápisem', () => {
    expect(previousLecture(l3, all)?.id).toBe('l1');
  });

  it('když žádná dřívější zápis nemá, vrátí prostě předchozí', () => {
    expect(previousLecture(l3, [l2, l3])?.id).toBe('l2');
  });

  it('první přednáška žádnou předchozí nemá', () => {
    expect(previousLecture(l1, all)).toBeNull();
  });

  it('další přednáška téhož předmětu', () => {
    expect(nextLectureOf(l1, all)?.id).toBe('l2');
    expect(nextLectureOf(l3, all)).toBeNull();
  });

  it('poslední zápis před datem — pro cvičení bez vlastní přednášky', () => {
    expect(latestNotesBefore('s', '2026-10-01', all)?.id).toBe('l1');
    expect(latestNotesBefore('s', '2026-09-14', all)).toBeNull();
  });

  it('přednáška k danému konání hodiny', () => {
    const slot = makeSlot({ id: 'p', subjectId: 's' });
    const occurrence = {
      slot,
      subject: makeSubject({ id: 's' }),
      date: '2026-09-21',
      cancelled: false,
      startMin: 540,
      endMin: 630,
    };
    expect(lectureForOccurrence(occurrence, all)?.id).toBe('l2');
  });
});

describe('validace', () => {
  it('hodina', () => {
    expect(validateSlot({ dayOfWeek: 1, start: '09:00', end: '10:30' })).toBeNull();
    expect(validateSlot({ dayOfWeek: 0, start: '09:00', end: '10:30' })).not.toBeNull();
    expect(validateSlot({ dayOfWeek: 1, start: '9:00', end: '10:30' })).not.toBeNull();
    expect(validateSlot({ dayOfWeek: 1, start: '10:30', end: '10:30' })).not.toBeNull();
  });

  it('semestr', () => {
    expect(validateTerm(term)).toBeNull();
    expect(validateTerm({ ...term, teachingEnd: '2026-01-01' })).not.toBeNull();
    expect(validateTerm({ ...term, skipDates: ['nesmysl'] })).not.toBeNull();
  });

  it('předvolba ZS 2026/27 odpovídá harmonogramu FEI', () => {
    const preset = termPreset('2026/27 ZS');
    expect(preset?.teachingStart).toBe('2026-09-14');
    expect(preset?.teachingEnd).toBe('2026-12-12');
  });

  it('odhad neznámého semestru začíná druhým pondělím a trvá 13 týdnů', () => {
    const guess = guessTerm('2026/27 ZS');
    expect(guess.teachingStart).toBe('2026-09-14');
    expect(teachingWeekCount(guess)).toBe(13);
    expect(isoWeekday(guessTerm('2026/27 LS').teachingStart)).toBe(1);
  });
});
