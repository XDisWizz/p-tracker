import { describe, expect, it } from 'vitest';
import { isAhead, notYetHeld } from './held';
import { computeProgress } from './progress';
import { groupByDue } from './filter';
import { makeLecture, makeSlot } from '../test/factories';

const today = '2026-09-21';
const slot = makeSlot({ id: 'ma1', start: '16:00', end: '18:30' });
const earlier = makeLecture({ id: 'l1', date: '2026-09-14', slotId: 'ma1', number: 1 });
const later = makeLecture({ id: 'l2', date: today, slotId: 'ma1', number: 2 });
const manual = makeLecture({ id: 'l3', date: today, slotId: null, number: 3 });

describe('přednáška, která ještě neskončila', () => {
  it('dnešní hodina se počítá za proběhlou až po konci', () => {
    expect([...notYetHeld([earlier, later, manual], [slot], today, 12 * 60)]).toEqual(['l2']);
    expect([...notYetHeld([later], [slot], today, 17 * 60)]).toEqual(['l2']); // právě probíhá
    expect([...notYetHeld([later], [slot], today, 18 * 60 + 30)]).toEqual([]);
  });

  it('MA1 v poledne: 0 z 1 k zpracování, ne 0 ze 2', () => {
    const notYet = notYetHeld([earlier, later], [slot], today, 12 * 60);
    const progress = computeProgress([earlier, later], today, notYet);
    expect(progress.total).toBe(1);
    expect(progress.upcoming).toBe(1);
    const groups = groupByDue([earlier, later], today, notYet);
    expect(groups.due.map((l) => l.id)).toEqual(['l1']);
    expect(groups.upcoming.map((l) => l.id)).toEqual(['l2']);
    expect(isAhead(later, today, notYet)).toBe(true);
  });

  it('smazaná hodina ani ručně přidaná přednáška čas neurčují', () => {
    expect(notYetHeld([later], [{ ...slot, deletedAt: '2026-09-20T10:00:00.000Z' }], today, 600).size).toBe(0);
    expect(isAhead(manual, today)).toBe(false);
  });
});
