import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, MapPin, Pencil, Plus } from 'lucide-react';
import { addDays, formatCsDayMonth, formatCsShort, todayIso } from '../domain/date';
import {
  DAY_LABELS,
  SLOT_KIND_LABELS,
  SLOT_KIND_SHORT,
  formatTime,
  lectureForOccurrence,
  minutesOfDay,
  mondayOf,
  occurrencesOn,
  teachingWeek,
  weekRangeLabel,
  type Occurrence,
} from '../domain/schedule';
import { lectureDisplayTitle } from '../domain/defaults';
import { scheduleToIcs } from '../domain/ical';
import { countOf } from '../domain/plural';
import { downloadFile } from '../lib/files';
import { useToast } from '../components/ui/Toast';
import type { Id, IsoDate, Lecture, Term } from '../domain/types';
import { useAllLectures } from '../hooks/useLiveData';
import { useNow } from '../hooks/useNow';
import { useScheduleContext, useSlotEditor } from '../hooks/useSchedule';
import { StatusBadge } from '../components/StatusBadge';
import { Button, IconButton } from '../components/ui/Button';
import { SUBJECT_COLOR_CLASSES, cx } from '../components/tokens';

interface SchedulePanelProps {
  /** Pondělí zobrazeného týdne; `null` = tento týden. */
  week: IsoDate | null;
  onWeekChange: (monday: IsoDate | null) => void;
  onOpenLecture: (id: Id) => void;
  onOpenSubject: (id: Id) => void;
  /** Na úzkém displeji jen seznam dnů pod sebou, na širokém mřížka. */
  wide: boolean;
}

export function SchedulePanel({ week, onWeekChange, onOpenLecture, onOpenSubject, wide }: SchedulePanelProps) {
  const context = useScheduleContext();
  const lectures = useAllLectures();
  const now = useNow();
  const today = todayIso(now);
  const monday = week ?? mondayOf(today);
  const editor = useSlotEditor();
  const toast = useToast();
  const scroller = useRef<HTMLDivElement>(null);
  const isThisWeek = monday === mondayOf(today);

  const days = useMemo(() => {
    if (context === undefined) return [];
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(monday, i);
      return { date, dayOfWeek: i + 1, occurrences: occurrencesOn(date, context) };
    });
  }, [context, monday]);

  // Na telefonu jsou dny pod sebou — otevřít rovnou na dnešku, ne na pondělí.
  const ready = context !== undefined && lectures !== undefined;
  useEffect(() => {
    if (!ready || wide || !isThisWeek) return;
    const todayEl = scroller.current?.querySelector<HTMLElement>('[data-today="true"]');
    if (todayEl !== null && todayEl !== undefined && scroller.current !== null) {
      // Kontejner je `relative`, takže offsetTop je měřený přímo od něj.
      scroller.current.scrollTop = todayEl.offsetTop - 8;
    }
  }, [ready, wide, isThisWeek]);

  if (context === undefined || lectures === undefined) return null;

  // Víkend jen tehdy, když v něm nějaká hodina je — jinak by zabíral místo zbytečně.
  const visibleDays = days.filter((d) => d.dayOfWeek <= 5 || d.occurrences.length > 0);
  const weekLabel = describeWeek(monday, context.subjects.map((s) => s.term), context.terms);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">Rozvrh</h2>
          <p className="text-xs text-muted">
            {formatCsShort(monday)} – {formatCsShort(addDays(monday, 6))}
            {weekLabel !== null && <> · {weekLabel}</>}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <IconButton label="Předchozí týden" onClick={() => onWeekChange(addDays(monday, -7))}>
            <ChevronLeft size={20} />
          </IconButton>
          <Button size="sm" variant={isThisWeek ? 'ghost' : 'secondary'} onClick={() => onWeekChange(null)}>
            Dnes
          </Button>
          <IconButton label="Další týden" onClick={() => onWeekChange(addDays(monday, 7))}>
            <ChevronRight size={20} />
          </IconButton>
          {context.slots.length > 0 && (
            <IconButton
              label="Exportovat rozvrh do kalendáře (.ics)"
              onClick={() => {
                const result = scheduleToIcs(context.slots, context.subjects, context.terms);
                downloadFile('rozvrh.ics', result.text, 'text/calendar');
                const skipped =
                  result.skippedSubjects.length > 0
                    ? ` Bez semestru, vynecháno: ${result.skippedSubjects.join(', ')}.`
                    : '';
                toast(
                  `Staženo ${countOf(result.events, 'hodina', 'hodiny', 'hodin')} — otevři soubor v kalendáři.${skipped}`,
                );
              }}
            >
              <CalendarPlus size={19} />
            </IconButton>
          )}
          <Button
            size="sm"
            variant="primary"
            onClick={() => editor.openNew()}
            disabled={context.subjects.length === 0}
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Hodina</span>
          </Button>
        </div>
      </div>

      <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto px-4 py-3">
        {context.subjects.length === 0 ? (
          <Empty text="Nejdřív přidej předměty, pak do rozvrhu naklikej jejich hodiny." />
        ) : context.slots.length === 0 ? (
          <Empty
            text="Rozvrh je prázdný. Přidej hodiny — u přednášek se v předmětu samy vytvoří přednášky na celý semestr."
            action={
              <Button variant="primary" onClick={() => editor.openNew()}>
                <Plus size={16} />
                Přidat první hodinu
              </Button>
            }
          />
        ) : wide ? (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${visibleDays.length}, minmax(9rem, 1fr))` }}
          >
            {visibleDays.map((day) => (
              <DayColumn
                key={day.date}
                date={day.date}
                dayOfWeek={day.dayOfWeek}
                occurrences={day.occurrences}
                today={today}
                nowMinutes={minutesOfDay(now)}
                lectures={lectures}
                onOpenLecture={onOpenLecture}
                onOpenSubject={onOpenSubject}
                onEditSlot={editor.openEdit}
                onAdd={() => editor.openNew({ dayOfWeek: day.dayOfWeek })}
                compact
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {visibleDays.map((day) => (
              <DayColumn
                key={day.date}
                date={day.date}
                dayOfWeek={day.dayOfWeek}
                occurrences={day.occurrences}
                today={today}
                nowMinutes={minutesOfDay(now)}
                lectures={lectures}
                onOpenLecture={onOpenLecture}
                onOpenSubject={onOpenSubject}
                onEditSlot={editor.openEdit}
                onAdd={() => editor.openNew({ dayOfWeek: day.dayOfWeek })}
                compact={false}
              />
            ))}
          </div>
        )}
      </div>

      {editor.editor}
    </div>
  );
}

/** „3. týden výuky · lichý“ podle semestru, který mají předměty nejčastěji. */
function describeWeek(
  monday: IsoDate,
  subjectTerms: readonly string[],
  terms: readonly Term[],
): string | null {
  const counts = new Map<string, number>();
  for (const t of subjectTerms) counts.set(t, (counts.get(t) ?? 0) + 1);
  const mainTerm = [...counts.entries()].toSorted((a, b) => b[1] - a[1])[0]?.[0];
  const term = terms.find((t) => t.id === mainTerm);
  if (term === undefined) return null;
  // Týden výuky podle kteréhokoliv dne týdne, který do výuky spadá.
  for (let i = 0; i < 7; i += 1) {
    const week = teachingWeek(term, addDays(monday, i));
    if (week !== null) return `${week}. týden výuky · ${week % 2 === 1 ? 'lichý' : 'sudý'}`;
  }
  return monday < term.teachingStart ? 'před začátkem výuky' : 'mimo výuku';
}

function DayColumn({
  date,
  dayOfWeek,
  occurrences,
  today,
  nowMinutes,
  lectures,
  onOpenLecture,
  onOpenSubject,
  onEditSlot,
  onAdd,
  compact,
}: {
  date: IsoDate;
  dayOfWeek: number;
  occurrences: Occurrence[];
  today: IsoDate;
  nowMinutes: number;
  lectures: readonly Lecture[];
  onOpenLecture: (id: Id) => void;
  onOpenSubject: (id: Id) => void;
  onEditSlot: (slot: Occurrence['slot']) => void;
  onAdd: () => void;
  compact: boolean;
}) {
  const isToday = date === today;
  const isPast = date < today;

  return (
    <section
      data-today={isToday ? 'true' : undefined}
      className={cx('flex min-w-0 flex-col gap-1.5', isPast && !isToday && 'opacity-70')}
    >
      <h3
        className={cx(
          'flex items-center justify-between gap-2 text-xs font-semibold tracking-wide uppercase',
          isToday ? 'text-accent' : 'text-muted',
        )}
      >
        <span>
          {DAY_LABELS[dayOfWeek - 1]} <span className="font-normal normal-case">{formatCsDayMonth(date)}</span>
          {isToday && <span className="ml-1 normal-case">· dnes</span>}
        </span>
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Přidat hodinu na ${DAY_LABELS[dayOfWeek - 1]}`}
          className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
        >
          <Plus size={14} />
        </button>
      </h3>

      {occurrences.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-3 py-2 text-xs text-muted">Volno</p>
      ) : (
        occurrences.map((occurrence) => (
          <OccurrenceCard
            key={occurrence.slot.id}
            occurrence={occurrence}
            lecture={lectureForOccurrence(occurrence, lectures)}
            running={isToday && occurrence.startMin <= nowMinutes && nowMinutes < occurrence.endMin}
            finished={isPast || (isToday && nowMinutes >= occurrence.endMin)}
            onOpenLecture={onOpenLecture}
            onOpenSubject={onOpenSubject}
            onEdit={() => onEditSlot(occurrence.slot)}
            compact={compact}
          />
        ))
      )}
    </section>
  );
}

function OccurrenceCard({
  occurrence,
  lecture,
  running,
  finished,
  onOpenLecture,
  onOpenSubject,
  onEdit,
  compact,
}: {
  occurrence: Occurrence;
  lecture: Lecture | null;
  running: boolean;
  finished: boolean;
  onOpenLecture: (id: Id) => void;
  onOpenSubject: (id: Id) => void;
  onEdit: () => void;
  compact: boolean;
}) {
  const { slot, subject, cancelled } = occurrence;
  const colors = SUBJECT_COLOR_CLASSES[subject.color];
  const open = (): void => (lecture !== null ? onOpenLecture(lecture.id) : onOpenSubject(subject.id));

  return (
    <div
      className={cx(
        'relative flex overflow-hidden rounded-xl bg-surface ring-1',
        running ? 'ring-2 ring-accent' : 'ring-line',
        cancelled && 'opacity-60',
      )}
    >
      <div className={cx('w-1 shrink-0', colors.bar)} aria-hidden />
      <button type="button" onClick={open} className="min-w-0 flex-1 px-2.5 py-2 text-left">
        <div className="flex items-center gap-1.5 text-xs text-muted tabular-nums">
          <span className={cx(cancelled && 'line-through')}>
            {formatTime(slot.start)}–{formatTime(slot.end)}
          </span>
          {running && <span className="font-semibold text-accent">probíhá</span>}
          {cancelled && <span className="font-medium text-danger">odpadá</span>}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
          <span
            className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-surface-2 text-[11px] font-bold"
            title={SLOT_KIND_LABELS[slot.kind]}
          >
            {SLOT_KIND_SHORT[slot.kind]}
          </span>
          <span className="truncate text-sm font-semibold">{subject.code || subject.name}</span>
        </div>
        {!compact && <p className="truncate text-xs text-muted">{subject.name}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {slot.room !== '' && (
            <span className="inline-flex items-center gap-0.5 font-medium text-ink">
              <MapPin size={11} aria-hidden />
              {slot.room}
            </span>
          )}
          {slot.parity !== 'every' && <span>{slot.parity === 'odd' ? 'liché' : 'sudé'}</span>}
          {weekRangeLabel(slot) !== null && <span>{weekRangeLabel(slot)}</span>}
          {!compact && slot.teacher !== null && <span className="truncate">{slot.teacher}</span>}
        </div>
        {lecture !== null && (finished || running) && (
          <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
            <StatusBadge status={lecture.status} className="h-6 px-2 text-[11px]" />
            {!compact && <span className="truncate text-xs text-muted">{lectureDisplayTitle(lecture)}</span>}
          </div>
        )}
      </button>
      <IconButton label="Upravit hodinu" onClick={onEdit} className="size-9 self-start">
        <Pencil size={14} />
      </IconButton>
    </div>
  );
}

function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <p className="max-w-md text-sm text-muted">{text}</p>
      {action}
    </div>
  );
}
