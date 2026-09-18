import { describe, expect, it } from 'vitest';
import { escapeText, foldLine, scheduleToIcs } from './ical';
import { makeSlot, makeSubject, makeTerm } from '../test/factories';

const term = makeTerm();
const zma = makeSubject({ id: 'zma', code: 'ZMA', name: 'Základy matematické analýzy', term: term.id });
const now = new Date('2026-09-18T10:00:00.000Z');

describe('escapeText', () => {
  it('escapuje středník, čárku, lomítko a nový řádek', () => {
    expect(escapeText('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
  });
});

describe('foldLine', () => {
  it('krátký řádek nechá být', () => {
    expect(foldLine('SUMMARY:ZMA')).toBe('SUMMARY:ZMA');
  });

  it('dlouhý řádek zalomí po nejvýš 75 bajtech a nerozdělí český znak', () => {
    const line = `DESCRIPTION:${'žluťoučký kůň '.repeat(10)}`;
    const folded = foldLine(line);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    const encoder = new TextEncoder();
    for (const part of parts) expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
    for (const part of parts.slice(1)) expect(part.startsWith(' ')).toBe(true);
    // Po rozvinutí musí vyjít původní text.
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });
});

describe('scheduleToIcs', () => {
  const slot = makeSlot({ id: 'p', subjectId: 'zma', dayOfWeek: 2, start: '09:00', end: '10:30', room: 'NA-A01', teacher: 'doc. Novák' });

  it('jedna událost za každé konání, bez svátku', () => {
    const result = scheduleToIcs([slot], [zma], [term], now);
    expect(result.events).toBe(12); // 13 úterků minus 17. 11.
    expect(result.text).not.toContain('20261117T');
  });

  it('časy v pásmu Europe/Prague a stabilní UID', () => {
    const { text } = scheduleToIcs([slot], [zma], [term], now);
    expect(text).toContain('DTSTART;TZID=Europe/Prague:20260915T090000');
    expect(text).toContain('DTEND;TZID=Europe/Prague:20260915T103000');
    expect(text).toContain('UID:p-2026-09-15@prehled-prednasek');
    expect(text).toContain('BEGIN:VTIMEZONE');
  });

  it('název, místnost a popis s escapováním', () => {
    const { text } = scheduleToIcs([slot], [zma], [term], now);
    expect(text).toContain('SUMMARY:ZMA – Přednáška');
    expect(text).toContain('LOCATION:NA-A01');
    expect(text).toContain('DESCRIPTION:Základy matematické analýzy\\nVyučující: doc. Novák');
  });

  it('řádky končí CRLF podle RFC 5545', () => {
    const { text } = scheduleToIcs([slot], [zma], [term], now);
    expect(text.split('\r\n').length).toBeGreaterThan(10);
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('liché týdny exportuje jen v lichých týdnech', () => {
    const odd = makeSlot({ id: 'l', subjectId: 'zma', dayOfWeek: 5, parity: 'odd' });
    const { text, events } = scheduleToIcs([odd], [zma], [term], now);
    expect(events).toBe(7);
    expect(text).toContain('20260918T');
    expect(text).not.toContain('20260925T');
  });

  it('předmět bez semestru přeskočí a řekne který', () => {
    const noTerm = makeSubject({ id: 'x', code: 'XYZ', term: '2031/32 LS' });
    const result = scheduleToIcs([makeSlot({ subjectId: 'x' })], [noTerm], [term], now);
    expect(result.events).toBe(0);
    expect(result.skippedSubjects).toEqual(['XYZ']);
  });

  it('archivované a smazané vynechá', () => {
    const archived = makeSubject({ id: 'a', archived: true, term: term.id });
    const deletedSlot = makeSlot({ subjectId: 'zma', deletedAt: '2026-09-01T00:00:00.000Z' });
    const result = scheduleToIcs([makeSlot({ subjectId: 'a' }), deletedSlot], [zma, archived], [term], now);
    expect(result.events).toBe(0);
  });
});
