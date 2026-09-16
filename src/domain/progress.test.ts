import { describe, expect, it } from 'vitest';
import { computeProgress, progressBySubject } from './progress';
import { makeLecture } from '../test/factories';

describe('computeProgress', () => {
  it('předmět bez přednášek nemá nulové dělení ani NaN', () => {
    const progress = computeProgress([]);
    expect(progress.total).toBe(0);
    expect(progress.ratio).toBe(0);
    expect(progress.percent).toBe(0);
  });

  it('za hotové považuje shrnutí a všechno dál', () => {
    const progress = computeProgress([
      makeLecture({ status: 'not_started' }),
      makeLecture({ status: 'materials' }),
      makeLecture({ status: 'summary' }),
      makeLecture({ status: 'flashcards' }),
      makeLecture({ status: 'tested' }),
    ]);
    expect(progress.done).toBe(3);
    expect(progress.total).toBe(5);
    expect(progress.percent).toBe(60);
  });

  it('nezpracované = nezačato plus stažené podklady', () => {
    const progress = computeProgress([
      makeLecture({ status: 'not_started' }),
      makeLecture({ status: 'not_started' }),
      makeLecture({ status: 'materials' }),
      makeLecture({ status: 'tested' }),
    ]);
    expect(progress.pending).toBe(3);
  });

  it('přeskočené vypadnou ze jmenovatele, ne do splněných', () => {
    const progress = computeProgress([
      makeLecture({ status: 'summary' }),
      makeLecture({ status: 'skipped' }),
      makeLecture({ status: 'skipped' }),
    ]);
    expect(progress.skipped).toBe(2);
    expect(progress.total).toBe(1);
    expect(progress.done).toBe(1);
    expect(progress.percent).toBe(100);
  });

  it('samé přeskočené nedají NaN ani 100 %', () => {
    const progress = computeProgress([makeLecture({ status: 'skipped' })]);
    expect(progress.total).toBe(0);
    expect(progress.percent).toBe(0);
  });

  it('přeskočená se nepočítá jako čekající', () => {
    const progress = computeProgress([makeLecture({ status: 'skipped' })]);
    expect(progress.pending).toBe(0);
  });

  it('rozpad po stavech sedí na součet', () => {
    const progress = computeProgress([
      makeLecture({ status: 'materials' }),
      makeLecture({ status: 'materials' }),
      makeLecture({ status: 'tested' }),
    ]);
    expect(progress.byStatus.materials).toBe(2);
    expect(progress.byStatus.tested).toBe(1);
    expect(progress.byStatus.not_started).toBe(0);
  });
});

describe('progressBySubject', () => {
  it('spočítá každý předmět zvlášť a prázdné taky', () => {
    const lectures = [
      makeLecture({ subjectId: 'a', status: 'tested' }),
      makeLecture({ subjectId: 'a', status: 'not_started' }),
      makeLecture({ subjectId: 'b', status: 'summary' }),
    ];
    const result = progressBySubject(lectures, ['a', 'b', 'c']);

    expect(result.get('a')?.percent).toBe(50);
    expect(result.get('b')?.percent).toBe(100);
    expect(result.get('c')?.total).toBe(0);
  });
});
