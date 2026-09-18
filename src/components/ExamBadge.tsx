import { GraduationCap } from 'lucide-react';
import { todayIso } from '../domain/date';
import { examCountdown, type ExamUrgency } from '../domain/exam';
import type { IsoDate } from '../domain/types';
import { cx } from './tokens';

const TONE: Record<ExamUrgency, string> = {
  far: 'bg-surface-2 text-muted',
  soon: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  imminent: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
  today: 'bg-rose-600 text-white',
  past: 'bg-surface-2 text-muted line-through decoration-muted/50',
};

/** Odpočet do zkoušky. Barva i text — naléhavost se nikdy nesděluje jen barvou. */
export function ExamBadge({ examDate, className }: { examDate: IsoDate; className?: string }) {
  const countdown = examCountdown(examDate, todayIso());
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
        TONE[countdown.urgency],
        className,
      )}
    >
      <GraduationCap size={12} aria-hidden />
      {countdown.label}
    </span>
  );
}
