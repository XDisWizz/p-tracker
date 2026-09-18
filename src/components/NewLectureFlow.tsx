import { useCallback, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight } from 'lucide-react';
import { nextLectureInput } from '../domain/defaults';
import type { Id, LectureInput, Subject } from '../domain/types';
import { lectures as lecturesRepo, useSubjects } from '../hooks/useLiveData';
import { LectureForm } from './LectureForm';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';
import { SUBJECT_COLOR_CLASSES, cx } from './tokens';

interface NewLectureFlowProps {
  /** Předmět, který se má vybrat rovnou — třeba když filtr ukazuje jen jeden. */
  preferredSubjectId: Id | null;
  onClose: () => void;
  onGoToSubjects: () => void;
}

interface Draft {
  subject: Subject;
  initial: LectureInput;
}

/**
 * Nová přednáška odkudkoliv mimo detail předmětu (klávesa „n“, tlačítko
 * v „Co mě čeká“). Když je jasné, o jaký předmět jde, výběr se přeskočí
 * a formulář se otevře rovnou předvyplněný.
 */
export function NewLectureFlow({ preferredSubjectId, onClose, onGoToSubjects }: NewLectureFlowProps) {
  const subjects = useSubjects();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);

  const pick = useCallback(async (subject: Subject): Promise<void> => {
    const existing = await lecturesRepo.listBySubject(subject.id);
    setDraft({ subject, initial: nextLectureInput(subject, existing) });
  }, []);

  const autoSubject =
    subjects === undefined
      ? undefined
      : (subjects.find((s) => s.id === preferredSubjectId) ??
        (subjects.length === 1 ? subjects[0] : undefined));

  // Když je předmět jasný předem, návrh přednášky se odvodí rovnou z databáze —
  // bez mezikroku s výběrem a bez nastavování stavu v efektu.
  const autoDraft = useLiveQuery(async (): Promise<Draft | null> => {
    if (autoSubject === undefined) return null;
    const existing = await lecturesRepo.listBySubject(autoSubject.id);
    return { subject: autoSubject, initial: nextLectureInput(autoSubject, existing) };
  }, [autoSubject]);

  if (subjects === undefined) return null;

  const active = draft ?? autoDraft ?? null;
  if (active !== null) {
    return (
      <LectureForm
        open
        key={active.subject.id}
        title={`Nová přednáška · ${active.subject.code || active.subject.name}`}
        submitLabel="Přidat"
        initial={active.initial}
        onClose={onClose}
        onSubmit={async (input) => {
          const created = await lecturesRepo.create(input);
          onClose();
          toast(`Přidána ${created.number}. přednáška (${active.subject.code || active.subject.name})`, {
            label: 'Zpět',
            run: () => lecturesRepo.softDelete(created.id),
          });
        }}
      />
    );
  }

  // Předmět se vybírá automaticky — nic neukazuj, ať výběr neprobliká.
  if (autoSubject !== undefined) return null;

  return (
    <Modal open title="Nová přednáška — předmět" onClose={onClose}>
      {subjects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm text-muted">Přednáška musí patřit k předmětu. Nejdřív nějaký přidej.</p>
          <Button
            variant="primary"
            onClick={() => {
              onClose();
              onGoToSubjects();
            }}
          >
            Přejít na předměty
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {subjects.map((subject, index) => (
            <li key={subject.id}>
              <button
                type="button"
                // První předmět dostane fokus, takže z klávesnice stačí „n“ a Enter.
                data-autofocus={index === 0 ? 'always' : undefined}
                onClick={() => void pick(subject)}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl bg-surface-2 px-3 text-left ring-1 ring-line hover:ring-accent"
              >
                <span
                  className={cx('size-2.5 shrink-0 rounded-full', SUBJECT_COLOR_CLASSES[subject.color].dot)}
                  aria-hidden
                />
                <span className="w-14 shrink-0 text-sm font-semibold">{subject.code}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{subject.name}</span>
                <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
