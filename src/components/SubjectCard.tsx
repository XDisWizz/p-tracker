import { Archive, ArchiveRestore, ArrowDown, ArrowUp, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import type { Progress } from '../domain/progress';
import type { Subject } from '../domain/types';
import { ProgressBar } from './ProgressBar';
import { Menu, MenuItem, MenuSeparator } from './ui/Menu';
import { SUBJECT_COLOR_CLASSES, cx } from './tokens';

interface SubjectCardProps {
  subject: Subject;
  progress: Progress;
  selected: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
  /** `undefined` = na okraji seznamu, posun tím směrem nedává smysl. */
  onMoveUp?: (() => void) | undefined;
  onMoveDown?: (() => void) | undefined;
}

export function SubjectCard({
  subject,
  progress,
  selected,
  onOpen,
  onEdit,
  onToggleArchive,
  onDelete,
  onMoveUp,
  onMoveDown,
}: SubjectCardProps) {
  const colors = SUBJECT_COLOR_CLASSES[subject.color];

  return (
    <div
      className={cx(
        'relative flex items-stretch gap-3 overflow-hidden rounded-2xl bg-surface ring-1 transition-colors',
        selected ? 'ring-2 ring-accent' : 'ring-line',
      )}
    >
      <div className={cx('w-1.5 shrink-0', colors.bar)} aria-hidden />

      {/* Celá karta je jeden velký dotykový cíl; nabídka nad ním sedí zvlášť. */}
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 py-3 pr-2 text-left"
        aria-label={`Otevřít předmět ${subject.name}`}
      >
        <div className="flex items-center gap-2">
          <span className={cx('rounded-md px-1.5 py-0.5 text-xs font-semibold', colors.soft)}>
            {subject.code || '—'}
          </span>
          <h3 className="min-w-0 flex-1 truncate font-semibold">{subject.name || 'Bez názvu'}</h3>
        </div>

        <p className="mt-0.5 truncate text-xs text-muted">
          {subject.term}
          {subject.archived && ' · archivovaný'}
        </p>

        <ProgressBar progress={progress} className="mt-3" />

        <p className="mt-1.5 text-xs text-muted">
          {progress.total === 0 ? (
            'Zatím žádné přednášky'
          ) : (
            <>
              <span className="font-medium text-ink">
                {progress.done} z {progress.total}
              </span>{' '}
              zpracováno
              {progress.pending > 0 && <> · {pendingPhrase(progress.pending)}</>}
              {progress.skipped > 0 && <> · {progress.skipped} přeskočeno</>}
            </>
          )}
        </p>
      </button>

      <div className="flex items-start py-2 pr-1">
        <Menu label={`Možnosti předmětu ${subject.name}`}>
          {(close) => (
            <>
              <MenuItem
                icon={<Pencil size={16} />}
                onSelect={() => {
                  close();
                  onEdit();
                }}
              >
                Upravit předmět
              </MenuItem>

              {subject.lmsUrl !== null && subject.lmsUrl !== '' && (
                <MenuItem
                  icon={<ExternalLink size={16} />}
                  onSelect={() => {
                    close();
                    window.open(subject.lmsUrl ?? '', '_blank', 'noopener,noreferrer');
                  }}
                >
                  Otevřít v LMS
                </MenuItem>
              )}

              {onMoveUp !== undefined && (
                <MenuItem
                  icon={<ArrowUp size={16} />}
                  onSelect={() => {
                    close();
                    onMoveUp();
                  }}
                >
                  Posunout výš
                </MenuItem>
              )}
              {onMoveDown !== undefined && (
                <MenuItem
                  icon={<ArrowDown size={16} />}
                  onSelect={() => {
                    close();
                    onMoveDown();
                  }}
                >
                  Posunout níž
                </MenuItem>
              )}

              <MenuItem
                icon={subject.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                onSelect={() => {
                  close();
                  onToggleArchive();
                }}
              >
                {subject.archived ? 'Vrátit z archivu' : 'Archivovat'}
              </MenuItem>

              <MenuSeparator />

              <MenuItem
                danger
                icon={<Trash2 size={16} />}
                onSelect={() => {
                  close();
                  onDelete();
                }}
              >
                Smazat i s přednáškami
              </MenuItem>
            </>
          )}
        </Menu>
      </div>
    </div>
  );
}

/** Čeština má tři tvary podle počtu; „2 přednášky čekají“, ne „2 přednášky čeká“. */
function pendingPhrase(count: number): string {
  if (count === 1) return '1 přednáška čeká';
  if (count >= 2 && count <= 4) return `${count} přednášky čekají`;
  return `${count} přednášek čeká`;
}
