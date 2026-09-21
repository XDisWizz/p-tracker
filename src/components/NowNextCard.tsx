import { useMemo } from 'react';
import { CalendarClock, ChevronRight, MapPin, NotebookPen } from 'lucide-react';
import { addDays, formatCsShort, todayIso } from '../domain/date';
import {
  SLOT_KIND_LABELS,
  formatDuration,
  formatTime,
  isTrackedSlot,
  justFinished,
  latestNotesBefore,
  lectureForOccurrence,
  minutesOfDay,
  nowAndNext,
  previousLecture,
  type Occurrence,
} from '../domain/schedule';
import { lectureDisplayTitle } from '../domain/defaults';
import type { Id, Lecture } from '../domain/types';
import { useAllLectures } from '../hooks/useLiveData';
import { useNow } from '../hooks/useNow';
import { useScheduleContext } from '../hooks/useSchedule';
import { SUBJECT_COLOR_CLASSES, cx } from './tokens';

interface NowNextCardProps {
  onOpenLecture: (id: Id) => void;
  onOpenSchedule: () => void;
}

/**
 * Orientace mezi hodinami: co teď probíhá, kam jít potom a co se tam minule
 * probíralo. Bez zadaného rozvrhu nabídne jeho nastavení.
 */
export function NowNextCard({ onOpenLecture, onOpenSchedule }: NowNextCardProps) {
  const context = useScheduleContext();
  const lectures = useAllLectures();
  const now = useNow();
  const today = todayIso(now);
  const minutes = minutesOfDay(now);

  const state = useMemo(
    () => (context === undefined ? null : nowAndNext(today, minutes, context)),
    [context, today, minutes],
  );
  const finished = useMemo(
    () => (context === undefined ? null : justFinished(today, minutes, context)),
    [context, today, minutes],
  );

  if (context === undefined || lectures === undefined || state === null) return null;

  if (context.slots.length === 0) {
    return (
      <button
        type="button"
        onClick={onOpenSchedule}
        className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-3 text-left text-sm text-muted hover:bg-surface-2"
      >
        <CalendarClock size={20} className="shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          Naklikej si rozvrh — pak tu uvidíš, kam jít na další hodinu a co se tam minule probíralo.
        </span>
        <ChevronRight size={18} className="shrink-0" aria-hidden />
      </button>
    );
  }

  // Po skončené přednášce, dokud je čerstvá v hlavě: nabídnout rovnou zápis.
  // Jen u sledované hodiny — u cvičení téhož dne by se jinak otevřela přednáška a mátlo by to.
  const finishedLecture =
    finished === null || !isTrackedSlot(finished.slot, context.slots)
      ? null
      : lectureForOccurrence(finished, lectures);
  const promptNotes =
    finished !== null &&
    finishedLecture !== null &&
    finishedLecture.summary.trim() === '' &&
    finishedLecture.focus.trim() === '';

  if (state.current === null && state.next === null && !promptNotes) return null;

  return (
    <div className="flex flex-col gap-2">
      {promptNotes && finished !== null && finishedLecture !== null && (
        <button
          type="button"
          onClick={() => onOpenLecture(finishedLecture.id)}
          className="flex w-full items-center gap-3 rounded-2xl bg-accent-soft px-3 py-2.5 text-left ring-1 ring-accent/40 hover:ring-accent"
        >
          <NotebookPen size={20} className="shrink-0 text-accent" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              Právě skončilo: {finished.subject.code} {SLOT_KIND_LABELS[finished.slot.kind].toLowerCase()}
            </span>
            <span className="block text-xs text-muted">
              Zapiš, co se probíralo, dokud si to pamatuješ — ukáže se ti to příště.
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
        </button>
      )}
      {state.current !== null && (
        <OccurrenceTile
          label="Teď"
          occurrence={state.current}
          detail={`do ${formatTime(state.current.slot.end)} · ještě ${formatDuration(state.current.endMin - minutes)}`}
          lectures={lectures}
          onOpenLecture={onOpenLecture}
          emphasized
        />
      )}
      {state.next !== null && (
        <OccurrenceTile
          label="Další"
          occurrence={state.next}
          detail={whenLabel(state.next, today, minutes)}
          lectures={lectures}
          onOpenLecture={onOpenLecture}
          emphasized={state.current === null}
        />
      )}
    </div>
  );
}

function whenLabel(occurrence: Occurrence, today: string, minutes: number): string {
  const time = `${formatTime(occurrence.slot.start)}–${formatTime(occurrence.slot.end)}`;
  if (occurrence.date === today) return `${time} · za ${formatDuration(occurrence.startMin - minutes)}`;
  if (occurrence.date === addDays(today, 1)) return `zítra ${time}`;
  return `${formatCsShort(occurrence.date)} ${time}`;
}

function OccurrenceTile({
  label,
  occurrence,
  detail,
  lectures,
  onOpenLecture,
  emphasized,
}: {
  label: string;
  occurrence: Occurrence;
  detail: string;
  lectures: readonly Lecture[];
  onOpenLecture: (id: Id) => void;
  emphasized: boolean;
}) {
  const colors = SUBJECT_COLOR_CLASSES[occurrence.subject.color];
  const lecture = lectureForOccurrence(occurrence, lectures);
  // Rekapitulace: u přednášky ta předchozí se zápisem, u cvičení poslední zápis předmětu.
  const recap =
    lecture !== null ? previousLecture(lecture, lectures) : latestNotesBefore(occurrence.subject.id, occurrence.date, lectures);
  const recapHasNotes = recap !== null && (recap.summary.trim() !== '' || recap.focus.trim() !== '');

  const body = (
    <>
      <div className="flex items-center gap-2">
        <span
          className={cx(
            'rounded-md px-1.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
            emphasized ? 'bg-accent text-white' : 'bg-surface-2 text-muted',
          )}
        >
          {label}
        </span>
        <span className={cx('rounded px-1.5 py-0.5 text-xs font-semibold', colors.soft)}>{occurrence.subject.code}</span>
        <span className="min-w-0 truncate text-sm font-medium">
          {SLOT_KIND_LABELS[occurrence.slot.kind]}
          {lecture !== null && ` · ${lectureDisplayTitle(lecture)}`}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
        <span className="tabular-nums">{detail}</span>
        {occurrence.slot.room !== '' && (
          <span className="inline-flex items-center gap-1 font-medium text-ink">
            <MapPin size={12} aria-hidden />
            {occurrence.slot.room}
          </span>
        )}
        {occurrence.slot.note !== '' && <span>{occurrence.slot.note}</span>}
      </div>

      {recapHasNotes && recap !== null && (
        <div className="mt-2 rounded-lg bg-surface-2 px-2.5 py-2 text-xs">
          <p className="font-medium text-muted">Minule ({lectureDisplayTitle(recap)}):</p>
          {recap.summary.trim() !== '' && <p className="mt-0.5 line-clamp-2 whitespace-pre-line">{recap.summary}</p>}
          {recap.focus.trim() !== '' && (
            <p className="mt-1 line-clamp-2 whitespace-pre-line">
              <span className="font-medium">Zaměřit se: </span>
              {recap.focus}
            </p>
          )}
        </div>
      )}
    </>
  );

  const className = cx(
    'block w-full rounded-2xl px-3 py-2.5 text-left ring-1',
    emphasized ? 'bg-surface ring-accent/50' : 'bg-surface ring-line',
  );

  if (lecture === null) return <div className={className}>{body}</div>;
  return (
    <button type="button" className={cx(className, 'hover:ring-accent')} onClick={() => onOpenLecture(lecture.id)}>
      {body}
    </button>
  );
}
