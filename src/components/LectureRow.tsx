import { BookOpen, ExternalLink, FileType2, Link2, NotebookPen, Pencil, StickyNote, Trash2 } from 'lucide-react';
import { LECTURE_STATUSES } from '../domain/types';
import type { Lecture, LectureStatus } from '../domain/types';
import { STATUS_META } from '../domain/status';
import { lectureDisplayTitle } from '../domain/defaults';
import { formatCsShort } from '../domain/date';
import { StatusBadge } from './StatusBadge';
import { Menu, MenuItem, MenuSeparator } from './ui/Menu';
import { STATUS_VISUALS, cx } from './tokens';

interface LectureRowProps {
  lecture: Lecture;
  /** Zobrazí se jen v pohledech přes víc předmětů. */
  subjectLabel?: { code: string; color: string } | undefined;
  /** Doplněk k datu, třeba „před 12 dny“. */
  dateHint?: string | undefined;
  /** Nabídka „Otevřít předmět“ — jen tam, kde předmět není vidět. */
  onOpenSubject?: (() => void) | undefined;
  /**
   * `source` říká, odkud změna přišla. Posun odznakem se vrací dalším tapnutím,
   * kdežto skok z nabídky může být velký a zaslouží si nabídku vrácení.
   */
  onSetStatus: (status: LectureStatus, source: 'badge' | 'menu') => void;
  onEdit: () => void;
  /** Otevře detail se zápisky. Bez něj klepnutí na řádek otevře úpravu údajů. */
  onOpen?: (() => void) | undefined;
  onDelete: () => void;
  /** Datum je v budoucnu — řádek se ztlumí, aby minulost a dluh vynikly. */
  upcoming?: boolean;
  /** Přednáška je dnes. */
  isToday?: boolean;
  /** Vybraná klávesnicí (j/k). */
  selected?: boolean;
}

export function LectureRow({
  lecture,
  subjectLabel,
  dateHint,
  onOpenSubject,
  onSetStatus,
  onEdit,
  onOpen,
  onDelete,
  upcoming = false,
  isToday = false,
  selected = false,
}: LectureRowProps) {
  const hasNote = lecture.note.trim().length > 0;
  const hasNotes = lecture.summary.trim() !== '' || lecture.focus.trim() !== '';
  const hasUrl = lecture.url !== null && lecture.url !== '';

  return (
    <li
      data-lecture-id={lecture.id}
      aria-current={selected ? 'true' : undefined}
      className={cx(
        'flex items-center gap-2 rounded-xl px-2 py-1.5',
        selected ? 'bg-accent-soft ring-2 ring-accent' : 'bg-surface',
        !selected && (isToday ? 'ring-2 ring-accent/60' : 'ring-1 ring-line'),
        upcoming && !selected && 'opacity-60',
      )}
    >
      <span className="w-7 shrink-0 text-center text-sm font-semibold tabular-nums text-muted">
        {lecture.number}
      </span>

      <button
        type="button"
        onClick={onOpen ?? onEdit}
        className="min-w-0 flex-1 py-1 text-left"
        aria-label={`${onOpen !== undefined ? 'Otevřít' : 'Upravit'} ${lectureDisplayTitle(lecture)}`}
      >
        <div className="flex min-w-0 items-center gap-2">
          {subjectLabel !== undefined && (
            <span className={cx('shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold', subjectLabel.color)}>
              {subjectLabel.code}
            </span>
          )}
          <span
            className={cx(
              'min-w-0 truncate text-sm',
              lecture.title.trim() === '' ? 'text-muted italic' : 'font-medium',
            )}
          >
            {lectureDisplayTitle(lecture)}
          </span>
        </div>

        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          {isToday && <span className="font-semibold text-accent">dnes</span>}
          {hasNotes && (
            <span className="inline-flex items-center gap-0.5 text-ink" title="Má zápisky">
              <NotebookPen size={12} aria-hidden /> zápis
            </span>
          )}
          {lecture.date !== null && (
            <span className="tabular-nums">
              {formatCsShort(lecture.date)}
              {dateHint !== undefined && <span className="text-muted/80"> · {dateHint}</span>}
            </span>
          )}
          {lecture.hasSlides && (
            <span className="inline-flex items-center gap-0.5" title="Prezentace k dispozici">
              <FileType2 size={12} aria-hidden /> prezentace
            </span>
          )}
          {lecture.hasTranscript && (
            <span className="inline-flex items-center gap-0.5" title="Přepis k dispozici">
              <StickyNote size={12} aria-hidden /> přepis
            </span>
          )}
          {hasNote && <span title={lecture.note}>· poznámka</span>}
          {lecture.tags.map((tag) => (
            <span key={tag} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px]">
              {tag}
            </span>
          ))}
        </div>
      </button>

      {hasUrl && (
        <a
          href={lecture.url ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          aria-label="Otevřít podklady"
          title="Otevřít podklady"
          className="hidden size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink sm:inline-flex"
        >
          <Link2 size={18} />
        </a>
      )}

      <StatusBadge
        status={lecture.status}
        onAdvance={(next) => onSetStatus(next, 'badge')}
        className="shrink-0"
      />

      <Menu label={`Možnosti přednášky ${lectureDisplayTitle(lecture)}`}>
        {(close) => (
          <>
            <p className="px-3 pt-1.5 pb-1 text-xs font-medium text-muted">Nastavit stav</p>
            {LECTURE_STATUSES.map((status) => {
              const Icon = STATUS_VISUALS[status].icon;
              return (
                <MenuItem
                  key={status}
                  icon={<Icon size={16} />}
                  active={status === lecture.status}
                  onSelect={() => {
                    close();
                    onSetStatus(status, 'menu');
                  }}
                >
                  {STATUS_META[status].label}
                </MenuItem>
              );
            })}

            <MenuSeparator />

            <MenuItem
              icon={<Pencil size={16} />}
              onSelect={() => {
                close();
                onEdit();
              }}
            >
              Upravit přednášku
            </MenuItem>

            {onOpenSubject !== undefined && (
              <MenuItem
                icon={<BookOpen size={16} />}
                onSelect={() => {
                  close();
                  onOpenSubject();
                }}
              >
                Otevřít předmět
              </MenuItem>
            )}

            {hasUrl && (
              <MenuItem
                icon={<ExternalLink size={16} />}
                onSelect={() => {
                  close();
                  window.open(lecture.url ?? '', '_blank', 'noopener,noreferrer');
                }}
              >
                Otevřít podklady
              </MenuItem>
            )}

            <MenuItem
              danger
              icon={<Trash2 size={16} />}
              onSelect={() => {
                close();
                onDelete();
              }}
            >
              Smazat
            </MenuItem>
          </>
        )}
      </Menu>
    </li>
  );
}
