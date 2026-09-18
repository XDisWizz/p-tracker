import { describe, expect, it } from 'vitest';
import { buildHash, filterFromSearch, filterToSearch, parseHash, type Route } from './useHashRoute';
import { EMPTY_FILTER, type LectureFilter } from '../domain/filter';

function upNext(overrides: Partial<LectureFilter> = {}): Route {
  return { name: 'upNext', filter: { ...EMPTY_FILTER, ...overrides } };
}

describe('parseHash', () => {
  it('prázdná adresa vede na „Co mě čeká“ bez filtru', () => {
    expect(parseHash('')).toEqual(upNext());
    expect(parseHash('#')).toEqual(upNext());
    expect(parseHash('#/')).toEqual(upNext());
  });

  it('pozná seznam i detail předmětu', () => {
    expect(parseHash('#/predmety')).toEqual({ name: 'subjects' });
    expect(parseHash('#/predmety/abc-123')).toEqual({ name: 'subject', id: 'abc-123' });
  });

  it('neznámou cestu pošle na výchozí obrazovku', () => {
    expect(parseHash('#/nesmysl/42')).toEqual(upNext());
  });

  it('rozbitá procenta v adrese aplikaci neshodí', () => {
    expect(() => parseHash('#/predmety/%E0%A4%A')).not.toThrow();
  });

  it('zahodí neznámé stavy z ručně upravené adresy', () => {
    expect(parseHash('#/?s=summary&s=hotovo')).toEqual(upNext({ statuses: ['summary'] }));
  });

  it('zahodí duplicitní hodnoty', () => {
    expect(filterFromSearch('t=a&t=a&p=x&p=x').tags).toEqual(['a']);
  });
});

describe('round-trip adresy', () => {
  const cases: Array<[string, Route]> = [
    ['bez filtru', upNext()],
    ['hledání s diakritikou a mezerou', upNext({ query: 'základy anal' })],
    ['mezera na konci se při psaní neztratí', upNext({ query: 'limity ' })],
    ['více předmětů a stavů', upNext({ subjectIds: ['a-1', 'b-2'], statuses: ['not_started', 'tested'] })],
    ['tag s čárkou a ampersandem', upNext({ tags: ['a,b', 'x&y'] })],
    ['včetně archivu', upNext({ includeArchived: true, query: 'derivace' })],
    ['seznam předmětů', { name: 'subjects' }],
    ['detail předmětu', { name: 'subject', id: '3f1c-uuid' }],
    ['nastavení', { name: 'settings' }],
    ['statistiky', { name: 'stats' }],
    ['rozvrh', { name: 'schedule', week: null }],
    ['rozvrh konkrétního týdne', { name: 'schedule', week: '2026-09-21' }],
    ['detail přednášky', { name: 'lecture', id: 'abc-123' }],
  ];

  for (const [label, route] of cases) {
    it(label, () => {
      expect(parseHash(buildHash(route))).toEqual(route);
    });
  }

  it('prázdný filtr dává čistou adresu', () => {
    expect(buildHash(upNext())).toBe('#/');
    expect(filterToSearch(EMPTY_FILTER)).toBe('');
  });
});

describe('rozvrh v adrese', () => {
  it('nesmyslný týden ignoruje', () => {
    expect(parseHash('#/rozvrh?t=zitra')).toEqual({ name: 'schedule', week: null });
  });
});
