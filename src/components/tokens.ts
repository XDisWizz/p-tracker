import {
  CheckCircle2,
  Circle,
  Download,
  FileText,
  Layers,
  MinusCircle,
  type LucideIcon,
} from 'lucide-react';
import type { LectureStatus, SubjectColor } from '../domain/types';

/**
 * Prezentační mapy. Třídy jsou tu schválně napsané celé — Tailwind si je hledá
 * v kódu jako text, takže `bg-${color}-500` by se do výsledného CSS nedostalo.
 */

export interface SubjectColorClasses {
  /** Barevný proužek u karty předmětu. */
  bar: string;
  /** Tečka vedle názvu. */
  dot: string;
  /** Podbarvení odznaku se zkratkou. */
  soft: string;
}

export const SUBJECT_COLOR_CLASSES: Record<SubjectColor, SubjectColorClasses> = {
  sky: {
    bar: 'bg-sky-500 dark:bg-sky-400',
    dot: 'bg-sky-500 dark:bg-sky-400',
    soft: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  },
  emerald: {
    bar: 'bg-emerald-500 dark:bg-emerald-400',
    dot: 'bg-emerald-500 dark:bg-emerald-400',
    soft: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  },
  amber: {
    bar: 'bg-amber-500 dark:bg-amber-400',
    dot: 'bg-amber-500 dark:bg-amber-400',
    soft: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  },
  rose: {
    bar: 'bg-rose-500 dark:bg-rose-400',
    dot: 'bg-rose-500 dark:bg-rose-400',
    soft: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
  },
  violet: {
    bar: 'bg-violet-500 dark:bg-violet-400',
    dot: 'bg-violet-500 dark:bg-violet-400',
    soft: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
  },
  teal: {
    bar: 'bg-teal-500 dark:bg-teal-400',
    dot: 'bg-teal-500 dark:bg-teal-400',
    soft: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200',
  },
  orange: {
    bar: 'bg-orange-500 dark:bg-orange-400',
    dot: 'bg-orange-500 dark:bg-orange-400',
    soft: 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200',
  },
  indigo: {
    bar: 'bg-indigo-500 dark:bg-indigo-400',
    dot: 'bg-indigo-500 dark:bg-indigo-400',
    soft: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
  },
};

export interface StatusVisual {
  icon: LucideIcon;
  /** Odznak ve výpisu — barva plus ikona, nikdy jen barva. */
  badge: string;
  /** Výplň segmentu v ukazateli postupu. */
  segment: string;
}

export const STATUS_VISUALS: Record<LectureStatus, StatusVisual> = {
  not_started: {
    icon: Circle,
    badge: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    segment: 'bg-zinc-300 dark:bg-zinc-700',
  },
  materials: {
    icon: Download,
    badge: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
    segment: 'bg-amber-400 dark:bg-amber-500',
  },
  summary: {
    icon: FileText,
    badge: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
    segment: 'bg-sky-500 dark:bg-sky-400',
  },
  flashcards: {
    icon: Layers,
    badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
    segment: 'bg-violet-500 dark:bg-violet-400',
  },
  tested: {
    icon: CheckCircle2,
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
    segment: 'bg-emerald-500 dark:bg-emerald-400',
  },
  skipped: {
    icon: MinusCircle,
    badge: 'bg-transparent text-muted ring-1 ring-line',
    segment: 'bg-zinc-200 dark:bg-zinc-800',
  },
};

/** Spojí podmíněné třídy. Malá náhrada za `clsx`, ať kvůli tomuhle nepřibývá závislost. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
