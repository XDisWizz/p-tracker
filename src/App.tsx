import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BookOpen, GraduationCap, Inbox, Monitor, Moon, Settings, Sun } from 'lucide-react';
import { EMPTY_FILTER, browseLectures, groupByDue, type LectureFilter } from './domain/filter';
import { todayIso } from './domain/date';
import type { Id } from './domain/types';
import { useHashRoute, type Route } from './hooks/useHashRoute';
import { useTheme, type ThemeChoice } from './hooks/useTheme';
import { useHotkeys } from './hooks/useHotkeys';
import { useAllLectures, useSubjects } from './hooks/useLiveData';
import { useAutoPersist } from './hooks/useStorage';
import { SubjectsPanel } from './screens/SubjectsPanel';
import { SubjectDetailPanel } from './screens/SubjectDetailPanel';
import { UpNextPanel } from './screens/UpNextPanel';
import { SettingsPanel } from './screens/SettingsPanel';
import { NewLectureFlow } from './components/NewLectureFlow';
import { UpdatePrompt } from './components/UpdatePrompt';
import { IconButton } from './components/ui/Button';
import { ToastProvider } from './components/ui/Toast';
import { cx } from './components/tokens';

/** Šířka, od které se vejdou dva sloupce vedle sebe. Odpovídá Tailwind `lg`. */
const TWO_COLUMN_QUERY = '(min-width: 1024px)';

function useIsWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(TWO_COLUMN_QUERY).matches);

  useEffect(() => {
    const media = window.matchMedia(TWO_COLUMN_QUERY);
    const onChange = (event: MediaQueryListEvent): void => setWide(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return wide;
}

/** Počet přednášek po termínu — číslo na záložce „Co mě čeká“. */
function useDueCount(): { dueCount: number; hasData: boolean } {
  const subjects = useSubjects(true);
  const lectures = useAllLectures();
  const dueCount = useMemo(() => {
    const pending = browseLectures(lectures ?? [], subjects ?? [], EMPTY_FILTER);
    return groupByDue(pending, todayIso()).due.length;
  }, [lectures, subjects]);
  return { dueCount, hasData: (subjects?.length ?? 0) > 0 };
}

export function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

function Shell() {
  const { route, go, replace, back } = useHashRoute();
  const theme = useTheme();
  const wide = useIsWide();
  const { dueCount, hasData } = useDueCount();
  useAutoPersist(hasData);

  const [newLecture, setNewLecture] = useState<{ preferredSubjectId: Id | null } | null>(null);
  const [focusSearch, setFocusSearch] = useState(false);

  // Filtr si pamatujeme i po odchodu z obrazovky, aby návrat přes záložku nezahodil hledání.
  const lastFilter = useRef<LectureFilter>(EMPTY_FILTER);
  if (route.name === 'upNext') lastFilter.current = route.filter;

  const goUpNext = useCallback(
    () => go({ name: 'upNext', filter: lastFilter.current }),
    [go],
  );
  const goSubjects = useCallback(() => go({ name: 'subjects' }), [go]);
  const goSettings = useCallback(() => go({ name: 'settings' }), [go]);
  const openSubject = useCallback((id: Id) => go({ name: 'subject', id }), [go]);
  const setFilter = useCallback(
    // `replace`, ne `go` — jinak by každé napsané písmeno bylo krokem v historii.
    (filter: LectureFilter) => replace({ name: 'upNext', filter }),
    [replace],
  );
  const onSearchFocused = useCallback(() => setFocusSearch(false), []);

  const openNewLecture = useCallback((): void => {
    const ids = lastFilter.current.subjectIds;
    setNewLecture({ preferredSubjectId: ids.length === 1 ? (ids[0] ?? null) : null });
  }, []);

  // V detailu předmětu patří „n“ detailu (přidává rovnou do něj), jinde aplikaci.
  const detailOwnsN = route.name === 'subject';
  useHotkeys(
    {
      ...(detailOwnsN ? {} : { n: openNewLecture }),
      '/': () => {
        if (route.name !== 'upNext') goUpNext();
        setFocusSearch(true);
      },
    },
    newLecture === null,
  );

  const upNext = (
    <UpNextPanel
      filter={route.name === 'upNext' ? route.filter : lastFilter.current}
      onFilterChange={setFilter}
      onOpenSubject={openSubject}
      onNewLecture={openNewLecture}
      onGoToSubjects={goSubjects}
      focusSearch={focusSearch}
      onSearchFocused={onSearchFocused}
    />
  );

  const detail = (id: Id) => (
    <SubjectDetailPanel
      key={id}
      subjectId={id}
      onBack={wide ? goUpNext : back}
      showBack={!wide}
      hotkeysActive={newLecture === null}
    />
  );

  const settings = <SettingsPanel themeChoice={theme.choice} onThemeChange={theme.setChoice} />;

  const subjectsList = (
    <SubjectsPanel selectedId={route.name === 'subject' ? route.id : null} onSelect={openSubject} />
  );

  let content: ReactNode;
  if (wide) {
    // Vlevo vždy předměty, vpravo detail nebo „Co mě čeká“ — pravý sloupec nikdy nezeje prázdnotou.
    content = (
      <div className="grid h-full grid-cols-[minmax(20rem,26rem)_1fr]">
        <div className="min-h-0 overflow-hidden border-r border-line">{subjectsList}</div>
        <div className="min-h-0 overflow-hidden">
          {route.name === 'subject' ? detail(route.id) : route.name === 'settings' ? settings : upNext}
        </div>
      </div>
    );
  } else if (route.name === 'subject') {
    content = detail(route.id);
  } else if (route.name === 'subjects') {
    content = subjectsList;
  } else if (route.name === 'settings') {
    content = settings;
  } else {
    content = upNext;
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <GraduationCap size={22} className="shrink-0 text-accent" aria-hidden />
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold">Přehled přednášek</h1>
        {wide && (
          <nav className="flex items-center gap-1" aria-label="Hlavní navigace">
            <HeaderTab active={route.name === 'upNext' || route.name === 'subjects'} onClick={goUpNext} badge={dueCount}>
              Co mě čeká
            </HeaderTab>
          </nav>
        )}
        <ThemeToggle choice={theme.choice} resolved={theme.resolved} onCycle={theme.cycle} />
        <IconButton
          label="Nastavení a záloha"
          onClick={goSettings}
          aria-current={route.name === 'settings' ? 'page' : undefined}
          className={route.name === 'settings' ? 'bg-accent-soft text-accent' : undefined}
        >
          <Settings size={19} />
        </IconButton>
      </header>

      <UpdatePrompt />

      <main className="min-h-0 flex-1">{content}</main>

      {!wide && (
        <BottomNav
          route={route}
          dueCount={dueCount}
          onUpNext={goUpNext}
          onSubjects={goSubjects}
        />
      )}

      {newLecture !== null && (
        <NewLectureFlow
          preferredSubjectId={newLecture.preferredSubjectId}
          onClose={() => setNewLecture(null)}
          onGoToSubjects={goSubjects}
        />
      )}
    </div>
  );
}

function BottomNav({
  route,
  dueCount,
  onUpNext,
  onSubjects,
}: {
  route: Route;
  dueCount: number;
  onUpNext: () => void;
  onSubjects: () => void;
}) {
  return (
    <nav
      aria-label="Hlavní navigace"
      className="grid shrink-0 grid-cols-2 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <BottomTab active={route.name === 'upNext'} onClick={onUpNext} icon={<Inbox size={21} />} badge={dueCount}>
        Co mě čeká
      </BottomTab>
      <BottomTab
        active={route.name === 'subjects' || route.name === 'subject'}
        onClick={onSubjects}
        icon={<BookOpen size={21} />}
      >
        Předměty
      </BottomTab>
    </nav>
  );
}

function BottomTab({
  active,
  onClick,
  icon,
  badge = 0,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  badge?: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'relative flex h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium',
        active ? 'text-accent' : 'text-muted',
      )}
    >
      <span className="relative">
        {icon}
        {badge > 0 && <Badge className="absolute -top-1.5 -right-3">{badge}</Badge>}
      </span>
      {children}
    </button>
  );
}

function HeaderTab({
  active,
  onClick,
  badge,
  children,
}: {
  active: boolean;
  onClick: () => void;
  badge: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'inline-flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium',
        active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-ink',
      )}
    >
      {children}
      {badge > 0 && <Badge>{badge}</Badge>}
    </button>
  );
}

function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] leading-5 font-semibold text-white tabular-nums',
        className,
      )}
    >
      {children}
    </span>
  );
}

const THEME_LABELS: Record<ThemeChoice, string> = {
  system: 'Podle systému',
  light: 'Světlý režim',
  dark: 'Tmavý režim',
};

function ThemeToggle({
  choice,
  resolved,
  onCycle,
}: {
  choice: ThemeChoice;
  resolved: 'light' | 'dark';
  onCycle: () => void;
}) {
  const Icon = choice === 'system' ? Monitor : resolved === 'dark' ? Moon : Sun;
  return (
    <IconButton label={`Motiv: ${THEME_LABELS[choice]}. Přepnout.`} onClick={onCycle}>
      <Icon size={19} />
    </IconButton>
  );
}
