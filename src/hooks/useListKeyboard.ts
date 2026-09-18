import { useEffect, useState } from 'react';
import { PIPELINE_STATUSES } from '../domain/status';
import type { Id, Lecture, LectureStatus } from '../domain/types';
import { useHotkeys, type HotkeyHandlers } from './useHotkeys';

interface ListKeyboardOptions {
  lectures: readonly Lecture[];
  active: boolean;
  onOpen: (lecture: Lecture) => void;
  onSetStatus: (lecture: Lecture, status: LectureStatus) => void;
}

/** Je fokus na ovládacím prvku, kterému Enter patří (tlačítko, odkaz)? */
function focusOwnsEnter(target: EventTarget | null): boolean {
  return target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement;
}

/**
 * Procházení seznamu přednášek z klávesnice, jako v e-mailovém klientu:
 * j/k výběr, Enter otevřít, 1–5 stav podle pořadí v pipeline, 0 přeskočit.
 * Zpracovat celý týden přednášek jde bez sáhnutí na myš.
 */
export function useListKeyboard({ lectures, active, onOpen, onSetStatus }: ListKeyboardOptions): Id | null {
  const [selectedId, setSelectedId] = useState<Id | null>(null);
  const index = lectures.findIndex((l) => l.id === selectedId);
  const selected = index === -1 ? undefined : lectures[index];

  // Vybraná přednáška zmizela ze seznamu (třeba po změně stavu) — výběr zrušit.
  useEffect(() => {
    if (selectedId !== null && index === -1) setSelectedId(null);
  }, [selectedId, index]);

  useEffect(() => {
    if (selectedId === null) return;
    document.querySelector(`[data-lecture-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  const move = (delta: number): void => {
    if (lectures.length === 0) return;
    const nextIndex =
      index === -1 ? (delta > 0 ? 0 : lectures.length - 1) : Math.min(lectures.length - 1, Math.max(0, index + delta));
    setSelectedId(lectures[nextIndex]?.id ?? null);
  };

  const handlers: HotkeyHandlers = {
    j: () => move(1),
    k: () => move(-1),
    Enter: (event) => {
      if (selected === undefined || focusOwnsEnter(event.target)) return false;
      onOpen(selected);
      return true;
    },
    Escape: () => {
      if (selectedId === null) return false;
      setSelectedId(null);
      return true;
    },
  };

  if (selected !== undefined) {
    PIPELINE_STATUSES.forEach((status, i) => {
      handlers[String(i + 1)] = () => onSetStatus(selected, status);
    });
    handlers['0'] = () => onSetStatus(selected, 'skipped');
  }

  useHotkeys(handlers, active);

  return selected === undefined ? null : selectedId;
}
