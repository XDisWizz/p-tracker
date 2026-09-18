import { STATUS_META, nextStatus } from '../domain/status';
import type { LectureStatus } from '../domain/types';
import { STATUS_VISUALS, cx } from './tokens';

interface StatusBadgeProps {
  status: LectureStatus;
  /** Bez obsluhy je to jen štítek, s ní tlačítko posouvající stav dál. */
  onAdvance?: (next: LectureStatus) => void;
  className?: string;
  /** Na úzkém displeji schovat text a nechat jen ikonu. */
  compactOnNarrow?: boolean;
}

/**
 * Stav se vždycky sděluje ikonou i textem, barva je jen třetí vrstva.
 * Pět odstínů vedle sebe nerozliší každý a na tabletu na slunci skoro nikdo.
 */
export function StatusBadge({ status, onAdvance, className, compactOnNarrow = false }: StatusBadgeProps) {
  const visual = STATUS_VISUALS[status];
  const Icon = visual.icon;
  const meta = STATUS_META[status];

  const content = (
    <>
      <Icon size={15} className="shrink-0" aria-hidden />
      {/* Na úzkém telefonu jen ikona — jinak by odznak vytlačil z řádku název přednášky.
          Text zůstává pro čtečky obrazovky. */}
      <span className={cx('truncate', compactOnNarrow && 'max-[420px]:sr-only')}>{meta.short}</span>
    </>
  );

  const shared = cx(
    'inline-flex items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
    visual.badge,
    className,
  );

  if (onAdvance === undefined) {
    return <span className={cx(shared, 'h-7')}>{content}</span>;
  }

  const upcoming = nextStatus(status);

  return (
    <button
      type="button"
      // Dotykový cíl 44 px vytváří svislá výplň, samotný odznak zůstává drobný.
      className={cx(shared, 'h-11 sm:h-8', 'transition-opacity hover:opacity-80 active:opacity-60')}
      aria-label={`Stav: ${meta.label}. Přepnout na ${STATUS_META[upcoming].label}.`}
      onClick={(event) => {
        event.stopPropagation();
        onAdvance(upcoming);
      }}
    >
      {content}
    </button>
  );
}
