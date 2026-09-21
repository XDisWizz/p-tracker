import { useEffect } from 'react';
import { db } from '../db/db';
import { metaRepo } from '../db/meta';
import { scheduleRepo } from '../db/schedule';
import { countOf } from '../domain/plural';
import { useToast } from '../components/ui/Toast';

/**
 * Verze pravidel, podle kterých vznikají záznamy z rozvrhu. Zvyš ji, kdykoliv
 * se změní, ze kterých hodin se záznamy tvoří — aplikace pak jednou po startu
 * srovná existující rozvrh podle nových pravidel.
 *
 * 1: záznamy jen z přednášek.
 * 2: předmět bez přednášky se sleduje podle cvičení a dalších hodin.
 */
export const SCHEDULE_RULES_VERSION = 2;

/**
 * Jednorázové dorovnání po aktualizaci. Jinak by se nová pravidla projevila až
 * při příští úpravě hodiny a rozvrh zadaný dřív by zůstal bez záznamů.
 */
export function useScheduleCatchUp(): void {
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const meta = metaRepo(db);
      if (((await meta.get('scheduleRulesVersion')) ?? 1) >= SCHEDULE_RULES_VERSION) return;
      const results = await scheduleRepo(db).syncAll();
      await meta.set('scheduleRulesVersion', SCHEDULE_RULES_VERSION);
      const created = results.reduce((sum, r) => sum + (r.status === 'ok' ? r.created : 0), 0);
      if (!cancelled && created > 0) {
        toast(`Doplněno podle rozvrhu: ${countOf(created, 'záznam', 'záznamy', 'záznamů')} (i u předmětů jen se cvičením)`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);
}
