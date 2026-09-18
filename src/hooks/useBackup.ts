import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { metaRepo } from '../db/meta';
import { exportAll, exportFilename, serializeExport } from '../db/transfer';
import { snoozeUntil, type BackupState } from '../domain/backup';
import { countOf } from '../domain/plural';
import { downloadFile, shareFile } from '../lib/files';
import { useToast } from '../components/ui/Toast';

/** Stav zálohy pro připomínku i nastavení. `undefined` = načítá se. */
export function useBackupStatus(): BackupState | undefined {
  return useLiveQuery(async () => {
    const meta = metaRepo(db);
    const [lastExportAt, snoozedUntil, subjects] = await Promise.all([
      meta.get('lastExportAt'),
      meta.get('backupSnoozedUntil'),
      db.subjects.toArray(),
    ]);
    const created = subjects
      .filter((s) => s.deletedAt === null)
      .map((s) => s.createdAt)
      .toSorted();
    return {
      lastExportAt: lastExportAt ?? null,
      snoozedUntil: snoozedUntil ?? null,
      firstDataAt: created[0] ?? null,
    };
  }, []);
}

export type ExportMethod = 'download' | 'share';

export interface BackupActions {
  /** Vrací `true`, když záloha opravdu odešla (sdílení mohl uživatel zrušit). */
  exportBackup: (method: ExportMethod) => Promise<boolean>;
  snooze: () => Promise<void>;
}

export function useBackupActions(): BackupActions {
  const toast = useToast();

  const exportBackup = useCallback(
    async (method: ExportMethod): Promise<boolean> => {
      const file = await exportAll(db);
      const text = serializeExport(file);
      const filename = exportFilename();

      if (method === 'share') {
        const outcome = await shareFile(filename, text);
        if (outcome === 'unsupported') {
          toast('Sdílení souborů tady nejde, stahuji místo toho.');
          downloadFile(filename, text);
        } else if (outcome === 'cancelled') {
          // Nesdíleno = nezálohováno. Čas zálohy se proto nezapíše.
          return false;
        }
      } else {
        downloadFile(filename, text);
      }

      const meta = metaRepo(db);
      await meta.set('lastExportAt', file.exportedAt);
      await meta.set('backupSnoozedUntil', null);

      const subjects = file.subjects.filter((s) => s.deletedAt === null).length;
      const lectures = file.lectures.filter((l) => l.deletedAt === null).length;
      toast(
        `Záloha hotová: ${countOf(subjects, 'předmět', 'předměty', 'předmětů')}, ${countOf(lectures, 'přednáška', 'přednášky', 'přednášek')}`,
      );
      return true;
    },
    [toast],
  );

  const snooze = useCallback(async (): Promise<void> => {
    await metaRepo(db).set('backupSnoozedUntil', snoozeUntil());
  }, []);

  return { exportBackup, snooze };
}
