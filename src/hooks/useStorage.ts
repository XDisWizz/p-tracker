import { useCallback, useEffect, useState } from 'react';
import { db } from '../db/db';
import { metaRepo } from '../db/meta';

export interface StorageInfo {
  /** Umí prohlížeč o trvalé úložiště vůbec požádat? */
  supported: boolean;
  persisted: boolean;
  usageBytes: number | null;
}

async function readStorageInfo(): Promise<StorageInfo> {
  const storage = navigator.storage as StorageManager | undefined;
  if (storage === undefined || typeof storage.persisted !== 'function') {
    return { supported: false, persisted: false, usageBytes: null };
  }
  const [persisted, estimate] = await Promise.all([
    storage.persisted(),
    typeof storage.estimate === 'function' ? storage.estimate() : Promise.resolve(undefined),
  ]);
  return { supported: true, persisted, usageBytes: estimate?.usage ?? null };
}

export function useStorageInfo(): {
  info: StorageInfo | null;
  requestPersist: () => Promise<boolean>;
} {
  const [info, setInfo] = useState<StorageInfo | null>(null);

  useEffect(() => {
    let active = true;
    void readStorageInfo().then((next) => {
      if (active) setInfo(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const requestPersist = useCallback(async (): Promise<boolean> => {
    const granted = (await navigator.storage?.persist?.()) ?? false;
    await metaRepo(db).set('storagePersistAsked', true);
    setInfo(await readStorageInfo());
    return granted;
  }, []);

  return { info, requestPersist };
}

/**
 * Jakmile v aplikaci vzniknou první data, jednou požádá o trvalé úložiště.
 *
 * Bez něj smí Android při nedostatku místa databázi prohlížeče smazat. Chrome
 * se uživatele neptá — rozhodne podle toho, jak moc stránku používá, a u
 * nainstalované PWA žádosti vyhoví. Ptáme se až s daty, ne hned po otevření,
 * aby prohlížeče, které dialog ukazují, neotravovaly prázdnou aplikací.
 */
export function useAutoPersist(hasData: boolean): void {
  useEffect(() => {
    if (!hasData) return;
    const meta = metaRepo(db);
    void (async () => {
      if ((await meta.get('storagePersistAsked')) === true) return;
      if (typeof navigator.storage?.persist !== 'function') return;
      if (await navigator.storage.persisted()) {
        await meta.set('storagePersistAsked', true);
        return;
      }
      await navigator.storage.persist();
      await meta.set('storagePersistAsked', true);
    })();
  }, [hasData]);
}
