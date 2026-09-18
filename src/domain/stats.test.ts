import { describe, expect, it } from 'vitest';
import { activeWeeks, computePace, doneDate, medianLagDays, weekStreak, weeklyActivity } from './stats';
import { makeLecture } from '../test/factories';

const today = '2026-10-14'; // středa 5. týdne výuky

/** Přednáška zpracovaná v poledne daného dne (poledne kvůli časovému pásmu testu). */
function processed(date: string, doneOn: string) {
  return makeLecture({ date, status: 'summary', statusAt: { summary: `${doneOn}T12:00:00.000Z` } });
}

describe('doneDate', () => {
  it('bere nejdřívější razítko ze zpracovaných stavů', () => {
    const lecture = makeLecture({
      status: 'tested',
      statusAt: { tested: '2026-10-10T12:00:00.000Z', summary: '2026-10-02T12:00:00.000Z' },
    });
    expect(doneDate(lecture)).toBe('2026-10-02');
  });

  it('bez razítka vrátí null', () => {
    expect(doneDate(makeLecture({ status: 'summary' }))).toBeNull();
  });
});

describe('weeklyActivity', () => {
  it('rozdělí zpracované a proběhlé přednášky po týdnech od nejstaršího', () => {
    const buckets = weeklyActivity(
      [processed('2026-09-14', '2026-09-16'), processed('2026-10-05', '2026-10-13'), makeLecture({ date: '2026-10-12' })],
      today,
      5,
    );
    expect(buckets.map((b) => b.weekStart)).toEqual([
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
    ]);
    expect(buckets.map((b) => b.processed)).toEqual([1, 0, 0, 0, 1]);
    expect(buckets.map((b) => b.held)).toEqual([1, 0, 0, 1, 1]);
  });

  it('budoucí přednášky se jako proběhlé nepočítají', () => {
    const buckets = weeklyActivity([makeLecture({ date: '2026-10-16' })], today, 1);
    expect(buckets[0]?.held).toBe(0);
  });

  it('přeskočené a smazané ignoruje', () => {
    const buckets = weeklyActivity(
      [makeLecture({ date: '2026-10-12', status: 'skipped' }), makeLecture({ date: '2026-10-12', deletedAt: 'x' })],
      today,
      1,
    );
    expect(buckets[0]).toMatchObject({ processed: 0, held: 0 });
  });
});

describe('medianLagDays', () => {
  it('medián zpoždění zpracování', () => {
    expect(
      medianLagDays([
        processed('2026-09-14', '2026-09-15'),
        processed('2026-09-21', '2026-09-24'),
        processed('2026-09-28', '2026-10-08'),
      ]),
    ).toBe(3);
  });

  it('bez dat vrátí null', () => {
    expect(medianLagDays([makeLecture()])).toBeNull();
  });
});

describe('weekStreak', () => {
  const bucket = (count: number) => ({ weekStart: '', processed: count, held: 0 });

  it('počítá týdny v řadě od aktuálního', () => {
    expect(weekStreak([bucket(1), bucket(0), bucket(2), bucket(1)])).toBe(2);
  });

  it('rozjetý týden bez zpracování řadu ještě nepřerušuje', () => {
    expect(weekStreak([bucket(1), bucket(1), bucket(0)])).toBe(2);
  });
});

describe('computePace', () => {
  it('bez dluhu je výhled čistý', () => {
    expect(computePace([processed('2026-10-12', '2026-10-13')], today).outlook).toEqual({ kind: 'clear' });
  });

  it('když zpracovávám rychleji, než přibývá, spočítá týdny do dohnání', () => {
    const lectures = [
      // Za poslední 4 týdny: 8 zpracovaných, 4 proběhlé → čistě +1 týdně.
      ...Array.from({ length: 8 }, (_, i) => processed('2026-08-01', `2026-09-2${i}`.slice(0, 10))),
      makeLecture({ date: '2026-09-21' }),
      makeLecture({ date: '2026-09-28' }),
      makeLecture({ date: '2026-10-05' }),
      makeLecture({ date: '2026-10-12' }),
    ];
    const pace = computePace(lectures, today);
    expect(pace.backlog).toBe(4);
    expect(pace.outlook.kind).toBe('catching-up');
  });

  it('když přibývá rychleji, než stíhám, varuje', () => {
    const lectures = [makeLecture({ date: '2026-10-05' }), makeLecture({ date: '2026-10-12' })];
    // Dva týdny výuky, dvě přednášky, nic zpracováno → dluh roste o 1 týdně.
    expect(computePace(lectures, today).outlook).toEqual({ kind: 'falling-behind', perWeek: 1 });
  });
});

describe('activeWeeks', () => {
  it('počítá jen týdny od první proběhlé přednášky', () => {
    expect(activeWeeks([makeLecture({ date: '2026-10-12' })], today, 4)).toBe(1);
    expect(activeWeeks([makeLecture({ date: '2026-09-28' })], today, 4)).toBe(3);
    expect(activeWeeks([makeLecture({ date: '2026-01-01' })], today, 4)).toBe(4);
  });

  it('bez proběhlých přednášek vrátí minimum', () => {
    expect(activeWeeks([makeLecture({ date: '2027-01-01' })], today, 4, 2)).toBe(2);
  });
});

describe('tempo na začátku semestru', () => {
  it('první týden se neředí prázdnými týdny před výukou', () => {
    const lectures = [
      makeLecture({ date: '2026-10-12' }),
      makeLecture({ date: '2026-10-13' }),
      makeLecture({ date: '2026-10-14' }),
    ];
    // Tři přednášky za jediný týden výuky = 3 týdně, ne 0,75.
    expect(computePace(lectures, today).heldPerWeek).toBe(3);
  });
});
