import { ShieldAlert } from 'lucide-react';
import { describeLastBackup, isBackupDue } from '../domain/backup';
import { useBackupActions, useBackupStatus } from '../hooks/useBackup';
import { Button } from './ui/Button';

/**
 * Nenápadný pruh nad „Co mě čeká“. Ukáže se až po týdnu s daty bez zálohy
 * nebo dva týdny od poslední, a „Později“ ho schová na tři dny.
 */
export function BackupReminder() {
  const status = useBackupStatus();
  const { exportBackup, snooze } = useBackupActions();

  if (status === undefined || !isBackupDue(status)) return null;

  const last = describeLastBackup(status.lastExportAt);

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/60 dark:text-amber-100"
    >
      <ShieldAlert size={18} className="shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        {status.lastExportAt === null ? 'Data ještě nemají zálohu.' : `Poslední záloha ${last}.`}{' '}
        <span className="opacity-80">Stačí jeden soubor.</span>
      </p>
      <div className="flex gap-1">
        <button
          type="button"
          className="inline-flex h-11 items-center rounded-xl px-3 text-sm font-medium hover:bg-black/5 sm:h-9 dark:hover:bg-white/10"
          onClick={() => void snooze()}
        >
          Později
        </button>
        <Button size="sm" variant="primary" onClick={() => void exportBackup('download')}>
          Zálohovat
        </Button>
      </div>
    </div>
  );
}
