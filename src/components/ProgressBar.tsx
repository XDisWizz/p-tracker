import { PIPELINE_STATUSES, statusLabel } from '../domain/status';
import type { Progress } from '../domain/progress';
import { STATUS_VISUALS, cx } from './tokens';

interface ProgressBarProps {
  progress: Progress;
  className?: string;
}

/**
 * Segmentovaný ukazatel. Jedno číslo „46 %“ neřekne, jestli zbytek leží
 * nezačatý, nebo mu chybí poslední krok — a to je právě ta informace,
 * kvůli které se člověk na přehled dívá.
 */
export function ProgressBar({ progress, className }: ProgressBarProps) {
  const { total, done, percent, byStatus } = progress;

  return (
    <div
      className={cx('flex flex-col gap-1.5', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${done} z ${total} zpracováno, ${percent} procent`}
    >
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-2">
        {total === 0
          ? null
          : PIPELINE_STATUSES.map((status) => {
              const count = byStatus[status];
              if (count === 0) return null;
              return (
                <div
                  key={status}
                  className={STATUS_VISUALS[status].segment}
                  style={{ width: `${(count / total) * 100}%` }}
                  title={`${statusLabel(status)}: ${count}`}
                />
              );
            })}
      </div>
    </div>
  );
}
