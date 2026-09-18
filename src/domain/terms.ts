import { isValidIsoDate } from './date';
import type { IsoDate, Subject, Term, TermInput } from './types';
import { teachingWeekCount } from './schedule';

/**
 * Známá období výuky. Aplikace je offline, takže harmonogram si stáhnout
 * nemůže — co je tady, předvyplní se samo, zbytek se zadá v Nastavení.
 *
 * Zdroj: harmonogram akademického roku FEI VŠB-TUO
 * (https://www.fei.vsb.cz/cs/student/harmonogramy-a-rozvrhy/harmonogram-akademickeho-roku/).
 * Dny volna jsou státní svátky, které do výuky spadají.
 */
export const TERM_PRESETS: readonly TermInput[] = [
  {
    id: '2026/27 ZS',
    teachingStart: '2026-09-14',
    teachingEnd: '2026-12-12',
    skipDates: ['2026-09-28', '2026-10-28', '2026-11-17'],
  },
];

export function termPreset(id: string): TermInput | undefined {
  return TERM_PRESETS.find((t) => t.id === id);
}

/** Rozumný odhad pro semestr, který v předvolbách není: 13 týdnů od druhého pondělí v září / v únoru. */
export function guessTerm(id: string): TermInput {
  const match = /^(\d{4})\/\d{2}\s+(ZS|LS)$/.exec(id.trim());
  const year = match ? Number(match[1]) : new Date().getFullYear();
  const summer = match?.[2] === 'LS';
  const monthStart = summer ? `${year + 1}-02-01` : `${year}-09-01`;
  const first = new Date(`${monthStart}T12:00:00Z`);
  // Druhé pondělí v měsíci.
  const offset = (8 - (first.getUTCDay() || 7)) % 7;
  const start = new Date(first.getTime() + (offset + 7) * 86_400_000).toISOString().slice(0, 10);
  const end = new Date(new Date(`${start}T12:00:00Z`).getTime() + (13 * 7 - 2) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return { id, teachingStart: start, teachingEnd: end, skipDates: [] };
}

export function validateTerm(input: TermInput): string | null {
  if (input.id.trim() === '') return 'Chybí název semestru.';
  if (!isValidIsoDate(input.teachingStart) || !isValidIsoDate(input.teachingEnd)) return 'Neplatné datum.';
  if (input.teachingEnd < input.teachingStart) return 'Konec výuky je před začátkem.';
  if (teachingWeekCount(input) > 30) return 'Výuka delší než 30 týdnů — překlep v datu?';
  const bad = input.skipDates.find((d) => !isValidIsoDate(d));
  if (bad !== undefined) return `Neplatné datum volna: ${bad}`;
  return null;
}

/** Seřazené a bez duplicit — volno se zadává ručně a pořadí nikoho nezajímá. */
export function normalizeSkipDates(dates: readonly IsoDate[]): IsoDate[] {
  return [...new Set(dates.filter(isValidIsoDate))].toSorted();
}

/**
 * Semestry z databáze doplněné o předvolby pro semestry předmětů, které v ní
 * ještě nejsou. Rozvrh tak ukazuje sudé a liché týdny i svátky hned, ne až
 * po první synchronizaci přednášek, která předvolbu uloží.
 */
export function withPresets(terms: readonly Term[], subjects: readonly Subject[]): Term[] {
  const known = new Set(terms.map((t) => t.id));
  const out = [...terms];
  for (const id of new Set(subjects.map((s) => s.term))) {
    if (known.has(id)) continue;
    const preset = termPreset(id);
    if (preset !== undefined) out.push({ ...preset, createdAt: '', updatedAt: '', deletedAt: null });
  }
  return out;
}
