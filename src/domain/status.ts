import { LECTURE_STATUSES, type LectureStatus } from './types';

export interface StatusMeta {
  /** Pozice v pipeline. `skipped` má -1, protože do ní nepatří. */
  rank: number;
  /** Popisek do UI. */
  label: string;
  /**
   * Zkrácený popisek pro úzké displeje. Stav se v UI nikdy nerozlišuje jen
   * barvou — barvu i ikonu k němu přiřazuje prezentační vrstva.
   */
  short: string;
}

export const STATUS_META: Record<LectureStatus, StatusMeta> = {
  not_started: { rank: 0, label: 'Nezačato', short: 'Nezačato' },
  materials: { rank: 1, label: 'Podklady stažené', short: 'Podklady' },
  summary: { rank: 2, label: 'Shrnutí hotové', short: 'Shrnutí' },
  flashcards: { rank: 3, label: 'Kartičky hotové', short: 'Kartičky' },
  tested: { rank: 4, label: 'Otestováno', short: 'Otestováno' },
  skipped: { rank: -1, label: 'Přeskočeno', short: 'Přeskočeno' },
};

/** Stavy tvořící lineární postup, v pořadí. Bez `skipped`. */
export const PIPELINE_STATUSES: readonly LectureStatus[] = LECTURE_STATUSES.filter(
  (s) => STATUS_META[s].rank >= 0,
).sort((a, b) => STATUS_META[a].rank - STATUS_META[b].rank);

/** Hranice, od které se přednáška počítá jako zpracovaná (progress bar na hlavní obrazovce). */
export const DONE_THRESHOLD: LectureStatus = 'summary';

export function statusRank(status: LectureStatus): number {
  return STATUS_META[status].rank;
}

export function statusLabel(status: LectureStatus): string {
  return STATUS_META[status].label;
}

export function isSkipped(status: LectureStatus): boolean {
  return status === 'skipped';
}

/**
 * Je stav aspoň na úrovni `min`?
 *
 * `skipped` nikdy — vědomě přeskočená přednáška není totéž co hotová a nemá
 * se počítat do splněného. Z celkového počtu ji vyřazuje `computeProgress`.
 */
export function isAtLeast(status: LectureStatus, min: LectureStatus): boolean {
  if (isSkipped(status)) return false;
  return statusRank(status) >= statusRank(min);
}

/** Zpracováno = shrnutí hotové nebo dál. */
export function isDone(status: LectureStatus): boolean {
  return isAtLeast(status, DONE_THRESHOLD);
}

/** Čeká na mě = nezačato nebo jen stažené podklady. Tohle plní obrazovku „Co mě čeká“. */
export function isPending(status: LectureStatus): boolean {
  return status === 'not_started' || status === 'materials';
}

/** Výchozí výběr obrazovky „Co mě čeká“, když uživatel žádný stav nezvolil. */
export const PENDING_STATUSES: readonly LectureStatus[] = LECTURE_STATUSES.filter(isPending);

/**
 * Následující stav v pipeline pro tapnutí na odznak ve seznamu.
 * Poslední stav se vrací na začátek, aby šlo opravit překliknutí bez otevírání detailu.
 * `skipped` cyklus nezahrnuje — nastavuje se jen výslovně z kontextové nabídky.
 */
export function nextStatus(status: LectureStatus): LectureStatus {
  if (isSkipped(status)) return 'not_started';
  const index = PIPELINE_STATUSES.indexOf(status);
  const next = PIPELINE_STATUSES[(index + 1) % PIPELINE_STATUSES.length];
  return next ?? 'not_started';
}

export function isLectureStatus(value: unknown): value is LectureStatus {
  return typeof value === 'string' && (LECTURE_STATUSES as readonly string[]).includes(value);
}
