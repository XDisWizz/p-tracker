import { useMemo, useState } from 'react';
import { ArrowLeft, CalendarPlus, ChevronDown, ExternalLink, MapPin, Plus, RefreshCw } from 'lucide-react';
import { computeProgress } from '../domain/progress';
import { todayIso } from '../domain/date';
import { nextLectureInput } from '../domain/defaults';
import { PARITY_LABELS, SLOT_KIND_LABELS, dayShort, formatTime, timeToMinutes } from '../domain/schedule';
import { countOf } from '../domain/plural';
import type { Id, LectureInput } from '../domain/types';
import { lectures as lecturesRepo, useSubject, useSubjectLectures, useSubjectSlots } from '../hooks/useLiveData';
import { useHotkeys } from '../hooks/useHotkeys';
import { useLectureActions } from '../hooks/useLectureActions';
import { useListKeyboard } from '../hooks/useListKeyboard';
import { useLectureSync, useSlotEditor } from '../hooks/useSchedule';
import { LectureRow } from '../components/LectureRow';
import { LectureForm } from '../components/LectureForm';
import { ProgressBar } from '../components/ProgressBar';
import { Button, IconButton } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { SUBJECT_COLOR_CLASSES, cx } from '../components/tokens';

interface SubjectDetailPanelProps {
  subjectId: Id | null;
  onBack: () => void;
  onOpenLecture: (id: Id) => void;
  /** Ve dvousloupcovém rozvržení se tlačítko zpět nezobrazuje. */
  showBack: boolean;
  hotkeysActive: boolean;
}

export function SubjectDetailPanel({
  subjectId,
  onBack,
  onOpenLecture,
  showBack,
  hotkeysActive,
}: SubjectDetailPanelProps) {
  const [creating, setCreating] = useState<LectureInput | null>(null);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const toast = useToast();
  const actions = useLectureActions();
  const slotEditor = useSlotEditor({ lockedSubjectId: subjectId ?? undefined });
  const sync = useLectureSync();

  const subject = useSubject(subjectId);
  const lectures = useSubjectLectures(subjectId);
  const slots = useSubjectSlots(subjectId);
  const today = todayIso();

  const sortedSlots = useMemo(
    () =>
      [...(slots ?? [])].toSorted(
        (a, b) => a.dayOfWeek - b.dayOfWeek || timeToMinutes(a.start) - timeToMinutes(b.start),
      ),
    [slots],
  );

  function openNew(): void {
    if (subject === undefined || subject === null) return;
    setCreating(nextLectureInput(subject, lectures ?? []));
  }

  useHotkeys({ n: openNew }, hotkeysActive);

  const keyboardLectures = useMemo(() => {
    const list = lectures ?? [];
    const past = list.filter((l) => l.date === null || l.date <= today);
    const future = list.filter((l) => l.date !== null && l.date > today);
    return [...past, ...(showAllUpcoming ? future : future.slice(0, 2))];
  }, [lectures, today, showAllUpcoming]);

  const selectedId = useListKeyboard({
    lectures: keyboardLectures,
    active: hotkeysActive,
    onOpen: (lecture) => onOpenLecture(lecture.id),
    onSetStatus: (lecture, status) => void actions.setStatus(lecture, status, { announce: true }),
  });

  if (subjectId === null) return null;
  if (subject === undefined) return null;
  if (subject === null) return <NotFound onBack={onBack} />;

  const all = lectures ?? [];
  const progress = computeProgress(all, today);
  const colors = SUBJECT_COLOR_CLASSES[subject.color];
  const hasLectureSlots = sortedSlots.some((s) => s.kind === 'lecture');

  // Budoucí přednášky z rozvrhu: ukázat nejbližší dvě, zbytek schovat, ať seznam nezavalí semestr dopředu.
  const past = all.filter((l) => l.date === null || l.date <= today);
  const future = all.filter((l) => l.date !== null && l.date > today);
  const visibleFuture = showAllUpcoming ? future : future.slice(0, 2);

  /** Rychlé přidání jedním tapnutím — vše se odvodí z předchozí přednášky. */
  async function addNextImmediately(id: Id): Promise<void> {
    const created = await lecturesRepo.createNext(id);
    toast(`Přidána ${created.number}. přednáška`, {
      label: 'Zpět',
      run: () => lecturesRepo.softDelete(created.id),
    });
  }

  const renderRow = (lecture: (typeof all)[number]) => (
    <LectureRow
      key={lecture.id}
      lecture={lecture}
      upcoming={lecture.date !== null && lecture.date > today}
      isToday={lecture.date === today}
      selected={lecture.id === selectedId}
      onSetStatus={(status, source) =>
        // Posun odznakem se vrací dalším tapnutím; skok z nabídky si zaslouží „Zpět“.
        void actions.setStatus(lecture, status, { announce: source === 'menu' })
      }
      onOpen={() => onOpenLecture(lecture.id)}
      onEdit={() => actions.edit(lecture)}
      onDelete={() => void actions.remove(lecture)}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-line px-4 pt-4 pb-3">
        <div className="flex items-start gap-2">
          {showBack && (
            <IconButton label="Zpět" onClick={onBack} className="-ml-2">
              <ArrowLeft size={20} />
            </IconButton>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={cx('size-2.5 shrink-0 rounded-full', colors.dot)} aria-hidden />
              <h2 className="min-w-0 truncate text-lg font-semibold">{subject.name || subject.code}</h2>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {subject.code} · {subject.term}
              {subject.defaultLecturer !== null && ` · ${subject.defaultLecturer}`}
            </p>
          </div>

          {subject.lmsUrl !== null && subject.lmsUrl !== '' && (
            <a
              href={subject.lmsUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Otevřít v LMS"
              title="Otevřít v LMS"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink"
            >
              <ExternalLink size={18} />
            </a>
          )}
        </div>

        <ProgressBar progress={progress} className="mt-3" />
        <p className="mt-1.5 text-xs text-muted">
          {progress.done} z {progress.total} odpřednášených zpracováno · {progress.percent} %
          {progress.upcoming > 0 && <> · {progress.upcoming} ještě čeká v semestru</>}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={openNew}>
            <Plus size={16} />
            Přednáška
          </Button>
          {!hasLectureSlots && (
            <Button
              size="sm"
              onClick={() => void addNextImmediately(subject.id)}
              title="Přidá další přednášku rovnou, bez formuláře"
            >
              <CalendarPlus size={16} />
              Rychle přidat
            </Button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <section className="mb-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Rozvrh</h3>
            <div className="flex gap-1">
              {hasLectureSlots && (
                <Button
                  size="sm"
                  variant="ghost"
                  title="Doplní chybějící přednášky podle rozvrhu"
                  onClick={() => void sync(subject.id)}
                >
                  <RefreshCw size={14} />
                  Doplnit přednášky
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => slotEditor.openNew()}>
                <Plus size={14} />
                Hodina
              </Button>
            </div>
          </div>
          {sortedSlots.length === 0 ? (
            <button
              type="button"
              onClick={() => slotEditor.openNew()}
              className="w-full rounded-xl border border-dashed border-line px-3 py-2.5 text-left text-xs text-muted hover:bg-surface-2"
            >
              Přidej hodiny z rozvrhu — přednášky na celý semestr se pak vytvoří samy.
            </button>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {sortedSlots.map((slot) => (
                <li key={slot.id}>
                  <button
                    type="button"
                    onClick={() => slotEditor.openEdit(slot)}
                    className="flex min-h-11 items-center gap-2 rounded-xl bg-surface px-3 py-1.5 text-left text-xs ring-1 ring-line hover:ring-accent sm:min-h-9"
                  >
                    <span className="font-semibold">{SLOT_KIND_LABELS[slot.kind]}</span>
                    <span className="tabular-nums text-muted">
                      {dayShort(slot.dayOfWeek)} {formatTime(slot.start)}–{formatTime(slot.end)}
                    </span>
                    {slot.room !== '' && (
                      <span className="inline-flex items-center gap-0.5">
                        <MapPin size={11} aria-hidden />
                        {slot.room}
                      </span>
                    )}
                    {slot.parity !== 'every' && <span className="text-muted">{PARITY_LABELS[slot.parity]}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {lectures === undefined ? null : all.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">
            Zatím žádná přednáška. Přidej hodinu do rozvrhu, nebo první přednášku ručně — číslo i datum se předvyplní samy.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-1.5">{past.map(renderRow)}</ul>
            {future.length > 0 && (
              <>
                <h3 className="mt-4 mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
                  Nadcházející · {future.length}
                </h3>
                <ul className="flex flex-col gap-1.5">{visibleFuture.map(renderRow)}</ul>
                {future.length > visibleFuture.length && (
                  <button
                    type="button"
                    onClick={() => setShowAllUpcoming(true)}
                    className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-ink"
                  >
                    <ChevronDown size={16} />
                    Ukázat {countOf(future.length - visibleFuture.length, 'další', 'další', 'dalších')}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>

      {creating !== null && (
        <LectureForm
          key={`new-${creating.number}`}
          open
          title="Nová přednáška"
          submitLabel="Přidat"
          initial={creating}
          onSubmit={async (input) => {
            await lecturesRepo.create(input);
            setCreating(null);
          }}
          onClose={() => setCreating(null)}
        />
      )}
      {actions.editor}
      {slotEditor.editor}
    </div>
  );
}

function NotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm text-muted">Předmět neexistuje nebo byl smazán.</p>
      <Button onClick={onBack}>Zpět</Button>
    </div>
  );
}
