import { describe, expect, it } from 'vitest';
import { describeSyncAge } from './sync';

const now = new Date('2026-09-20T14:30:00');

describe('describeSyncAge', () => {
  it('rozlišuje minuty, hodiny a starší dny', () => {
    expect(describeSyncAge(null, now)).toBe('zatím nikdy');
    expect(describeSyncAge('2026-09-20T14:29:50', now)).toBe('právě teď');
    expect(describeSyncAge('2026-09-20T14:05:00', now)).toBe('před 25 min');
    expect(describeSyncAge('2026-09-20T11:30:00', now)).toBe('před 3 h');
    expect(describeSyncAge('2026-09-20T01:00:00', now)).toBe('dnes 01:00');
    expect(describeSyncAge('2026-09-18T09:00:00', now)).toBe('pá 18. 9.');
  });

  it('hodiny dopředu ani nesmysl aplikaci nerozhodí', () => {
    expect(describeSyncAge('2026-09-20T14:31:00', now)).toBe('právě teď');
    expect(describeSyncAge('nesmysl', now)).toBe('neznámo kdy');
  });
});
