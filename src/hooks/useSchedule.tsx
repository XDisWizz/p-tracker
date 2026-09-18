import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { buildHash } from './useHashRoute';
import { schedule, slots as slotsRepo, useSlots, useSubjects, useTerms } from './useLiveData';
import { withPresets } from '../domain/terms';
import { countOf } from '../domain/plural';
import type { ScheduleContext } from '../domain/schedule';
import type { Id, ScheduleSlot, SlotInput } from '../domain/types';
import { SlotForm } from '../components/SlotForm';
import { useToast } from '../components/ui/Toast';

/** Vše, co potřebuje výpočet rozvrhu. `undefined`, dokud se data načítají. */
export function useScheduleContext(): ScheduleContext | undefined {
  const slots = useSlots();
  const subjects = useSubjects();
  const terms = useTerms();
  return useMemo(() => {
    if (slots === undefined || subjects === undefined || terms === undefined) return undefined;
    return { slots, subjects, terms: withPresets(terms, subjects) };
  }, [slots, subjects, terms]);
}

/**
 * Srovná přednášky předmětu s rozvrhem a řekne, co se stalo. Každá změna jde
 * vrátit — synchronizace umí smazat a přečíslovat, takže bez „Zpět“ by byla
 * na mobilu nebezpečná.
 */
export function useLectureSync(): (subjectId: Id) => Promise<void> {
  const toast = useToast();
  return useCallback(
    async (subjectId: Id): Promise<void> => {
      const result = await schedule.syncSubject(subjectId);
      if (result.status === 'no-term') {
        toast(`Chybí období výuky pro „${result.term}“ — přednášky se vytvoří po jeho zadání.`, {
          label: 'Nastavit',
          run: () => {
            window.location.hash = buildHash({ name: 'settings' });
          },
        });
        return;
      }
      if (result.status !== 'ok') return;
      const parts: string[] = [];
      if (result.created > 0) parts.push(`přidáno ${countOf(result.created, 'přednáška', 'přednášky', 'přednášek')}`);
      if (result.removed > 0) parts.push(`odebráno ${result.removed} nevyplněných`);
      if (result.linked > 0) parts.push(`${result.linked} přiřazeno k rozvrhu`);
      if (parts.length === 0) return;
      toast(`Přednášky podle rozvrhu: ${parts.join(', ')}`, {
        label: 'Zpět',
        run: () => schedule.undoSync(result.undo),
      });
    },
    [toast],
  );
}

type Editing = { mode: 'new'; initial: SlotInput } | { mode: 'edit'; slot: ScheduleSlot } | null;

export interface SlotEditor {
  openNew: (defaults?: Partial<SlotInput>) => void;
  openEdit: (slot: ScheduleSlot) => void;
  editor: ReactNode;
}

/**
 * Formulář hodiny rozvrhu včetně toho, co po uložení následuje: když se
 * změní přednášková hodina, přednášky předmětu se hned srovnají.
 */
export function useSlotEditor(options: { lockedSubjectId?: Id | undefined } = {}): SlotEditor {
  const subjects = useSubjects();
  const sync = useLectureSync();
  const toast = useToast();
  const [editing, setEditing] = useState<Editing>(null);

  const openNew = useCallback(
    (defaults: Partial<SlotInput> = {}): void => {
      const subjectId = options.lockedSubjectId ?? defaults.subjectId ?? subjects?.[0]?.id ?? '';
      setEditing({
        mode: 'new',
        initial: {
          subjectId,
          kind: 'lecture',
          dayOfWeek: 1,
          start: '09:00',
          end: '10:30',
          room: '',
          teacher: null,
          parity: 'every',
          note: '',
          ...defaults,
        },
      });
    },
    [options.lockedSubjectId, subjects],
  );

  const openEdit = useCallback((slot: ScheduleSlot): void => setEditing({ mode: 'edit', slot }), []);

  const affectsLectures = (before: ScheduleSlot | null, after: SlotInput): boolean =>
    before === null
      ? after.kind === 'lecture'
      : before.kind === 'lecture' ||
        after.kind === 'lecture';

  let editor: ReactNode = null;
  if (editing !== null && subjects !== undefined) {
    const initial: SlotInput =
      editing.mode === 'new'
        ? editing.initial
        : {
            subjectId: editing.slot.subjectId,
            kind: editing.slot.kind,
            dayOfWeek: editing.slot.dayOfWeek,
            start: editing.slot.start,
            end: editing.slot.end,
            room: editing.slot.room,
            teacher: editing.slot.teacher,
            parity: editing.slot.parity,
            note: editing.slot.note,
          };

    editor = (
      <SlotForm
        key={editing.mode === 'edit' ? editing.slot.id : 'new'}
        title={editing.mode === 'new' ? 'Nová hodina v rozvrhu' : 'Upravit hodinu'}
        initial={initial}
        subjects={subjects}
        lockSubject={options.lockedSubjectId !== undefined}
        onClose={() => setEditing(null)}
        onSubmit={async (input) => {
          const before = editing.mode === 'edit' ? editing.slot : null;
          if (before === null) await slotsRepo.create(input);
          else await slotsRepo.update(before.id, input);
          setEditing(null);
          if (affectsLectures(before, input)) {
            await sync(input.subjectId);
            // Hodina se přesunula k jinému předmětu: srovnat i ten původní.
            if (before !== null && before.subjectId !== input.subjectId) await sync(before.subjectId);
          }
        }}
        onDelete={
          editing.mode === 'edit'
            ? () => {
                const slot = editing.slot;
                setEditing(null);
                void (async () => {
                  await slotsRepo.softDelete(slot.id);
                  toast('Hodina smazána', { label: 'Zpět', run: () => slotsRepo.restore(slot.id) });
                  if (slot.kind === 'lecture') await sync(slot.subjectId);
                })();
              }
            : undefined
        }
      />
    );
  }

  return { openNew, openEdit, editor };
}
