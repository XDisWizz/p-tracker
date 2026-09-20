import type { IsoDateTime } from './types';
import { formatCsShort, todayIso } from './date';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

/**
 * Jak dávno proběhla synchronizace, lidsky.
 *
 * U zálohy stačí rozlišovat dny, tady ne — rozdíl mezi „před chvílí“ a „před
 * hodinou“ je přesně ta informace, kvůli které se na stav člověk dívá.
 */
export function describeSyncAge(lastSyncAt: IsoDateTime | null, now: Date = new Date()): string {
  if (lastSyncAt === null) return 'zatím nikdy';
  const elapsed = now.getTime() - new Date(lastSyncAt).getTime();
  if (Number.isNaN(elapsed)) return 'neznámo kdy';
  if (elapsed < 0) return 'právě teď';
  if (elapsed < MINUTE_MS) return 'právě teď';
  if (elapsed < HOUR_MS) {
    const minutes = Math.floor(elapsed / MINUTE_MS);
    return `před ${minutes} min`;
  }
  if (elapsed < 12 * HOUR_MS) {
    const hours = Math.floor(elapsed / HOUR_MS);
    return `před ${hours} h`;
  }
  const day = todayIso(new Date(lastSyncAt));
  return day === todayIso(now)
    ? `dnes ${new Date(lastSyncAt).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}`
    : formatCsShort(day);
}
