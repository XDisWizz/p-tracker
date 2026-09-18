import { useState } from 'react';
import { ArrowLeft, CalendarPlus, ExternalLink, Plus } from 'lucide-react';
import { computeProgress } from '../domain/progress';
import { todayIso } from '../domain/date';
import { nextLectureInput } from '../domain/defaults';
import type { Id, LectureInput } from '../domain/types';
import { lectures as lecturesRepo, useSubject, useSubjectLectures } from '../hooks/useLiveData';
import { useHotkeys } from '../hooks/useHotkeys';
import { useLectureActions } from '../hooks/useLectureActions';
import { LectureRow } from '../components/LectureRow';
import { LectureForm } from '../components/LectureForm';
import { ProgressBar } from '../components/ProgressBar';
import { Button, IconButton } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { SUBJECT_COLOR_CLASSES, cx } from '../components/tokens';

interface SubjectDetailPanelProps {
  subjectId: Id | null;
  onBack: () => void;
  /** Ve dvousloupcovém rozvržení se tlačítko zpět nezobrazuje. */
  showBack: boolean;
  hotkeysActive: boolean;
}

export function SubjectDetailPanel({
  subjectId,
  onBack,
  showBack,
  hotkeysActive,
}: SubjectDetailPanelProps) {
  const [creating, setCreating] = useState<LectureInput | null>(null);
  const toast = useToast();
  const actions = useLectureActions();

  const subject = useSubject(subjectId);
  const lectures = useSubjectLectures(subjectId);

  function openNew(): void {
    if (subject === undefined || subject === null) return;
    setCreating(nextLectureInput(subject, lectures ?? []));
  }

  useHotkeys({ n: openNew }, hotkeysActive);

  if (subjectId === null) return null;
  if (subject === undefined) return null;
  if (subject === null) return <NotFound onBack={onBack} />;

  const progress = computeProgress(lectures ?? [], todayIso());
  const colors = SUBJECT_COLOR_CLASSES[subject.color];

  /** Rychlé přidání jedním tapnutím — vše se odvodí z předchozí přednášky. */
  async function addNextImmediately(id: Id): Promise<void> {
    const created = await lecturesRepo.createNext(id);
    toast(`Přidána ${created.number}. přednáška`, {
      label: 'Zpět',
      run: () => lecturesRepo.softDelete(created.id),
    });
  }

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
          {progress.done} z {progress.total} zpracováno · {progress.percent} %
        </p>

        <div className="mt-3 flex gap-2">
          <Button variant="primary" size="sm" onClick={openNew}>
            <Plus size={16} />
            Přednáška
          </Button>
          <Button
            size="sm"
            onClick={() => void addNextImmediately(subject.id)}
            title="Přidá další přednášku rovnou, bez formuláře"
          >
            <CalendarPlus size={16} />
            Rychle přidat
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {lectures === undefined ? null : lectures.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">
            Zatím žádná přednáška. Přidej první — číslo i datum se předvyplní samy.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {lectures.map((lecture) => (
              <LectureRow
                key={lecture.id}
                lecture={lecture}
                onSetStatus={(status, source) =>
                  // Posun odznakem se vrací dalším tapnutím; skok z nabídky si zaslouží „Zpět“.
                  void actions.setStatus(lecture, status, { announce: source === 'menu' })
                }
                onEdit={() => actions.edit(lecture)}
                onDelete={() => void actions.remove(lecture)}
              />
            ))}
          </ul>
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
