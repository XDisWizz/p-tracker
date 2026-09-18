import { useMemo, useState } from 'react';
import { ArrowLeft, Download, Printer, Target } from 'lucide-react';
import { formatCsDate, formatCsShort, todayIso } from '../domain/date';
import { lectureDisplayTitle } from '../domain/defaults';
import { missingNotes, sheetEntries, studySheetFilename, studySheetMarkdown } from '../domain/studySheet';
import { countOf } from '../domain/plural';
import type { Id } from '../domain/types';
import { useSubject, useSubjectLectures } from '../hooks/useLiveData';
import { downloadFile } from '../lib/files';
import { FormattedNotes } from '../components/FormattedNotes';
import { Button, IconButton } from '../components/ui/Button';
import { SUBJECT_COLOR_CLASSES, cx } from '../components/tokens';
import { ExamBadge } from '../components/ExamBadge';

interface StudySheetPanelProps {
  subjectId: Id;
  onBack: () => void;
  onOpenLecture: (id: Id) => void;
}

/**
 * Příprava na zkoušku: celý předmět na jedné stránce. Nahoře všechno, na co
 * se zaměřit, pod tím učivo po přednáškách. Jde vytisknout nebo stáhnout
 * jako Markdown.
 */
export function StudySheetPanel({ subjectId, onBack, onOpenLecture }: StudySheetPanelProps) {
  const subject = useSubject(subjectId);
  const lectures = useSubjectLectures(subjectId);
  const [focusOnly, setFocusOnly] = useState(false);
  const today = todayIso();

  const entries = useMemo(
    () => (subject === undefined || subject === null || lectures === undefined ? [] : sheetEntries(subject, lectures)),
    [subject, lectures],
  );

  if (subject === undefined || lectures === undefined) return null;
  if (subject === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-muted">Předmět neexistuje nebo byl smazán.</p>
        <Button onClick={onBack}>Zpět</Button>
      </div>
    );
  }

  const missing = missingNotes(subject, lectures, today);
  const focused = entries.filter((e) => e.focus !== '');
  const visible = focusOnly ? focused : entries;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-4">
        <div className="flex items-start gap-2 print:hidden">
          <IconButton label="Zpět" onClick={onBack} className="-ml-2">
            <ArrowLeft size={20} />
          </IconButton>
          <div className="min-w-0 flex-1" />
          <Button size="sm" variant="ghost" onClick={() => window.print()}>
            <Printer size={16} />
            Tisk
          </Button>
          <Button
            size="sm"
            onClick={() => downloadFile(studySheetFilename(subject), studySheetMarkdown(subject, lectures), 'text/markdown')}
          >
            <Download size={16} />
            Markdown
          </Button>
        </div>

        <header>
          <p className="flex items-center gap-2 text-xs text-muted">
            <span className={cx('rounded px-1.5 py-0.5 font-semibold', SUBJECT_COLOR_CLASSES[subject.color].soft)}>
              {subject.code}
            </span>
            {subject.term} · příprava na zkoušku
            {subject.examDate !== null && <ExamBadge examDate={subject.examDate} className="print:hidden" />}
          </p>
          {subject.examDate !== null && (
            <p className="hidden text-xs print:block">Zkouška {formatCsDate(subject.examDate)}</p>
          )}
          <h2 className="mt-1 text-xl font-semibold">{subject.name}</h2>
          <p className="mt-1 text-xs text-muted">
            {countOf(entries.length, 'přednáška se zápisem', 'přednášky se zápisem', 'přednášek se zápisem')}
            {missing.length > 0 && (
              <span className="text-amber-700 dark:text-amber-300">
                {' '}
                · {countOf(missing.length, 'proběhlá přednáška', 'proběhlé přednášky', 'proběhlých přednášek')} zatím bez zápisu
              </span>
            )}
          </p>
        </header>

        {entries.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">
            Zatím tu nic není. U přednášek vyplň „Co se probíralo“ a „Na co se zaměřit“ — tady se to poskládá do
            jednoho přehledu.
          </p>
        ) : (
          <>
            {focused.length > 0 && (
              <section className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900 print:bg-transparent">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Target size={16} aria-hidden />
                  Na co se zaměřit
                </h3>
                <div className="flex flex-col gap-3">
                  {focused.map((entry) => (
                    <div key={entry.lecture.id}>
                      <p className="text-xs font-medium text-muted">{lectureDisplayTitle(entry.lecture)}</p>
                      <FormattedNotes text={entry.focus} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="flex items-center justify-between gap-2 print:hidden">
              <h3 className="text-sm font-semibold">Učivo po přednáškách</h3>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-accent)]"
                  checked={focusOnly}
                  onChange={(e) => setFocusOnly(e.target.checked)}
                />
                Jen přednášky se zaměřením
              </label>
            </div>

            <ol className="flex flex-col gap-4">
              {visible.map((entry) => (
                <li key={entry.lecture.id} className="break-inside-avoid rounded-2xl bg-surface p-4 ring-1 ring-line">
                  <button
                    type="button"
                    onClick={() => onOpenLecture(entry.lecture.id)}
                    className="text-left hover:underline print:no-underline"
                  >
                    <span className="text-sm font-semibold">{lectureDisplayTitle(entry.lecture)}</span>
                    <span className="ml-2 text-xs text-muted">
                      {entry.lecture.number}. přednáška
                      {entry.lecture.date !== null && ` · ${formatCsShort(entry.lecture.date)}`}
                    </span>
                  </button>
                  {entry.summary !== '' && <FormattedNotes text={entry.summary} className="mt-2" />}
                  {entry.focus !== '' && (
                    <div className="mt-3 border-l-2 border-amber-400 pl-3">
                      <p className="text-xs font-semibold text-muted">Zaměřit se</p>
                      <FormattedNotes text={entry.focus} />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
