import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTER,
  browseLectures,
  collectTags,
  compareForUpNext,
  countFilterChips,
  filterLectures,
  groupByDue,
  isFilterActive,
  normalizeText,
  toggleValue,
} from './filter';
import { makeLecture, makeSubject } from '../test/factories';
import type { LectureFilter } from './filter';

const zma = makeSubject({ id: 'zma', name: 'Základy matematické analýzy', code: 'ZMA' });
const upa = makeSubject({ id: 'upa', name: 'Úvod do programování', code: 'UPA' });
const subjects = [zma, upa];

function filter(overrides: Partial<LectureFilter> = {}): LectureFilter {
  return { ...EMPTY_FILTER, ...overrides };
}

describe('normalizeText', () => {
  it('sundá diakritiku a velikost písmen', () => {
    expect(normalizeText('Základy Matematické Analýzy')).toBe('zaklady matematicke analyzy');
  });

  it('zvládne i háčky a kroužky', () => {
    expect(normalizeText('Řešení úloh ů')).toBe('reseni uloh u');
  });
});

describe('filterLectures', () => {
  const lectures = [
    makeLecture({ id: 'l1', subjectId: 'zma', title: 'Limity', status: 'not_started', tags: ['dulezite'] }),
    makeLecture({ id: 'l2', subjectId: 'zma', title: 'Derivace', status: 'tested', tags: [] }),
    makeLecture({ id: 'l3', subjectId: 'upa', title: 'Ukazatele', status: 'materials', note: 'dodělat příklady' }),
    makeLecture({ id: 'l4', subjectId: 'upa', title: 'Smazaná', deletedAt: '2026-09-01T00:00:00.000Z' }),
  ];

  it('prázdný filtr vrátí všechno živé', () => {
    const result = filterLectures(lectures, subjects, EMPTY_FILTER);
    expect(result.map((l) => l.id)).toEqual(['l1', 'l2', 'l3']);
  });

  it('nikdy nevrátí smazané záznamy', () => {
    const result = filterLectures(lectures, subjects, filter({ query: 'smazana' }));
    expect(result).toHaveLength(0);
  });

  it('filtruje podle předmětu', () => {
    const result = filterLectures(lectures, subjects, filter({ subjectIds: ['upa'] }));
    expect(result.map((l) => l.id)).toEqual(['l3']);
  });

  it('filtruje podle stavu, více stavů se sčítá', () => {
    const result = filterLectures(lectures, subjects, filter({ statuses: ['not_started', 'materials'] }));
    expect(result.map((l) => l.id)).toEqual(['l1', 'l3']);
  });

  it('filtruje podle tagu', () => {
    const result = filterLectures(lectures, subjects, filter({ tags: ['dulezite'] }));
    expect(result.map((l) => l.id)).toEqual(['l1']);
  });

  it('hledá v názvu bez ohledu na diakritiku', () => {
    expect(filterLectures(lectures, subjects, filter({ query: 'derivace' }))[0]?.id).toBe('l2');
    expect(filterLectures(lectures, subjects, filter({ query: 'DERIVACE' }))[0]?.id).toBe('l2');
  });

  it('hledá v poznámce, a to i bez háčků', () => {
    expect(filterLectures(lectures, subjects, filter({ query: 'dodelat' }))[0]?.id).toBe('l3');
  });

  it('hledá i podle názvu a zkratky předmětu', () => {
    expect(filterLectures(lectures, subjects, filter({ query: 'zaklady' })).map((l) => l.id)).toEqual([
      'l1',
      'l2',
    ]);
    expect(filterLectures(lectures, subjects, filter({ query: 'upa' })).map((l) => l.id)).toEqual(['l3']);
  });

  it('více slov v dotazu musí sedět všechno naráz', () => {
    expect(filterLectures(lectures, subjects, filter({ query: 'zma limity' }))).toHaveLength(1);
    expect(filterLectures(lectures, subjects, filter({ query: 'zma ukazatele' }))).toHaveLength(0);
  });

  it('kombinuje filtr s hledáním', () => {
    const result = filterLectures(
      lectures,
      subjects,
      filter({ subjectIds: ['zma'], statuses: ['tested'], query: 'deriv' }),
    );
    expect(result.map((l) => l.id)).toEqual(['l2']);
  });
});

describe('browseLectures', () => {
  it('bez zvoleného stavu vezme jen nezačaté a se staženými podklady, od nejstarší', () => {
    const lectures = [
      makeLecture({ id: 'a', subjectId: 'zma', date: '2026-10-05', status: 'materials' }),
      makeLecture({ id: 'b', subjectId: 'upa', date: '2026-09-21', status: 'not_started' }),
      makeLecture({ id: 'c', subjectId: 'zma', date: '2026-09-28', status: 'summary' }),
      makeLecture({ id: 'd', subjectId: 'upa', date: '2026-09-14', status: 'skipped' }),
    ];
    expect(browseLectures(lectures, subjects, EMPTY_FILTER).map((l) => l.id)).toEqual(['b', 'a']);
  });

  it('se zvoleným stavem ukáže přesně ten stav, i hotové', () => {
    const lectures = [
      makeLecture({ id: 'hotova', subjectId: 'zma', status: 'tested' }),
      makeLecture({ id: 'cekajici', subjectId: 'zma', status: 'not_started' }),
    ];
    const result = browseLectures(lectures, subjects, filter({ statuses: ['tested'] }));
    expect(result.map((l) => l.id)).toEqual(['hotova']);
  });

  it('přednášky bez data patří na konec, ne na začátek', () => {
    const lectures = [
      makeLecture({ id: 'bezData', subjectId: 'zma', date: null }),
      makeLecture({ id: 'sDatem', subjectId: 'zma', date: '2026-12-01' }),
    ];
    expect(browseLectures(lectures, subjects, EMPTY_FILTER).map((l) => l.id)).toEqual([
      'sDatem',
      'bezData',
    ]);
  });

  it('nezobrazuje přednášky z archivovaného předmětu', () => {
    const archived = makeSubject({ id: 'stary', archived: true });
    const lectures = [makeLecture({ subjectId: 'stary' })];
    expect(browseLectures(lectures, [...subjects, archived], EMPTY_FILTER)).toHaveLength(0);
  });

  it('nezobrazuje přednášky předmětu, který v seznamu vůbec není', () => {
    // Seznam předmětů z UI archivované neobsahuje — výsledek musí být stejný.
    const lectures = [makeLecture({ subjectId: 'neznamy' })];
    expect(browseLectures(lectures, subjects, EMPTY_FILTER)).toHaveLength(0);
  });

  it('nezobrazuje přednášky smazaného předmětu', () => {
    const deleted = makeSubject({ id: 'smazany', deletedAt: '2026-09-01T00:00:00.000Z' });
    const lectures = [makeLecture({ subjectId: 'smazany' })];
    expect(browseLectures(lectures, [...subjects, deleted], EMPTY_FILTER)).toHaveLength(0);
  });

  it('respektuje předmět, tag i hledání', () => {
    const lectures = [
      makeLecture({ id: 'a', subjectId: 'zma', title: 'Limity', tags: ['zkouska'] }),
      makeLecture({ id: 'b', subjectId: 'upa', title: 'Limity', tags: ['zkouska'] }),
      makeLecture({ id: 'c', subjectId: 'upa', title: 'Ukazatele', tags: [] }),
    ];
    const result = browseLectures(
      lectures,
      subjects,
      filter({ subjectIds: ['upa'], tags: ['zkouska'], query: 'limity' }),
    );
    expect(result.map((l) => l.id)).toEqual(['b']);
  });
});

describe('groupByDue', () => {
  it('rozdělí na proběhlé, nadcházející a bez data a zachová pořadí', () => {
    const lectures = [
      makeLecture({ id: 'stara', date: '2026-09-01' }),
      makeLecture({ id: 'dnesni', date: '2026-09-16' }),
      makeLecture({ id: 'budouci', date: '2026-09-23' }),
      makeLecture({ id: 'bez', date: null }),
    ];
    const groups = groupByDue(lectures, '2026-09-16');
    expect(groups.due.map((l) => l.id)).toEqual(['stara', 'dnesni']);
    expect(groups.upcoming.map((l) => l.id)).toEqual(['budouci']);
    expect(groups.undated.map((l) => l.id)).toEqual(['bez']);
  });
});

describe('compareForUpNext', () => {
  it('při stejném datu řadí podle předmětu a čísla', () => {
    const a = makeLecture({ subjectId: 'a', number: 2, date: '2026-09-21' });
    const b = makeLecture({ subjectId: 'a', number: 1, date: '2026-09-21' });
    expect(compareForUpNext(a, b)).toBeGreaterThan(0);
  });
});

describe('collectTags', () => {
  it('vrátí unikátní tagy abecedně a přeskočí smazané', () => {
    const lectures = [
      makeLecture({ tags: ['zkouska', 'dulezite'] }),
      makeLecture({ tags: ['dulezite'] }),
      makeLecture({ tags: ['smazane'], deletedAt: '2026-09-01T00:00:00.000Z' }),
    ];
    expect(collectTags(lectures)).toEqual(['dulezite', 'zkouska']);
  });
});

describe('isFilterActive', () => {
  it('prázdný filtr není aktivní, samotné mezery taky ne', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    expect(isFilterActive(filter({ query: '   ' }))).toBe(false);
    expect(isFilterActive(filter({ statuses: ['tested'] }))).toBe(true);
  });
});

describe('countFilterChips', () => {
  it('počítá zapnuté čipy, fulltext ne', () => {
    const active = filter({ subjectIds: ['a'], statuses: ['tested', 'summary'], query: 'x' });
    expect(countFilterChips(active)).toBe(3);
  });
});

describe('toggleValue', () => {
  it('přidá chybějící a odebere přítomnou hodnotu', () => {
    expect(toggleValue(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleValue(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('hledání v zápiscích', () => {
  it('najde přednášku podle učiva, zaměření i přepisu', () => {
    const lectures = [
      makeLecture({ id: 'a', subjectId: 'zma', summary: 'Taylorův polynom' }),
      makeLecture({ id: 'b', subjectId: 'zma', focus: 'Důkaz věty o limitě' }),
      makeLecture({ id: 'c', subjectId: 'zma', transcript: '… a teď si ukážeme l’Hospitalovo pravidlo …' }),
    ];
    expect(filterLectures(lectures, subjects, filter({ query: 'taylor' })).map((l) => l.id)).toEqual(['a']);
    expect(filterLectures(lectures, subjects, filter({ query: 'dukaz' })).map((l) => l.id)).toEqual(['b']);
    expect(filterLectures(lectures, subjects, filter({ query: 'hospital' })).map((l) => l.id)).toEqual(['c']);
  });

  it('po úpravě přednášky hledá v novém textu, ne v uloženém starém', () => {
    const before = makeLecture({ id: 'x', subjectId: 'zma', summary: 'staré', updatedAt: '2026-09-01T00:00:00.000Z' });
    expect(filterLectures([before], subjects, filter({ query: 'stare' }))).toHaveLength(1);
    const after = { ...before, summary: 'nové', updatedAt: '2026-09-02T00:00:00.000Z' };
    expect(filterLectures([after], subjects, filter({ query: 'stare' }))).toHaveLength(0);
    expect(filterLectures([after], subjects, filter({ query: 'nove' }))).toHaveLength(1);
  });
});
