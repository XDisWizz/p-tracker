import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Plus, SearchX } from 'lucide-react';
import {
  browseLectures,
  collectTags,
  groupByDue,
  isFilterActive,
  EMPTY_FILTER,
  type LectureFilter,
} from '../domain/filter';
import { addDays, relativeDays, todayIso } from '../domain/date';
import { isPending } from '../domain/status';
import { plural } from '../domain/plural';
import type { Id, Lecture, Subject } from '../domain/types';
import { useAllLectures, useSubjects } from '../hooks/useLiveData';
import { useLectureActions } from '../hooks/useLectureActions';
import { useListKeyboard } from '../hooks/useListKeyboard';
import { BackupReminder } from '../components/BackupReminder';
import { NowNextCard } from '../components/NowNextCard';
import { FilterBar } from '../components/FilterBar';
import { LectureRow } from '../components/LectureRow';
import { Button } from '../components/ui/Button';
import { SUBJECT_COLOR_CLASSES } from '../components/tokens';

interface UpNextPanelProps {
  filter: LectureFilter;
  onFilterChange: (filter: LectureFilter) => void;
  onOpenSubject: (id: Id) => void;
  onOpenLecture: (id: Id) => void;
  onOpenSchedule: () => void;
  onNewLecture: () => void;
  onGoToSubjects: () => void;
  /** Požadavek zaměřit hledání (klávesa „/“). Panel ho po splnění potvrdí. */
  focusSearch: boolean;
  onSearchFocused: () => void;
  /** Reagovat na j/k/Enter/1–5? Jen když je obrazovka vidět a není otevřený jiný dialog. */
  keyboardActive: boolean;
}

/**
 * Obrazovka, která se otevírá nejčastěji. Bez filtru odpovídá na otázku
 * „co mám dohnat“, s filtrem slouží jako hledání přes všechny přednášky.
 */
export function UpNextPanel({
  filter,
  onFilterChange,
  onOpenSubject,
  onOpenLecture,
  onOpenSchedule,
  onNewLecture,
  onGoToSubjects,
  focusSearch,
  onSearchFocused,
  keyboardActive,
}: UpNextPanelProps) {
  const subjects = useSubjects();
  const lectures = useAllLectures();
  const actions = useLectureActions();
  const searchRef = useRef<HTMLInputElement>(null);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);

  useEffect(() => {
    if (!focusSearch) return;
    searchRef.current?.focus();
    onSearchFocused();
  }, [focusSearch, onSearchFocused]);

  const subjectById = useMemo(
    () => new Map((subjects ?? []).map((s) => [s.id, s])),
    [subjects],
  );

  const items = useMemo(
    () => browseLectures(lectures ?? [], subjects ?? [], filter),
    [lectures, subjects, filter],
  );

  const today = todayIso();
  const keyboardOrder = useMemo(() => {
    if (filter.statuses.length > 0) return items;
    const groups = groupByDue(items, today);
    const weekAhead = addDays(today, 7);
    const upcoming = showAllUpcoming
      ? groups.upcoming
      : groups.upcoming.filter((l) => l.date !== null && l.date <= weekAhead);
    return [...groups.due, ...upcoming, ...groups.undated];
  }, [items, filter.statuses.length, today, showAllUpcoming]);

  const selectedId = useListKeyboard({
    lectures: keyboardOrder,
    active: keyboardActive,
    onOpen: (lecture) => onOpenLecture(lecture.id),
    onSetStatus: (lecture, status) => {
      const code = subjectById.get(lecture.subjectId)?.code ?? '';
      void actions.setStatus(lecture, status, { announce: true, context: code });
    },
  });

  const tags = useMemo(() => {
    const visible = new Set((subjects ?? []).map((s) => s.id));
    return collectTags((lectures ?? []).filter((l) => visible.has(l.subjectId)));
  }, [lectures, subjects]);

  if (subjects === undefined || lectures === undefined) return null;

  const filtering = isFilterActive(filter);
  const byStatusChoice = filter.statuses.length > 0;

  function renderRow(lecture: Lecture) {
    const subject: Subject | undefined = subjectById.get(lecture.subjectId);
    const code = subject?.code || subject?.name || '?';
    return (
      <LectureRow
        key={lecture.id}
        lecture={lecture}
        subjectLabel={
          subject === undefined
            ? undefined
            : { code, color: SUBJECT_COLOR_CLASSES[subject.color].soft }
        }
        dateHint={lecture.date === null ? undefined : relativeDays(lecture.date, today)}
        onOpenSubject={() => onOpenSubject(lecture.subjectId)}
        onOpen={() => onOpenLecture(lecture.id)}
        onEdit={() => actions.edit(lecture)}
        isToday={lecture.date === today}
        selected={lecture.id === selectedId}
        upcoming={lecture.date !== null && lecture.date > today}
        onDelete={() => void actions.remove(lecture, code)}
        onSetStatus={(status) =>
          // Tady se hláška s „Zpět“ hodí i u odznaku: přednáška, která přestane
          // čekat, ze seznamu zmizí a znovu na ni tapnout nejde.
          void actions.setStatus(lecture, status, {
            announce: byStatusChoice ? !filter.statuses.includes(status) : !isPending(status),
            context: code,
          })
        }
      />
    );
  }

  const groups = groupByDue(items, today);
  const oldestDue = groups.due[0];
  // Z rozvrhu vznikají přednášky na celý semestr dopředu — ukázat jen týden, zbytek na požádání.
  const weekAhead = addDays(today, 7);
  const soon = groups.upcoming.filter((l) => l.date !== null && l.date <= weekAhead);
  const visibleUpcoming = showAllUpcoming ? groups.upcoming : soon;
  const hiddenUpcoming = groups.upcoming.length - visibleUpcoming.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-3 border-b border-line px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{filtering ? 'Přednášky' : 'Co mě čeká'}</h2>
            <p className="text-xs text-muted" aria-live="polite">
              {summaryLine(items.length, groups.due.length, oldestDue, today, filtering)}
            </p>
          </div>
          {subjects.length > 0 && (
            <Button variant="primary" size="sm" onClick={onNewLecture}>
              <Plus size={16} />
              <span className="hidden sm:inline">Přednáška</span>
            </Button>
          )}
        </div>

        {!filtering && <NowNextCard onOpenLecture={onOpenLecture} onOpenSchedule={onOpenSchedule} />}

        <BackupReminder />

        {subjects.length > 0 && (
          <FilterBar
            filter={filter}
            onChange={onFilterChange}
            subjects={subjects}
            tags={tags}
            searchRef={searchRef}
          />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {subjects.length === 0 ? (
          <Empty
            icon={<Plus size={28} />}
            text="Zatím tu nic není. Začni přidáním předmětu."
            action={<Button variant="primary" onClick={onGoToSubjects}>Přidat předmět</Button>}
          />
        ) : items.length === 0 ? (
          filtering ? (
            <Empty
              icon={<SearchX size={28} />}
              text="Filtru nic neodpovídá."
              action={<Button onClick={() => onFilterChange(EMPTY_FILTER)}>Zrušit filtr a hledání</Button>}
            />
          ) : (
            <Empty
              icon={<CheckCircle2 size={28} />}
              text="Nic nečeká. Všechno máš aspoň ve stavu shrnutí."
            />
          )
        ) : byStatusChoice ? (
          // Při výběru stavu dělení na „proběhlé / nadcházející“ nedává smysl — jde o hledání.
          <ul className="flex flex-col gap-1.5">{items.map(renderRow)}</ul>
        ) : (
          <div className="flex flex-col gap-5">
            <Section title="K zpracování" count={groups.due.length}>
              {groups.due.map(renderRow)}
            </Section>
            <Section title={showAllUpcoming ? 'Nadcházející' : 'Příštích 7 dní'} count={visibleUpcoming.length}>
              {visibleUpcoming.map(renderRow)}
            </Section>
            {hiddenUpcoming > 0 && (
              <button
                type="button"
                onClick={() => setShowAllUpcoming(true)}
                className="-mt-3 inline-flex min-h-11 items-center self-start text-sm text-muted hover:text-ink"
              >
                Ukázat i dalších {hiddenUpcoming} naplánovaných
              </button>
            )}
            <Section title="Bez data" count={groups.undated.length}>
              {groups.undated.map(renderRow)}
            </Section>
          </div>
        )}
      </div>

      {actions.editor}
    </div>
  );
}

function summaryLine(
  total: number,
  dueCount: number,
  oldestDue: Lecture | undefined,
  today: string,
  filtering: boolean,
): string {
  if (filtering) return `${total} ${plural(total, 'výsledek', 'výsledky', 'výsledků')}`;
  if (total === 0) return 'Vše zpracováno';
  if (dueCount === 0) return 'Nic po termínu — všechno odpřednášené máš zpracované';
  const oldestDate = oldestDue?.date ?? null;
  const oldest = oldestDate === null ? '' : ` · nejstarší ${relativeDays(oldestDate, today)}`;
  return `${dueCount} ${plural(dueCount, 'přednáška čeká', 'přednášky čekají', 'přednášek čeká')}${oldest}`;
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
        {title}
        <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] tabular-nums">{count}</span>
      </h3>
      <ul className="flex flex-col gap-1.5">{children}</ul>
    </section>
  );
}

function Empty({
  icon,
  text,
  action,
}: {
  icon: ReactNode;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <span className="text-muted">{icon}</span>
      <p className="text-sm text-muted">{text}</p>
      {action}
    </div>
  );
}
