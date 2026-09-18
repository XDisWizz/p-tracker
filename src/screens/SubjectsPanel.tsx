import { useMemo, useState } from 'react';
import { Archive, BookPlus, Plus } from 'lucide-react';
import { EMPTY_PROGRESS, progressBySubject } from '../domain/progress';
import { todayIso } from '../domain/date';
import { nextSubjectInput, subjectToInput } from '../domain/defaults';
import type { Id, Subject, SubjectInput } from '../domain/types';
import { subjects as subjectsRepo, useAllLectures, useSubjects } from '../hooks/useLiveData';
import { SubjectCard } from '../components/SubjectCard';
import { SubjectForm } from '../components/SubjectForm';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';

interface SubjectsPanelProps {
  selectedId: Id | null;
  onSelect: (id: Id) => void;
}

type Editing = { mode: 'new'; initial: SubjectInput } | { mode: 'edit'; subject: Subject } | null;

export function SubjectsPanel({ selectedId, onSelect }: SubjectsPanelProps) {
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const toast = useToast();

  const subjects = useSubjects(showArchived);
  const lectures = useAllLectures();

  const progress = useMemo(
    () => progressBySubject(lectures ?? [], (subjects ?? []).map((s) => s.id), todayIso()),
    [lectures, subjects],
  );

  async function openNew(): Promise<void> {
    // Výchozí hodnoty se počítají ze všech předmětů včetně archivovaných,
    // jinak by nová barva mohla kolidovat s předmětem z minulého semestru.
    const all = await subjectsRepo.list({ includeArchived: true });
    setEditing({ mode: 'new', initial: nextSubjectInput(all) });
  }

  async function handleSubmit(input: SubjectInput): Promise<void> {
    if (editing === null) return;
    if (editing.mode === 'new') {
      const created = await subjectsRepo.create(input);
      setEditing(null);
      onSelect(created.id);
    } else {
      await subjectsRepo.update(editing.subject.id, input);
      setEditing(null);
    }
  }

  async function handleDelete(subject: Subject): Promise<void> {
    await subjectsRepo.softDelete(subject.id);
    // Žádné potvrzovací okno — vrátit smazání je rychlejší i bezpečnější než se ptát dopředu.
    toast(`Předmět ${subject.code || subject.name} smazán.`, {
      label: 'Zpět',
      run: () => subjectsRepo.restore(subject.id),
    });
  }

  async function handleToggleArchive(subject: Subject): Promise<void> {
    await subjectsRepo.setArchived(subject.id, !subject.archived);
    toast(subject.archived ? 'Vráceno z archivu.' : 'Předmět archivován.', {
      label: 'Zpět',
      run: () => subjectsRepo.setArchived(subject.id, subject.archived),
    });
  }

  const archivedHidden = subjects !== undefined && !showArchived;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <h2 className="text-lg font-semibold">Předměty</h2>
        <Button variant="primary" size="sm" onClick={() => void openNew()}>
          <Plus size={16} />
          Nový předmět
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {subjects === undefined ? null : subjects.length === 0 ? (
          <EmptyState onCreate={() => void openNew()} showArchived={showArchived} />
        ) : (
          <ul className="flex flex-col gap-2">
            {subjects.map((subject) => (
              <li key={subject.id}>
                <SubjectCard
                  subject={subject}
                  progress={progress.get(subject.id) ?? EMPTY_PROGRESS}
                  selected={subject.id === selectedId}
                  onOpen={() => onSelect(subject.id)}
                  onEdit={() => setEditing({ mode: 'edit', subject })}
                  onToggleArchive={() => void handleToggleArchive(subject)}
                  onDelete={() => void handleDelete(subject)}
                />
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() => setShowArchived((current) => !current)}
          className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-muted hover:text-ink"
        >
          <Archive size={15} />
          {archivedHidden ? 'Zobrazit archivované' : 'Skrýt archivované'}
        </button>
      </div>

      {editing !== null && (
        <SubjectForm
          // `key` vynutí nový stav formuláře při každém otevření, takže se
          // v něm nemůžou objevit zbytky předchozí úpravy.
          key={editing.mode === 'edit' ? editing.subject.id : 'new'}
          open
          title={editing.mode === 'new' ? 'Nový předmět' : 'Upravit předmět'}
          initial={editing.mode === 'new' ? editing.initial : subjectToInput(editing.subject)}
          onSubmit={(input) => void handleSubmit(input)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function EmptyState({ onCreate, showArchived }: { onCreate: () => void; showArchived: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <BookPlus size={28} className="text-muted" />
      <p className="text-sm text-muted">
        {showArchived ? 'Žádné předměty, ani v archivu.' : 'Zatím žádný předmět.'}
      </p>
      <Button variant="primary" onClick={onCreate}>
        <Plus size={16} />
        Přidat první předmět
      </Button>
    </div>
  );
}
