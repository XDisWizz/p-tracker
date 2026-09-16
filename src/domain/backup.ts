import type { IsoDateTime } from './types';
import { relativeDays, todayIso } from './date';

/** Jak často připomínat zálohu, když už nějaká proběhla. */
export const BACKUP_INTERVAL_DAYS = 14;
/** Po jak dlouhé době od prvních dat připomenout úplně první zálohu. */
export const FIRST_BACKUP_AFTER_DAYS = 7;
/** Na jak dlouho „Později“ připomínku schová. */
export const SNOOZE_DAYS = 3;

const DAY_MS = 86_400_000;

export interface BackupState {
  lastExportAt: IsoDateTime | null;
  snoozedUntil: IsoDateTime | null;
  /** Kdy vznikl nejstarší živý předmět. `null` = žádná data, není co zálohovat. */
  firstDataAt: IsoDateTime | null;
}

/**
 * Je čas připomenout zálohu?
 *
 * Local-first bez zálohy znamená data, která jsi ještě neztratil: Android umí
 * při nedostatku místa smazat úložiště prohlížeče a nikoho se nezeptá.
 * Připomínka ale nesmí otravovat hned první den ani každý den znovu.
 */
export function isBackupDue(state: BackupState, now: Date = new Date()): boolean {
  if (state.firstDataAt === null) return false;
  if (state.snoozedUntil !== null && state.snoozedUntil > now.toISOString()) return false;

  const reference = state.lastExportAt ?? state.firstDataAt;
  const threshold = state.lastExportAt === null ? FIRST_BACKUP_AFTER_DAYS : BACKUP_INTERVAL_DAYS;
  return now.getTime() - new Date(reference).getTime() >= threshold * DAY_MS;
}

export function snoozeUntil(now: Date = new Date()): IsoDateTime {
  return new Date(now.getTime() + SNOOZE_DAYS * DAY_MS).toISOString();
}

/** „nikdy“, „dnes“, „včera“, „před 12 dny“ — podle místního kalendáře. */
export function describeLastBackup(lastExportAt: IsoDateTime | null, now: Date = new Date()): string {
  if (lastExportAt === null) return 'nikdy';
  return relativeDays(todayIso(new Date(lastExportAt)), todayIso(now));
}
