import { useCallback, useState, type ReactNode } from 'react';
import { lectureDisplayTitle, lectureToInput } from '../domain/defaults';
import { STATUS_META } from '../domain/status';
import type { Lecture, LectureStatus } from '../domain/types';
import { LectureForm } from '../components/LectureForm';
import { useToast } from '../components/ui/Toast';
import { lectures as lecturesRepo } from './useLiveData';

export interface StatusChangeOptions {
  /** Nabídnout „Zpět“? */
  announce: boolean;
  /** Předpona hlášky, typicky zkratka předmětu v pohledu přes víc předmětů. */
  context?: string | undefined;
}

export interface LectureActions {
  setStatus: (lecture: Lecture, status: LectureStatus, options: StatusChangeOptions) => Promise<void>;
  remove: (lecture: Lecture, context?: string) => Promise<void>;
  edit: (lecture: Lecture) => void;
  /** Formulář úprav; vlož ho kamkoliv do stromu komponenty. */
  editor: ReactNode;
}

/**
 * Změna stavu, mazání a úprava přednášky s nabídkou vrácení. Sdílí je detail
 * předmětu i „Co mě čeká“, aby se chování na obou místech nerozcházelo.
 */
export function useLectureActions(): LectureActions {
  const toast = useToast();
  const [editing, setEditing] = useState<Lecture | null>(null);

  const setStatus = useCallback<LectureActions['setStatus']>(
    async (lecture, status, { announce, context }) => {
      const previous = lecture.status;
      if (previous === status) return;
      await lecturesRepo.setStatus(lecture.id, status);
      if (!announce) return;
      const prefix = context === undefined ? '' : `${context} · `;
      toast(`${prefix}${lectureDisplayTitle(lecture)}: ${STATUS_META[status].label}`, {
        label: 'Zpět',
        run: () => lecturesRepo.setStatus(lecture.id, previous),
      });
    },
    [toast],
  );

  const remove = useCallback<LectureActions['remove']>(
    async (lecture, context) => {
      await lecturesRepo.softDelete(lecture.id);
      const prefix = context === undefined ? '' : `${context} · `;
      toast(`${prefix}${lectureDisplayTitle(lecture)} smazána`, {
        label: 'Zpět',
        run: () => lecturesRepo.restore(lecture.id),
      });
    },
    [toast],
  );

  const editor =
    editing === null ? null : (
      <LectureForm
        key={editing.id}
        open
        title="Upravit přednášku"
        submitLabel="Uložit"
        initial={lectureToInput(editing)}
        onSubmit={async (input) => {
          await lecturesRepo.update(editing.id, input);
          setEditing(null);
        }}
        onClose={() => setEditing(null)}
      />
    );

  return { setStatus, remove, edit: setEditing, editor };
}
