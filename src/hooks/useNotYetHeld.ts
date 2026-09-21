import { useMemo } from 'react';
import { todayIso } from '../domain/date';
import { NONE_PENDING, notYetHeld, type NotYetHeld } from '../domain/held';
import { useNow } from './useNow';
import { useAllLectures, useSlots } from './useLiveData';

/**
 * Dnešní přednášky, které ještě neskončily. Hodiny tikají, takže se přepočítává
 * průběžně (a hned po návratu do aplikace); množina se ale mění jen ve chvíli,
 * kdy nějaká hodina doběhne — obrazovky se kvůli ní zbytečně nepřekreslují.
 */
export function useNotYetHeld(): NotYetHeld {
  const now = useNow();
  const lectures = useAllLectures();
  const slots = useSlots();
  const today = todayIso(now);
  const minutes = now.getHours() * 60 + now.getMinutes();

  const ids = useMemo(
    () =>
      lectures === undefined || slots === undefined
        ? ''
        : [...notYetHeld(lectures, slots, today, minutes)].toSorted().join('\n'),
    [lectures, slots, today, minutes],
  );

  return useMemo(() => (ids === '' ? NONE_PENDING : new Set(ids.split('\n'))), [ids]);
}
