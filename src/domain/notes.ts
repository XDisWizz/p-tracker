import type { Lecture, LecturePatch } from './types';
import { isAtLeast } from './status';

/**
 * Co se má u přednášky změnit samo, když uživatel doplní zápisky.
 *
 *   – vložený přepis → zaškrtne „má přepis“ (nikdo to nedělá ručně),
 *   – první zápis u nezačaté přednášky → „podklady stažené“, protože s nimi
 *     zjevně pracuje; stav dál (shrnutí hotové) už rozhoduje uživatel sám.
 *
 * Nikdy stav nesnižuje a nikdy nepřeskakuje až na „shrnutí hotové“.
 */
export function suggestAutoUpdates(lecture: Lecture, patch: LecturePatch): LecturePatch {
  const merged = { ...lecture, ...patch };
  const out: LecturePatch = {};

  if (patch.transcript !== undefined && patch.transcript.trim() !== '' && !lecture.hasTranscript) {
    out.hasTranscript = true;
  }

  const hasContent =
    merged.transcript.trim() !== '' || merged.summary.trim() !== '' || merged.focus.trim() !== '';
  if (hasContent && lecture.status === 'not_started') out.status = 'materials';

  return out;
}

/** Nabídnout „Shrnutí je hotové“? Až když je co shrnovat a stav ještě nedosáhl shrnutí. */
export function canMarkSummaryDone(lecture: Pick<Lecture, 'status' | 'summary'>): boolean {
  return lecture.summary.trim().length >= 20 && lecture.status !== 'skipped' && !isAtLeast(lecture.status, 'summary');
}

export interface TextStats {
  words: number;
  characters: number;
  /** Odhad času čtení při 200 slovech za minutu. */
  readingMinutes: number;
}

export function textStats(text: string): TextStats {
  const trimmed = text.trim();
  const words = trimmed === '' ? 0 : trimmed.split(/\s+/).length;
  return { words, characters: text.length, readingMinutes: Math.max(words === 0 ? 0 : 1, Math.round(words / 200)) };
}
