import { describe, expect, it } from 'vitest';
import { canMarkSummaryDone, suggestAutoUpdates, textStats } from './notes';
import { makeLecture } from '../test/factories';

describe('suggestAutoUpdates', () => {
  it('vložený přepis zaškrtne „má přepis“ a posune nezačatou přednášku', () => {
    expect(suggestAutoUpdates(makeLecture(), { transcript: 'Dobrý den, dnes…' })).toEqual({
      hasTranscript: true,
      status: 'materials',
    });
  });

  it('první zápis posune jen na podklady, ne rovnou na shrnutí', () => {
    expect(suggestAutoUpdates(makeLecture(), { summary: 'Limity' })).toEqual({ status: 'materials' });
  });

  it('stav nikdy nesnižuje', () => {
    expect(suggestAutoUpdates(makeLecture({ status: 'tested' }), { summary: 'x' })).toEqual({});
  });

  it('prázdný text nic nemění', () => {
    expect(suggestAutoUpdates(makeLecture(), { transcript: '   ' })).toEqual({});
  });

  it('přeskočenou přednášku nechá přeskočenou', () => {
    expect(suggestAutoUpdates(makeLecture({ status: 'skipped' }), { summary: 'x' })).toEqual({});
  });

  it('když přepis už je zaškrtnutý, znovu ho nenastavuje', () => {
    expect(suggestAutoUpdates(makeLecture({ hasTranscript: true, status: 'materials' }), { transcript: 'x' })).toEqual({});
  });
});

describe('canMarkSummaryDone', () => {
  it('nabídne až u smysluplného shrnutí', () => {
    expect(canMarkSummaryDone({ status: 'materials', summary: 'krátké' })).toBe(false);
    expect(canMarkSummaryDone({ status: 'materials', summary: 'Limity posloupností a funkcí, věta o sevření' })).toBe(true);
  });

  it('nenabízí, když je shrnutí už hotové nebo přednáška přeskočená', () => {
    const summary = 'Dostatečně dlouhé shrnutí přednášky.';
    expect(canMarkSummaryDone({ status: 'summary', summary })).toBe(false);
    expect(canMarkSummaryDone({ status: 'skipped', summary })).toBe(false);
  });
});

describe('textStats', () => {
  it('spočítá slova a odhad čtení', () => {
    expect(textStats('')).toEqual({ words: 0, characters: 0, readingMinutes: 0 });
    expect(textStats('jedna dvě  tři').words).toBe(3);
    expect(textStats('slovo '.repeat(1000)).readingMinutes).toBe(5);
  });
});
