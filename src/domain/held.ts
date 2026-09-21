import type { Id, IsoDate, Lecture, ScheduleSlot } from './types';

/**
 * Proběhla už přednáška?
 *
 * Datum nestačí: přednáška, která je dnes v 16:00, v poledne ještě není co
 * zpracovávat, a přesto má dnešní datum. Proto se k datu přidává seznam
 * dnešních přednášek, jejichž hodina ještě neskončila — ty se počítají mezi
 * nadcházející, dokud hodina nedoběhne.
 */
export type NotYetHeld = ReadonlySet<Id>;

export const NONE_PENDING: NotYetHeld = new Set();

/** Přednáška je v budoucnu — buď jiný den, nebo dnes, ale její hodina ještě neskončila. */
export function isAhead(lecture: Pick<Lecture, 'id' | 'date'>, today: IsoDate, notYet: NotYetHeld = NONE_PENDING): boolean {
  return lecture.date !== null && (lecture.date > today || (lecture.date === today && notYet.has(lecture.id)));
}

function minutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Dnešní přednášky, jejichž hodina ještě neskončila.
 *
 * Přednáška bez hodiny v rozvrhu (přidaná ručně, nebo přesunutá) čas nemá —
 * ta se bere jako proběhlá, protože ji tam uživatel dal sám a ví proč.
 */
export function notYetHeld(
  lectures: readonly Lecture[],
  slots: readonly ScheduleSlot[],
  today: IsoDate,
  nowMinutes: number,
): Set<Id> {
  const endOf = new Map(slots.filter((s) => s.deletedAt === null).map((s) => [s.id, minutes(s.end)]));
  const out = new Set<Id>();
  for (const lecture of lectures) {
    if (lecture.deletedAt !== null || lecture.date !== today || lecture.slotId === null) continue;
    const end = endOf.get(lecture.slotId);
    if (end !== undefined && nowMinutes < end) out.add(lecture.id);
  }
  return out;
}
