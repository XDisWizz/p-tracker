import { Suspense, lazy, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  GraduationCap,
  Inbox,
  Monitor,
  Moon,
  Settings,
  Sun,
} from 'lucide-react';
import { EMPTY_FILTER, browseLectures, groupByDue, type LectureFilter } from './domain/filter';
import { todayIso } from './domain/date';
import type { Id } from './domain/types';
import { useHashRoute, type Route } from './hooks/useHashRoute';
import { useTheme, type ThemeChoice } from './hooks/useTheme';
import { useHotkeys } from './hooks/useHotkeys';
import { useAllLectures, useSubjects } from './hooks/useLiveData';
import { useAutoPersist } from './hooks/useStorage';
import { useScheduleCatchUp } from './hooks/useScheduleCatchUp';
import { SubjectsPanel } from './screens/SubjectsPanel';
import { SubjectDetailPanel } from './screens/SubjectDetailPanel';
import { UpNextPanel } from './screens/UpNextPanel';

// Obrazovky, které nejsou potřeba hned po startu, se načtou až při prvním otevření.
// Hlavní obrazovka „Co mě čeká“ tak na telefonu naběhne rychleji; service worker
// si stejně uloží všechny části předem, takže offline to na nic nemá vliv.
const SettingsPanel = lazy(() => import('./screens/SettingsPanel').then((m) => ({ default: m.SettingsPanel })));
const SchedulePanel = lazy(() => import('./screens/SchedulePanel').then((m) => ({ default: m.SchedulePanel })));
const LectureDetailPanel = lazy(() =>
  import('./screens/LectureDetailPanel').then((m) => ({ default: m.LectureDetailPanel })),
);
const StatsPanel = lazy(() => import('./screens/StatsPanel').then((m) => ({ default: m.StatsPanel })));
const StudySheetPanel = lazy(() => import('./screens/StudySheetPanel').then((m) => ({ default: m.StudySheetPanel })));
import { NewLectureFlow } from './components/NewLectureFlow';
import { SyncIndicator } from './components/SyncIndicator';
import { DriveSyncProvider } from './hooks/useDriveSync';
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
      <DriveSyncProvider>
        <Shell />
      </DriveSyncProvider>
    </ToastProvider>
  );
}

type Section = 'upNext' | 'schedule' | 'subjects' | 'stats' | 'settings';

/** Do které záložky navigace obrazovka patří. */
function sectionOf(route: Route): Section {
  switch (route.name) {
    case 'upNext':
      return 'upNext';
    case 'schedule':
      return 'schedule';
    case 'subjects':
    case 'subject':
    case 'studySheet':
    case 'lecture':
      return 'subjects';
    case 'stats':
      return 'stats';
    case 'settings':
      return 'settings';
  }
}

function Shell() {
  const { route, go, replace, back } = useHashRoute();
  const theme = useTheme();
  const wide = useIsWide();
  const { dueCount, hasData } = useDueCount();
  useAutoPersist(hasData);
  useScheduleCatchUp();

  const [newLecture, setNewLecture] = useState<{ preferredSubjectId: Id | null } | null>(null);
  const [focusSearch, setFocusSearch] = useState(false);

  // Filtr si pamatujeme i po odchodu z obrazovky, aby návrat přes záložku nezahodil hledání.
  const [rememberedFilter, setRememberedFilter] = useState<LectureFilter>(() =>
    route.name === 'upNext' ? route.filter : EMPTY_FILTER,
  );
  const currentFilter = route.name === 'upNext' ? route.filter : rememberedFilter;

  const goUpNext = useCallback(() => go({ name: 'upNext', filter: currentFilter }), [go, currentFilter]);
  const goSubjects = useCallback(() => go({ name: 'subjects' }), [go]);
  const goSettings = useCallback(() => go({ name: 'settings' }), [go]);
  const goSchedule = useCallback(() => go({ name: 'schedule', week: null }), [go]);
  const goStats = useCallback(() => go({ name: 'stats' }), [go]);
  const openSubject = useCallback((id: Id) => go({ name: 'subject', id }), [go]);
  const openLecture = useCallback((id: Id) => go({ name: 'lecture', id }), [go]);
  const setFilter = useCallback(
    // `replace`, ne `go` — jinak by každé napsané písmeno bylo krokem v historii.
    (filter: LectureFilter) => {
      setRememberedFilter(filter);
      replace({ name: 'upNext', filter });
    },
    [replace],
  );
  const onSearchFocused = useCallback(() => setFocusSearch(false), []);

  const openNewLecture = useCallback((): void => {
    const ids = currentFilter.subjectIds;
    setNewLecture({ preferredSubjectId: ids.length === 1 ? (ids[0] ?? null) : null });
  }, [currentFilter]);

  // „g“ a písmeno: rychlý skok mezi obrazovkami, jako v Gmailu nebo na GitHubu.
  const [gPending, setGPending] = useState(false);
  useEffect(() => {
    if (!gPending) return undefined;
    const timer = window.setTimeout(() => setGPending(false), 1200);
    return () => window.clearTimeout(timer);
  }, [gPending]);

  const jump = (target: () => void) => () => {
    if (!gPending) return;
    setGPending(false);
    target();
  };

  // V detailu předmětu patří „n“ detailu (přidává rovnou do něj), jinde aplikaci.
  const detailOwnsN = route.name === 'subject';
  useHotkeys(
    {
      ...(detailOwnsN ? {} : { n: openNewLecture }),
      '/': () => {
        if (route.name !== 'upNext') goUpNext();
        setFocusSearch(true);
      },
      g: () => setGPending(true),
      ...(gPending
        ? { r: jump(goSchedule), c: jump(goUpNext), p: jump(goSubjects), s: jump(goStats), h: jump(goSettings) }
        : {}),
    },
    newLecture === null,
  );

  const upNext = (
    <UpNextPanel
      filter={currentFilter}
      onFilterChange={setFilter}
      onOpenSubject={openSubject}
      onOpenLecture={openLecture}
      onOpenSchedule={goSchedule}
      onNewLecture={openNewLecture}
      onGoToSubjects={goSubjects}
      focusSearch={focusSearch}
      onSearchFocused={onSearchFocused}
      keyboardActive={newLecture === null && route.name === 'upNext'}
    />
  );

  const subjectsList = (
    <SubjectsPanel selectedId={route.name === 'subject' ? route.id : null} onSelect={openSubject} />
  );

  let main: ReactNode;
  switch (route.name) {
    case 'subject':
      main = (
        <SubjectDetailPanel
          key={route.id}
          subjectId={route.id}
          onBack={() => back({ name: 'subjects' })}
          onOpenLecture={openLecture}
          onOpenStudySheet={() => go({ name: 'studySheet', id: route.id })}
          showBack={!wide}
          hotkeysActive={newLecture === null}
        />
      );
      break;
    case 'lecture':
      main = (
        <LectureDetailPanel
          lectureId={route.id}
          onBack={() => back({ name: 'upNext', filter: currentFilter })}
          onOpenLecture={(id) => replace({ name: 'lecture', id })}
          onOpenSubject={openSubject}
          showBack
        />
      );
      break;
    case 'schedule':
      main = (
        <SchedulePanel
          week={route.week}
          onWeekChange={(week) => replace({ name: 'schedule', week })}
          onOpenLecture={openLecture}
          onOpenSubject={openSubject}
          wide={wide}
        />
      );
      break;
    case 'stats':
      main = <StatsPanel onOpenSubject={openSubject} />;
      break;
    case 'studySheet':
      main = (
        <StudySheetPanel
          subjectId={route.id}
          onBack={() => back({ name: 'subject', id: route.id })}
          onOpenLecture={openLecture}
        />
      );
      break;
    case 'settings':
      main = <SettingsPanel themeChoice={theme.choice} onThemeChange={theme.setChoice} />;
      break;
    case 'subjects':
      main = wide ? upNext : subjectsList;
      break;
    case 'upNext':
      main = upNext;
      break;
  }

  // Rozvrh, statistiky a nastavení potřebují šířku; ostatní mají vlevo seznam předmětů.
  const fullWidth =
    route.name === 'schedule' || route.name === 'stats' || route.name === 'settings' || route.name === 'studySheet';
  const section = sectionOf(route);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2 print:hidden">
        <GraduationCap size={22} className="shrink-0 text-accent" aria-hidden />
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold">Přehled přednášek</h1>
        {wide && (
          <nav className="flex items-center gap-1" aria-label="Hlavní navigace">
            <HeaderTab active={section === 'upNext' || (section === 'subjects' && route.name === 'subjects')} onClick={goUpNext} badge={dueCount}>
              Co mě čeká
            </HeaderTab>
            <HeaderTab active={section === 'schedule'} onClick={goSchedule}>
              Rozvrh
            </HeaderTab>
            <HeaderTab active={section === 'stats'} onClick={goStats}>
              Statistiky
            </HeaderTab>
          </nav>
        )}
        <SyncIndicator onOpen={goSettings} />
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

      <main className="min-h-0 flex-1">
        {wide && !fullWidth ? (
          <div className="grid h-full grid-cols-[minmax(20rem,26rem)_1fr]">
            <div className="min-h-0 overflow-hidden border-r border-line">{subjectsList}</div>
            <div className="min-h-0 overflow-hidden">
              <Suspense fallback={<div className="h-full" aria-busy="true" />}>{main}</Suspense>
            </div>
          </div>
        ) : (
          <Suspense fallback={<div className="h-full" aria-busy="true" />}>{main}</Suspense>
        )}
      </main>

      {!wide && (
        <nav
          aria-label="Hlavní navigace"
          className="grid shrink-0 grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] print:hidden"
        >
          <BottomTab active={section === 'upNext'} onClick={goUpNext} icon={<Inbox size={21} />} badge={dueCount}>
            Čeká
          </BottomTab>
          <BottomTab active={section === 'schedule'} onClick={goSchedule} icon={<CalendarDays size={21} />}>
            Rozvrh
          </BottomTab>
          <BottomTab active={section === 'subjects'} onClick={goSubjects} icon={<BookOpen size={21} />}>
            Předměty
          </BottomTab>
          <BottomTab active={section === 'stats'} onClick={goStats} icon={<BarChart3 size={21} />}>
            Statistiky
          </BottomTab>
        </nav>
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
  badge = 0,
  children,
}: {
  active: boolean;
  onClick: () => void;
  badge?: number;
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
