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

describe('budoucí přednášky', () => {
  const today = '2026-10-01';

  it('neproběhlé nezačaté se do procent nepočítají', () => {
    const progress = computeProgress(
      [
        makeLecture({ date: '2026-09-14', status: 'summary' }),
        makeLecture({ date: '2026-09-21', status: 'not_started' }),
        makeLecture({ date: '2026-10-05', status: 'not_started' }),
        makeLecture({ date: '2026-10-12', status: 'not_started' }),
      ],
      today,
    );
    expect(progress.total).toBe(2);
    expect(progress.upcoming).toBe(2);
    expect(progress.pending).toBe(1);
    expect(progress.percent).toBe(50);
  });

  it('dopředu hotová budoucí přednáška se počítá a procenta nepřetečou', () => {
    const progress = computeProgress(
      [makeLecture({ date: '2026-09-14', status: 'tested' }), makeLecture({ date: '2026-10-05', status: 'summary' })],
      today,
    );
    expect(progress.done).toBe(2);
    expect(progress.total).toBe(2);
    expect(progress.percent).toBe(100);
  });

  it('bez dnešního data se počítá všechno jako dřív', () => {
    const progress = computeProgress([makeLecture({ date: '2030-01-01', status: 'not_started' })]);
    expect(progress.total).toBe(1);
    expect(progress.upcoming).toBe(0);
  });

  it('nedatovaná přednáška se bere jako proběhlá', () => {
    expect(computeProgress([makeLecture({ date: null })], today).pending).toBe(1);
  });
});
