import { addDays, daysBetween, todayIso } from './date';
import { mondayOf } from './schedule';
import { isDone, isSkipped } from './status';
import type { IsoDate, Lecture } from './types';
import { NONE_PENDING, isAhead, type NotYetHeld } from './held';

/**
 * Kdy byla přednáška poprvé zpracovaná (shrnutí nebo dál), jako místní datum.
 * Starší data importovaná bez razítek vrátí `null` — do tempa se nepočítají,
 * do celkového postupu ano.
 */
export function doneDate(lecture: Lecture): IsoDate | null {
  const stamps = [lecture.statusAt.summary, lecture.statusAt.flashcards, lecture.statusAt.tested].filter(
    (s): s is string => s !== undefined,
  );
  if (stamps.length === 0) return null;
  const first = stamps.toSorted()[0];
  return first === undefined ? null : todayIso(new Date(first));
}

export interface WeekBucket {
  /** Pondělí týdne. */
  weekStart: IsoDate;
  /** Kolik přednášek jsem ten týden zpracoval. */
  processed: number;
  /** Kolik přednášek ten týden proběhlo. */
  held: number;
}

/**
 * Kolik týdnů zpět má smysl zobrazovat: od týdne první proběhlé přednášky,
 * nejvýš `max`. Týdny před začátkem semestru jsou jen nuly, které by tempo
 * i graf zkreslily.
 */
export function activeWeeks(lectures: readonly Lecture[], today: IsoDate, max: number, min = 1): number {
  const held = lectures
    .filter((l) => l.deletedAt === null && l.date !== null && l.date <= today)
    .map((l) => l.date as IsoDate)
    .toSorted();
  const first = held[0];
  if (first === undefined) return min;
  const span = Math.floor(daysBetween(mondayOf(first), mondayOf(today)) / 7) + 1;
  return Math.max(min, Math.min(max, span));
}

/** Posledních `weeks` týdnů včetně aktuálního, od nejstaršího. */
export function weeklyActivity(lectures: readonly Lecture[], today: IsoDate, weeks = 8): WeekBucket[] {
  const thisMonday = mondayOf(today);
  const buckets: WeekBucket[] = Array.from({ length: weeks }, (_, i) => ({
    weekStart: addDays(thisMonday, -7 * (weeks - 1 - i)),
    processed: 0,
    held: 0,
  }));
  const index = new Map(buckets.map((b, i) => [b.weekStart, i]));

  for (const lecture of lectures) {
    if (lecture.deletedAt !== null || isSkipped(lecture.status)) continue;
    const done = doneDate(lecture);
    if (done !== null) {
      const i = index.get(mondayOf(done));
      const bucket = i === undefined ? undefined : buckets[i];
      if (bucket !== undefined) bucket.processed += 1;
    }
    if (lecture.date !== null && lecture.date <= today) {
      const i = index.get(mondayOf(lecture.date));
      const bucket = i === undefined ? undefined : buckets[i];
      if (bucket !== undefined) bucket.held += 1;
    }
  }
  return buckets;
}

/** Medián dní mezi přednáškou a jejím zpracováním. `null`, když není z čeho počítat. */
export function medianLagDays(lectures: readonly Lecture[]): number | null {
  const lags = lectures
    .filter((l) => l.deletedAt === null && l.date !== null)
    .map((l) => {
      const done = doneDate(l);
      return done === null || l.date === null ? null : Math.max(0, daysBetween(l.date, done));
    })
    .filter((d): d is number => d !== null)
    .toSorted((a, b) => a - b);
  if (lags.length === 0) return null;
  const mid = Math.floor(lags.length / 2);
  const value = lags.length % 2 === 1 ? lags[mid] : ((lags[mid - 1] ?? 0) + (lags[mid] ?? 0)) / 2;
  return value === undefined ? null : Math.round(value * 10) / 10;
}

/** Kolik týdnů v řadě (od aktuálního zpět) jsem zpracoval aspoň jednu přednášku. */
export function weekStreak(buckets: readonly WeekBucket[]): number {
  let streak = 0;
  for (let i = buckets.length - 1; i >= 0; i -= 1) {
    const bucket = buckets[i];
    if (bucket === undefined) break;
    // Rozjetý aktuální týden bez zpracování ještě řadu nepřerušuje.
    if (bucket.processed === 0) {
      if (i === buckets.length - 1) continue;
      break;
    }
    streak += 1;
  }
  return streak;
}

export type Outlook =
  | { kind: 'clear' }
  | { kind: 'catching-up'; weeks: number }
  | { kind: 'falling-behind'; perWeek: number }
  | { kind: 'unknown' };

export interface Pace {
  /** Průměr zpracovaných za týden (poslední 4 týdny). */
  processedPerWeek: number;
  /** Průměr odpřednášených za týden (poslední 4 týdny). */
  heldPerWeek: number;
  /** Proběhlé a ještě nezpracované. */
  backlog: number;
  outlook: Outlook;
}

/**
 * Tempo a výhled: stíhám, doháním, nebo mi dluh roste? Počítá z posledních
 * čtyř týdnů — delší okno by v semestru reagovalo moc pomalu.
 */
export function computePace(lectures: readonly Lecture[], today: IsoDate, notYet: NotYetHeld = NONE_PENDING): Pace {
  const recent = weeklyActivity(lectures, today, activeWeeks(lectures, today, 4));
  const processedPerWeek = recent.reduce((s, b) => s + b.processed, 0) / recent.length;
  const heldPerWeek = recent.reduce((s, b) => s + b.held, 0) / recent.length;
  const backlog = lectures.filter(
    (l) =>
      l.deletedAt === null &&
      !isSkipped(l.status) &&
      !isDone(l.status) &&
      !isAhead(l, today, notYet),
  ).length;

  let outlook: Outlook;
  if (backlog === 0) outlook = { kind: 'clear' };
  else if (processedPerWeek === 0 && heldPerWeek === 0) outlook = { kind: 'unknown' };
  else {
    const net = processedPerWeek - heldPerWeek;
    outlook =
      net > 0
        ? { kind: 'catching-up', weeks: Math.ceil(backlog / net) }
        : { kind: 'falling-behind', perWeek: Math.round(-net * 10) / 10 };
  }

  return {
    processedPerWeek: Math.round(processedPerWeek * 10) / 10,
    heldPerWeek: Math.round(heldPerWeek * 10) / 10,
    backlog,
    outlook,
  };
}
