import { describe, expect, it } from 'vitest';
import { describeLastBackup, isBackupDue, snoozeUntil, type BackupState } from './backup';

const now = new Date('2026-09-30T12:00:00.000Z');

function state(overrides: Partial<BackupState> = {}): BackupState {
  return { lastExportAt: null, snoozedUntil: null, firstDataAt: '2026-09-01T12:00:00.000Z', ...overrides };
}

describe('isBackupDue', () => {
  it('bez dat nic nepřipomíná', () => {
    expect(isBackupDue(state({ firstDataAt: null }), now)).toBe(false);
  });

  it('první zálohu nepřipomíná hned první dny', () => {
    expect(isBackupDue(state({ firstDataAt: '2026-09-27T12:00:00.000Z' }), now)).toBe(false);
  });

  it('první zálohu připomene po týdnu od prvních dat', () => {
    expect(isBackupDue(state({ firstDataAt: '2026-09-23T12:00:00.000Z' }), now)).toBe(true);
  });

  it('po záloze mlčí dva týdny', () => {
    expect(isBackupDue(state({ lastExportAt: '2026-09-20T12:00:00.000Z' }), now)).toBe(false);
    expect(isBackupDue(state({ lastExportAt: '2026-09-16T12:00:00.000Z' }), now)).toBe(true);
  });

  it('odložená připomínka se neukáže, dokud odklad nevyprší', () => {
    const snoozed = state({ snoozedUntil: '2026-10-01T12:00:00.000Z' });
    expect(isBackupDue(snoozed, now)).toBe(false);
    expect(isBackupDue(snoozed, new Date('2026-10-02T12:00:00.000Z'))).toBe(true);
  });

  it('„Později“ odkládá o tři dny', () => {
    expect(snoozeUntil(now)).toBe('2026-10-03T12:00:00.000Z');
  });
});

describe('describeLastBackup', () => {
  it('rozliší nikdy, dnes a stáří zálohy', () => {
    expect(describeLastBackup(null, now)).toBe('nikdy');
    expect(describeLastBackup('2026-09-30T08:00:00.000Z', now)).toBe('dnes');
    expect(describeLastBackup('2026-09-18T12:00:00.000Z', now)).toBe('před 12 dny');
  });
});
