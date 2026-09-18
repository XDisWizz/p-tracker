import { useMemo, useState, type ReactNode } from 'react';
import { Flame, Gauge, Hourglass, Inbox } from 'lucide-react';
import { formatCsDayMonth, todayIso } from '../domain/date';
import { computeProgress } from '../domain/progress';
import {
  activeWeeks,
  computePace,
  medianLagDays,
  weekStreak,
  weeklyActivity,
  type Outlook,
  type WeekBucket,
} from '../domain/stats';
import { countOf, plural } from '../domain/plural';
import type { Id, Lecture, Subject } from '../domain/types';
import { useAllLectures, useSubjects } from '../hooks/useLiveData';
import { ProgressBar } from '../components/ProgressBar';
import { SUBJECT_COLOR_CLASSES, cx } from '../components/tokens';

interface StatsPanelProps {
  onOpenSubject: (id: Id) => void;
}

const MAX_WEEKS = 12;

/**
 * Tempo a postup. Odpovídá na tři otázky: kolik mi toho visí, jestli doháním,
 * nebo mi to utíká, a ve kterém předmětu je problém.
 */
export function StatsPanel({ onOpenSubject }: StatsPanelProps) {
  const subjects = useSubjects();
  const lectures = useAllLectures();
  const today = todayIso();

  const data = useMemo(() => {
    if (subjects === undefined || lectures === undefined) return null;
    const visible = new Set(subjects.map((s) => s.id));
    const live = lectures.filter((l) => visible.has(l.subjectId));
    // Graf od začátku semestru (nejvýš 12 týdnů), ale aspoň 4 sloupce, ať není prázdný.
    const buckets = weeklyActivity(live, today, activeWeeks(live, today, MAX_WEEKS, 4));
    return {
      live,
      buckets,
      pace: computePace(live, today),
      lag: medianLagDays(live),
      streak: weekStreak(buckets),
      overall: computeProgress(live, today),
    };
  }, [subjects, lectures, today]);

  if (data === null || subjects === undefined) return null;

  if (data.live.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted">
        Statistiky se objeví, až budeš mít přednášky a začneš je zpracovávat.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-4">
        <div>
          <h2 className="text-lg font-semibold">Statistiky</h2>
          <p className="text-xs text-muted">
            {data.overall.done} z {data.overall.total} odpřednášených přednášek zpracováno · {data.overall.percent} %
          </p>
        </div>

        <OutlookBanner outlook={data.pace.outlook} backlog={data.pace.backlog} />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile icon={<Inbox size={16} />} label="Čeká na zpracování" value={String(data.pace.backlog)} />
          <Tile
            icon={<Gauge size={16} />}
            label="Tempo zpracování"
            value={formatRate(data.pace.processedPerWeek)}
            sub={`přibývá ${formatRate(data.pace.heldPerWeek)}`}
          />
          <Tile
            icon={<Hourglass size={16} />}
            label="Zpracuji obvykle"
            value={data.lag === null ? '—' : data.lag === 0 ? 'týž den' : `za ${formatDays(data.lag)}`}
            sub="od přednášky (medián)"
          />
          <Tile
            icon={<Flame size={16} />}
            label="Týdnů v řadě"
            value={String(data.streak)}
            sub={data.streak > 0 ? 'se zpracovanou přednáškou' : 'začni tento týden'}
          />
        </div>

        <WeeklyChart buckets={data.buckets} />

        <SubjectTable subjects={subjects} lectures={data.live} today={today} onOpenSubject={onOpenSubject} />
      </div>
    </div>
  );
}

function formatRate(perWeek: number): string {
  return `${String(perWeek).replace('.', ',')} / týden`;
}

function formatDays(days: number): string {
  const rounded = Math.round(days);
  return countOf(rounded, 'den', 'dny', 'dní');
}

function OutlookBanner({ outlook, backlog }: { outlook: Outlook; backlog: number }) {
  const text: Record<Outlook['kind'], string> = {
    clear: 'Všechno odpřednášené máš zpracované. Takhle dál.',
    'catching-up':
      outlook.kind === 'catching-up'
        ? `Doháníš: tímhle tempem budeš mít ${countOf(backlog, 'čekající přednášku', 'čekající přednášky', 'čekajících přednášek')} hotové za ${countOf(outlook.weeks, 'týden', 'týdny', 'týdnů')}.`
        : '',
    'falling-behind':
      outlook.kind === 'falling-behind'
        ? `Dluh roste: přibývá o ${String(outlook.perWeek).replace('.', ',')} ${
            Number.isInteger(outlook.perWeek) ? plural(outlook.perWeek, 'přednášku', 'přednášky', 'přednášek') : 'přednášky'
          } týdně víc, než stíháš zpracovat.`
        : '',
    unknown: `Čeká ${countOf(backlog, 'přednáška', 'přednášky', 'přednášek')}. Tempo zatím nejde odhadnout — zpracuj pár přednášek.`,
  };
  const tone =
    outlook.kind === 'clear' || outlook.kind === 'catching-up'
      ? 'bg-emerald-100 text-emerald-950 dark:bg-emerald-950/60 dark:text-emerald-100'
      : outlook.kind === 'falling-behind'
        ? 'bg-amber-100 text-amber-950 dark:bg-amber-950/60 dark:text-amber-100'
        : 'bg-surface-2 text-ink';
  return <p className={cx('rounded-xl px-3 py-2.5 text-sm', tone)}>{text[outlook.kind]}</p>;
}

function Tile({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-surface p-3 ring-1 ring-line">
      <p className="flex items-center gap-1.5 text-xs text-muted">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {sub !== undefined && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

/**
 * Zpracované přednášky po týdnech. Jedna řada, proto bez legendy — co graf
 * ukazuje, říká nadpis. Počet odpřednášených je v popisku každého sloupce.
 */
function WeeklyChart({ buckets }: { buckets: readonly WeekBucket[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.processed, b.held)));
  const active = hover === null ? null : buckets[hover];

  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Zpracováno za týden</h3>
        <p className="text-xs text-muted tabular-nums" aria-live="polite">
          {active === null || active === undefined
            ? `posledních ${buckets.length} týdnů`
            : `od ${formatCsDayMonth(active.weekStart)}: ${active.processed} zpracováno · ${active.held} odpřednášeno`}
        </p>
      </div>

      <div className="relative h-36">
        {/* Vodítko: nenápadná čára na polovině a základna. */}
        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-line" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 border-t border-line" aria-hidden />
        <div className="absolute inset-0 flex items-end gap-1">
          {buckets.map((bucket, index) => {
            const height = (bucket.processed / max) * 100;
            const heldHeight = (bucket.held / max) * 100;
            return (
              <button
                key={bucket.weekStart}
                type="button"
                className="group relative flex h-full flex-1 items-end justify-center focus:outline-none"
                onMouseEnter={() => setHover(index)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(index)}
                onBlur={() => setHover(null)}
                aria-label={`Týden od ${formatCsDayMonth(bucket.weekStart)}: ${bucket.processed} zpracováno, ${bucket.held} odpřednášeno`}
              >
                {/* Značka odpřednášených: tenká vodorovná čárka — kolik by bylo potřeba stihnout. */}
                {bucket.held > 0 && (
                  <span
                    className="absolute inset-x-1 h-0.5 rounded-full bg-muted/60"
                    style={{ bottom: `${heldHeight}%` }}
                    aria-hidden
                  />
                )}
                <span
                  className={cx(
                    'w-full max-w-8 rounded-t-[4px] bg-accent transition-opacity',
                    hover !== null && hover !== index && 'opacity-50',
                  )}
                  style={{ height: `${height}%`, minHeight: bucket.processed > 0 ? 3 : 0 }}
                />
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-1.5 flex gap-1 text-[10px] whitespace-nowrap text-muted tabular-nums">
        {buckets.map((bucket, index) => {
          // Popisek jen u každého n-tého sloupce, ať se na telefonu nepřekrývají; poslední vždy.
          const step = Math.ceil(buckets.length / 5);
          const labeled = (buckets.length - 1 - index) % step === 0;
          return (
            <span key={bucket.weekStart} className="flex-1 text-center">
              {labeled ? formatCsDayMonth(bucket.weekStart) : ''}
            </span>
          );
        })}
      </div>
      <p className="mt-2 flex items-center gap-2 text-xs text-muted">
        <span className="inline-block h-0.5 w-4 rounded-full bg-muted/60" aria-hidden />
        počet odpřednášených — kolik by bylo potřeba stihnout, aby dluh nerostl
      </p>
    </section>
  );
}

function SubjectTable({
  subjects,
  lectures,
  today,
  onOpenSubject,
}: {
  subjects: readonly Subject[];
  lectures: readonly Lecture[];
  today: string;
  onOpenSubject: (id: Id) => void;
}) {
  const rows = subjects
    .map((subject) => {
      const own = lectures.filter((l) => l.subjectId === subject.id);
      return { subject, progress: computeProgress(own, today), lag: medianLagDays(own) };
    })
    .filter((r) => r.progress.total + r.progress.upcoming > 0)
    // Nejhorší nahoře: tam je potřeba začít.
    .toSorted((a, b) => b.progress.pending - a.progress.pending || a.progress.ratio - b.progress.ratio);

  if (rows.length === 0) return null;

  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h3 className="mb-3 text-sm font-semibold">Podle předmětů</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-2 font-medium">Předmět</th>
              <th className="pb-2 font-medium">Postup</th>
              <th className="pb-2 text-right font-medium">Čeká</th>
              <th className="pb-2 text-right font-medium">Zpoždění</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ subject, progress, lag }) => (
              <tr key={subject.id} className="border-t border-line">
                <td className="py-2 pr-3">
                  <button
                    type="button"
                    onClick={() => onOpenSubject(subject.id)}
                    className={cx('rounded px-1.5 py-0.5 text-xs font-semibold', SUBJECT_COLOR_CLASSES[subject.color].soft)}
                  >
                    {subject.code || subject.name}
                  </button>
                </td>
                <td className="w-1/2 py-2 pr-3">
                  <ProgressBar progress={progress} />
                  <span className="text-xs text-muted tabular-nums">
                    {progress.done}/{progress.total} · {progress.percent} %
                  </span>
                </td>
                <td
                  className={cx(
                    'py-2 text-right tabular-nums',
                    progress.pending > 0 ? 'font-semibold' : 'text-muted',
                  )}
                >
                  {progress.pending}
                </td>
                <td className="py-2 text-right text-muted tabular-nums">{lag === null ? '—' : formatDays(lag)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
