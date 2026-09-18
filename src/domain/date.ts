import type { IsoDate, IsoDateTime } from './types';

/**
 * Práce s kalendářními daty.
 *
 * Datum konání přednášky je kalendářní údaj, ne okamžik. Jakmile projde přes
 * `new Date('2026-09-15')`, JavaScript ho vyloží jako půlnoc UTC a uživateli
 * v CEST se pondělní přednáška zobrazí jako nedělní. Proto se `YYYY-MM-DD`
 * všude nese jako řetězec a počítá se nad ním ručně.
 */

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string): value is IsoDate {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parts = value.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // Odchytí 31. února: den po normalizaci musí zůstat stejný.
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

/** Dnešek podle *místního* kalendáře uživatele, ne podle UTC. */
export function todayIso(now: Date = new Date()): IsoDate {
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function nowIso(now: Date = new Date()): IsoDateTime {
  return now.toISOString();
}

function toIsoDate(year: number, month: number, day: number): IsoDate {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** Posun o dny. Počítá se v UTC, takže přechod na letní čas nemá kam zasáhnout. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const parts = date.split('-');
  const utc = Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const shifted = new Date(utc + days * 86_400_000);
  return toIsoDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/** Kladné číslo znamená, že `b` je později než `a`. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  const toUtc = (d: IsoDate): number => {
    const p = d.split('-');
    return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/**
 * Relativní popisek vůči dnešku: „dnes“, „včera“, „před 12 dny“, „za 3 dny“.
 * U obrazovky „Co mě čeká“ je stáří přednášky důležitější než samotné datum.
 */
export function relativeDays(date: IsoDate, today: IsoDate): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return 'dnes';
  if (diff === -1) return 'včera';
  if (diff === 1) return 'zítra';
  const n = Math.abs(diff);
  if (diff < 0) return `před ${n} dny`;
  return n <= 4 ? `za ${n} dny` : `za ${n} dní`;
}

/** Formát pro UI: `15. 9. 2026`. */
export function formatCsDate(date: IsoDate): string {
  const p = date.split('-');
  return `${Number(p[2])}. ${Number(p[1])}. ${p[0]}`;
}

/** Den a měsíc: `15. 9.` */
export function formatCsDayMonth(date: IsoDate): string {
  const p = date.split('-');
  return `${Number(p[2])}. ${Number(p[1])}.`;
}

/** Krátký formát pro seznamy: `po 15. 9.` */
export function formatCsShort(date: IsoDate): string {
  const p = date.split('-');
  const weekday = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
  const dow = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]))).getUTCDay();
  return `${weekday[dow] ?? ''} ${Number(p[2])}. ${Number(p[1])}.`;
}

/**
 * Odhad aktuálního semestru z data. VŠB má zimní semestr zhruba od září
 * a letní od února; hranice je měkká a slouží jen k předvyplnění pole.
 */
export function currentTerm(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 9) return `${year}/${String((year + 1) % 100).padStart(2, '0')} ZS`;
  if (month <= 1) return `${year - 1}/${String(year % 100).padStart(2, '0')} ZS`;
  return `${year - 1}/${String(year % 100).padStart(2, '0')} LS`;
}
