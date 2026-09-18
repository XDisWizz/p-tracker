import { useCallback, useEffect, useRef, useState } from 'react';
import { lectures as lecturesRepo } from './useLiveData';
import { suggestAutoUpdates } from '../domain/notes';
import type { Lecture, LecturePatch } from '../domain/types';

export type NoteField = 'summary' | 'focus' | 'transcript' | 'note';
export type NoteDraft = Pick<Lecture, NoteField>;
export type SaveState = 'saved' | 'pending' | 'saving' | 'error';

const SAVE_DELAY_MS = 700;

function pickNotes(lecture: Lecture): NoteDraft {
  return { summary: lecture.summary, focus: lecture.focus, transcript: lecture.transcript, note: lecture.note };
}

/**
 * Zápisky u přednášky s automatickým ukládáním.
 *
 * Tlačítko Uložit u poznámek z přednášky je past: telefon zamkneš, aplikaci
 * přepneš a text je pryč. Proto se ukládá samo chvíli po dopsání, při odchodu
 * z obrazovky a při přepnutí do jiné aplikace.
 *
 * Změny zvenku (úprava v jiném okně, import) se převezmou jen do polí, která
 * uživatel zrovna nemá rozepsaná — nikdy mu nepřepíšou text pod rukama.
 */
export function useLectureNotes(lecture: Lecture): {
  draft: NoteDraft;
  update: (field: NoteField, value: string) => void;
  flush: () => Promise<void>;
  state: SaveState;
} {
  const [draft, setDraft] = useState<NoteDraft>(() => pickNotes(lecture));
  const [state, setState] = useState<SaveState>('saved');
  const pending = useRef<Partial<NoteDraft>>({});
  const timer = useRef<number | null>(null);
  const latest = useRef(lecture);
  latest.current = lecture;

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const patch: LecturePatch = { ...pending.current };
    if (Object.keys(patch).length === 0) return;
    pending.current = {};
    setState('saving');
    try {
      const auto = suggestAutoUpdates(latest.current, patch);
      await lecturesRepo.update(latest.current.id, { ...patch, ...auto });
      setState(Object.keys(pending.current).length > 0 ? 'pending' : 'saved');
    } catch (error) {
      // Neuložené vrátit do fronty, ať se při dalším pokusu neztratí.
      pending.current = { ...(patch as Partial<NoteDraft>), ...pending.current };
      console.error('Zápisky se nepodařilo uložit:', error);
      setState('error');
    }
  }, []);

  const update = useCallback(
    (field: NoteField, value: string): void => {
      setDraft((d) => ({ ...d, [field]: value }));
      pending.current = { ...pending.current, [field]: value };
      setState('pending');
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  // Převzít změny zvenku do polí, která uživatel právě nerozepsal.
  useEffect(() => {
    setDraft((d) => {
      let changed = false;
      const next = { ...d };
      for (const field of ['summary', 'focus', 'transcript', 'note'] as const) {
        if (pending.current[field] === undefined && lecture[field] !== d[field]) {
          next[field] = lecture[field];
          changed = true;
        }
      }
      return changed ? next : d;
    });
  }, [lecture]);

  // Uložit při odchodu z obrazovky, přepnutí aplikace i zavření okna.
  useEffect(() => {
    const onHide = (): void => {
      if (document.visibilityState === 'hidden') void flush();
    };
    const onUnload = (): void => void flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onUnload);
      void flush();
    };
  }, [flush]);

  return { draft, update, flush, state };
}
