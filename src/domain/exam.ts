import { daysBetween } from './date';
import { plural } from './plural';
import type { IsoDate, Subject } from './types';

export type ExamUrgency = 'far' | 'soon' | 'imminent' | 'today' | 'past';

export interface ExamCountdown {
  days: number;
  urgency: ExamUrgency;
  label: string;
}

/** Odpočet do zkoušky: „za 23 dní“, „zítra“, „dnes“. Po termínu „proběhla“. */
export function examCountdown(examDate: IsoDate, today: IsoDate): ExamCountdown {
  const days = daysBetween(today, examDate);
  if (days < 0) return { days, urgency: 'past', label: 'zkouška proběhla' };
  if (days === 0) return { days, urgency: 'today', label: 'zkouška dnes' };
  if (days === 1) return { days, urgency: 'imminent', label: 'zkouška zítra' };
  const urgency: ExamUrgency = days <= 3 ? 'imminent' : days <= 14 ? 'soon' : 'far';
  return { days, urgency, label: `zkouška za ${days} ${plural(days, 'den', 'dny', 'dní')}` };
}

/**
 * Zkoušky, které se blíží (do `horizonDays`), od nejbližší. Pro upozornění
 * na hlavní obrazovce — dřív by jen strašily.
 */
export function upcomingExams(
  subjects: readonly Subject[],
  today: IsoDate,
  horizonDays = 21,
): Array<{ subject: Subject; countdown: ExamCountdown }> {
  return subjects
    .filter((s) => s.deletedAt === null && !s.archived && s.examDate !== null)
    .map((subject) => ({ subject, countdown: examCountdown(subject.examDate as IsoDate, today) }))
    .filter(({ countdown }) => countdown.days >= 0 && countdown.days <= horizonDays)
    .toSorted((a, b) => a.countdown.days - b.countdown.days);
}
