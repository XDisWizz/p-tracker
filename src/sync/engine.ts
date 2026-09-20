import type { StudiumDB } from '../db/db';
import {
  applyImport,
  contentFingerprint,
  exportAll,
  parseExportText,
  serializeExport,
  type ExportFile,
} from '../db/transfer';
import { metaRepo } from '../db/meta';
import { nowIso } from '../domain/date';
import type { IsoDateTime } from '../domain/types';

/**
 * Jádro synchronizace. Neví nic o Googlu ani o síti — mluví jen přes `RemoteStore`,
 * takže se dá celé otestovat proti úložišti v paměti.
 *
 * Postup je schválně hloupý a bezpečný: stáhni, slouč podle `updatedAt`, a když
 * se výsledek liší od toho na druhé straně, pošli ho zpátky. Žádná strana nikdy
 * nemaže záznamy té druhé — mazání se přenáší jako tombstone (`deletedAt`),
 * stejně jako při ručním importu zálohy.
 */

export interface RemoteFile {
  /** Neprůhledné označení verze. Mění se s každým zápisem. */
  version: string;
  text: string;
}

export type WriteResult =
  | { ok: true; version: string }
  /** Soubor se mezitím změnil z jiného zařízení — je potřeba slučovat znovu. */
  | { ok: false; reason: 'conflict' };

export interface RemoteStore {
  /** Verze bez stahování obsahu. `null` = soubor ještě neexistuje. */
  version(): Promise<string | null>;
  read(): Promise<RemoteFile | null>;
  write(text: string, expected: string | null): Promise<WriteResult>;
}

export type SyncStatus =
  /** Obě strany mají totéž, nic se nedělo. */
  | 'in-sync'
  /** Přišly změny odjinud. */
  | 'pulled'
  /** Odešly místní změny. */
  | 'pushed'
  /** Obojí najednou. */
  | 'merged'
  /** První nahrání — soubor na Disku zatím nebyl. */
  | 'created';

export type SyncErrorKind =
  /** Na Disku leží něco, co není záloha téhle aplikace, nebo je poškozená. */
  | 'remote-invalid'
  /** Opakovaně se do toho pletlo jiné zařízení. */
  | 'conflict'
  /** Síť, token, kvóta — cokoliv, co přišlo zvenčí. */
  | 'remote-failed';

export interface SyncChanges {
  added: number;
  updated: number;
}

export type SyncResult =
  | {
      ok: true;
      status: SyncStatus;
      /** Co přibylo nebo se změnilo tady po stažení. */
      pulled: SyncChanges;
      version: string;
      fingerprint: string;
      at: IsoDateTime;
    }
  | { ok: false; kind: SyncErrorKind; error: string; cause?: unknown };

/** Kolikrát zkusit znovu, když do souboru zapsalo jiné zařízení mezi čtením a zápisem. */
const MAX_ATTEMPTS = 3;

function countPulled(plan: {
  subjects: { added: number; updated: number };
  lectures: { added: number; updated: number };
  slots: { added: number; updated: number };
  terms: { added: number; updated: number };
}): SyncChanges {
  const parts = [plan.subjects, plan.lectures, plan.slots, plan.terms];
  return {
    added: parts.reduce((sum, part) => sum + part.added, 0),
    updated: parts.reduce((sum, part) => sum + part.updated, 0),
  };
}

function statusOf(pulled: SyncChanges, pushed: boolean): SyncStatus {
  const changedHere = pulled.added + pulled.updated > 0;
  if (changedHere && pushed) return 'merged';
  if (changedHere) return 'pulled';
  return pushed ? 'pushed' : 'in-sync';
}

async function pushLocal(
  db: StudiumDB,
  remote: RemoteStore,
  expected: string | null,
): Promise<{ file: ExportFile; write: WriteResult }> {
  const file = await exportAll(db);
  return { file, write: await remote.write(serializeExport(file), expected) };
}

/**
 * Jedno kolo synchronizace. Vrací výsledek i při chybě — synchronizace na
 * pozadí nesmí shodit aplikaci kvůli vypadlé síti.
 */
export async function syncOnce(db: StudiumDB, remote: RemoteStore, now: IsoDateTime = nowIso()): Promise<SyncResult> {
  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const found = await remote.read();

      // Na Disku nic není: první nahrání. Žádné slučování, nic se nepřepisuje.
      if (found === null) {
        const { file, write } = await pushLocal(db, remote, null);
        if (!write.ok) continue;
        return {
          ok: true,
          status: 'created',
          pulled: { added: 0, updated: 0 },
          version: write.version,
          fingerprint: contentFingerprint(file),
          at: now,
        };
      }

      const parsed = parseExportText(found.text);
      if (!parsed.ok) {
        // Radši se zastavit než přepsat cizí soubor. Uživatel to musí rozseknout.
        return { ok: false, kind: 'remote-invalid', error: parsed.error };
      }

      const remoteFingerprint = contentFingerprint(parsed.file);
      const mineFingerprint = contentFingerprint(await exportAll(db));

      // Nejčastější případ: obě strany mají totéž. Nezapisuje se ani do databáze —
      // zbytečný zápis by znovu probudil sledování změn a synchronizace by se točila dokola.
      if (remoteFingerprint === mineFingerprint) {
        return {
          ok: true,
          status: 'in-sync',
          pulled: { added: 0, updated: 0 },
          version: found.version,
          fingerprint: mineFingerprint,
          at: now,
        };
      }

      const plan = await applyImport(db, parsed.file, 'merge-newer', now);
      const pulled = countPulled(plan);

      const merged = await exportAll(db);
      const mergedFingerprint = contentFingerprint(merged);
      if (mergedFingerprint === remoteFingerprint) {
        // Stáhlo se všechno, co jsme neměli, a nic navíc tady nebylo.
        return {
          ok: true,
          status: statusOf(pulled, false),
          pulled,
          version: found.version,
          fingerprint: mergedFingerprint,
          at: now,
        };
      }

      const write = await remote.write(serializeExport(merged), found.version);
      if (!write.ok) continue; // někdo byl rychlejší, slučujeme znovu nad jeho verzí
      return {
        ok: true,
        status: statusOf(pulled, true),
        pulled,
        version: write.version,
        fingerprint: mergedFingerprint,
        at: now,
      };
    }

    return {
      ok: false,
      kind: 'conflict',
      error: 'Soubor na Disku se pořád mění z jiného zařízení. Zkus to za chvíli znovu.',
    };
  } catch (error) {
    // `cause` si nese původní chybu — podle ní se pozná vypršelé přihlášení.
    return { ok: false, kind: 'remote-failed', error: describe(error), cause: error };
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Synchronizace selhala z neznámého důvodu.';
}

/** Otisk dat v databázi. Sledováním téhle hodnoty se pozná, že je co posílat. */
export async function localFingerprint(db: StudiumDB): Promise<string> {
  return contentFingerprint(await exportAll(db));
}

/** Zápis stavu po úspěšné synchronizaci. Nastavení se nesynchronizuje, je místní. */
export async function rememberSync(db: StudiumDB, result: Extract<SyncResult, { ok: true }>): Promise<void> {
  const meta = metaRepo(db);
  await meta.set('driveLastSyncAt', result.at);
  await meta.set('driveRemoteVersion', result.version);
  await meta.set('driveFingerprint', result.fingerprint);
}
