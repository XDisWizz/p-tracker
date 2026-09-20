import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { metaRepo } from '../db/meta';
import { nowIso } from '../domain/date';
import { countOf } from '../domain/plural';
import { driveStore } from '../sync/drive';
import { NeedsSignIn, accessToken, forgetToken, hasToken, revokeAccess } from '../sync/google';
import { googleClientId, setGoogleClientId } from '../sync/config';
import { localFingerprint, rememberSync, syncOnce } from '../sync/engine';
import { useToast } from '../components/ui/Toast';

/**
 * Synchronizace na pozadí.
 *
 * Disk neumí sám od sebe zavolat „něco se změnilo“ — na to by byl potřeba
 * server, který by jeho oznámení poslouchal. K okamžitému přenosu se proto jde
 * z druhé strany: místní změna odchází hned (po krátkém utišení, ať se psaní
 * poznámky neposílá po písmenkách) a na cizí změnu se kouká každých pár vteřin
 * lehkým dotazem na číslo verze souboru. Při návratu do aplikace se kontroluje
 * okamžitě, takže „vezmu telefon a mám to tam“ platí.
 *
 * Když je aplikace schovaná nebo offline, nekouká se vůbec — baterie i data
 * jsou dražší než pár vteřin zpoždění.
 */

/** Jak často se na popředí ptáme, jestli do souboru někdo sáhl. */
const POLL_MS = 10_000;

/** Utišení po místní změně. Delší než psaní slova, kratší než rozmyšlení věty. */
const PUSH_DELAY_MS = 1_500;

export type SyncPhase =
  /** Není zadané id klienta — synchronizace se ani nenabízí. */
  | 'unconfigured'
  /** Nastavená, ale vypnutá. */
  | 'off'
  | 'idle'
  | 'syncing'
  /** Přihlášení vypršelo, je potřeba klepnout na tlačítko. */
  | 'needs-auth'
  | 'offline'
  | 'error';

export interface DriveSync {
  phase: SyncPhase;
  enabled: boolean;
  lastSyncAt: string | null;
  account: string | null;
  error: string | null;
  /** Přihlásí, zapne a hned poprvé sesynchronizuje. Musí vyjít z klepnutí uživatele. */
  connect: () => Promise<void>;
  /** Vypne synchronizaci. `forget` navíc odebere aplikaci přístup u Googlu. */
  disconnect: (forget: boolean) => Promise<void>;
  syncNow: () => Promise<void>;
  /** Uloží id klienta (nebo ho smaže) a zahodí rozpracované přihlášení. */
  configure: (clientId: string | null) => void;
  clientId: string | null;
}

const DriveSyncContext = createContext<DriveSync | null>(null);

export function useDriveSync(): DriveSync {
  const value = useContext(DriveSyncContext);
  if (value === null) throw new Error('useDriveSync mimo DriveSyncProvider.');
  return value;
}

interface SyncMeta {
  enabled: boolean;
  fileId: string | null;
  lastSyncAt: string | null;
  account: string | null;
  version: string | null;
  fingerprint: string | null;
}

const EMPTY_META: SyncMeta = {
  enabled: false,
  fileId: null,
  lastSyncAt: null,
  account: null,
  version: null,
  fingerprint: null,
};

/** Stav, který se mění během běhu. Vypnuto a nenastaveno se dopočítá, ne ukládá. */
type LivePhase = 'idle' | 'syncing' | 'needs-auth' | 'offline' | 'error';

export function DriveSyncProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [clientId, setClientId] = useState<string | null>(() => googleClientId());
  const [livePhase, setLivePhase] = useState<LivePhase>('idle');
  const [error, setError] = useState<string | null>(null);

  const meta = useLiveQuery<SyncMeta>(async () => {
    const repo = metaRepo(db);
    const [enabled, fileId, lastSyncAt, account, version, fingerprint] = await Promise.all([
      repo.get('driveSyncEnabled'),
      repo.get('driveFileId'),
      repo.get('driveLastSyncAt'),
      repo.get('driveAccount'),
      repo.get('driveRemoteVersion'),
      repo.get('driveFingerprint'),
    ]);
    return {
      enabled: enabled ?? false,
      fileId: fileId ?? null,
      lastSyncAt: lastSyncAt ?? null,
      account: account ?? null,
      version: version ?? null,
      fingerprint: fingerprint ?? null,
    };
  }, []);

  const current = meta ?? EMPTY_META;
  const enabled = clientId !== null && current.enabled;

  // Otisk místních dat. Dexie ho přepočítá jen při zápisu a stejná data dají
  // stejný řetězec — díky tomu se synchronizace nezacyklí poté, co do databáze
  // sama zapíše stažené změny.
  const localHash = useLiveQuery(() => (enabled ? localFingerprint(db) : Promise.resolve(null)), [enabled], null);

  const running = useRef(false);
  /** Přišla změna, zatímco se synchronizovalo? Pak se hned po dojetí jede znovu. */
  const again = useRef(false);

  const store = useCallback(
    () => driveStore({ fileId: current.fileId, onFileId: (id) => metaRepo(db).set('driveFileId', id) }),
    [current.fileId],
  );

  const run = useCallback(
    async (mode: 'auto' | 'manual'): Promise<void> => {
      if (googleClientId() === null) return;
      if (running.current) {
        again.current = true;
        return;
      }
      if (!navigator.onLine) {
        setLivePhase('offline');
        return;
      }

      running.current = true;
      setLivePhase('syncing');
      try {
        // Okno s přihlášením smí vyskočit jen z klepnutí uživatele, nikdy na pozadí.
        if (mode === 'manual' && !hasToken()) await accessToken('interactive');

        do {
          again.current = false;
          const remote = store();
          const result = await syncOnce(db, remote, nowIso());

          if (!result.ok) {
            if (result.cause instanceof NeedsSignIn) {
              forgetToken();
              setError(mode === 'manual' ? result.error : null);
              setLivePhase('needs-auth');
            } else {
              setError(result.error);
              setLivePhase('error');
              if (mode === 'manual') toast(result.error);
            }
            return;
          }

          await rememberSync(db, result);
          setError(null);
          setLivePhase('idle');

          const repo = metaRepo(db);
          // Adresa účtu jen na zobrazení — zjistí se jednou a pak se o ni nežádá.
          if ((await repo.get('driveAccount')) == null) {
            const account = await remote.account();
            if (account !== null) await repo.set('driveAccount', account);
          }

          const pulled = result.pulled.added + result.pulled.updated;
          if (pulled > 0) toast(`Staženo z Disku: ${countOf(pulled, 'změna', 'změny', 'změn')}`);
          else if (mode === 'manual') {
            toast(result.status === 'in-sync' ? 'Všechno je sesynchronizované.' : 'Odesláno na Disk.');
          }
        } while (again.current);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Synchronizace selhala.';
        setError(caught instanceof NeedsSignIn && mode === 'auto' ? null : message);
        setLivePhase(caught instanceof NeedsSignIn ? 'needs-auth' : 'error');
        if (mode === 'manual' && !(caught instanceof NeedsSignIn)) toast(message);
      } finally {
        running.current = false;
        again.current = false;
      }
    },
    [store, toast],
  );

  // Místní změna: chvíli počkat (ať se poznámka neposílá po písmenkách) a poslat.
  useEffect(() => {
    if (!enabled || localHash === null || localHash === current.fingerprint) return undefined;
    const timer = window.setTimeout(() => void run('auto'), PUSH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, localHash, current.fingerprint, run]);

  // Cizí změna: lehký dotaz na verzi souboru. Stahuje se, až když se liší.
  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    const peek = async (): Promise<void> => {
      if (cancelled || document.hidden || !navigator.onLine || running.current) return;
      try {
        const version = await store().version();
        if (!cancelled && version !== null && version !== current.version) await run('auto');
      } catch (caught) {
        if (caught instanceof NeedsSignIn) setLivePhase('needs-auth');
      }
    };

    const timer = window.setInterval(() => void peek(), POLL_MS);
    const onVisible = (): void => {
      if (!document.hidden) void peek();
    };
    const onOnline = (): void => void run('auto');
    const onOffline = (): void => setLivePhase('offline');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    void peek();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [enabled, current.version, store, run]);

  const connect = useCallback(async (): Promise<void> => {
    if (googleClientId() === null) return;
    setError(null);
    await accessToken('interactive');
    await metaRepo(db).set('driveSyncEnabled', true);
    await run('manual');
  }, [run]);

  const disconnect = useCallback(async (forget: boolean): Promise<void> => {
    const repo = metaRepo(db);
    await repo.set('driveSyncEnabled', false);
    if (forget) {
      await revokeAccess();
      await repo.set('driveAccount', null);
      await repo.set('driveFileId', null);
      await repo.set('driveRemoteVersion', null);
      await repo.set('driveFingerprint', null);
    } else {
      forgetToken();
    }
    setError(null);
    setLivePhase('idle');
  }, []);

  const syncNow = useCallback(async (): Promise<void> => {
    await run('manual');
  }, [run]);

  const configure = useCallback((value: string | null): void => {
    setGoogleClientId(value);
    forgetToken();
    setClientId(googleClientId());
    setError(null);
    setLivePhase('idle');
  }, []);

  const phase: SyncPhase = clientId === null ? 'unconfigured' : !current.enabled ? 'off' : livePhase;

  const value = useMemo<DriveSync>(
    () => ({
      phase,
      enabled,
      lastSyncAt: current.lastSyncAt,
      account: current.account,
      error,
      connect,
      disconnect,
      syncNow,
      configure,
      clientId,
    }),
    [phase, enabled, current.lastSyncAt, current.account, error, connect, disconnect, syncNow, configure, clientId],
  );

  return <DriveSyncContext.Provider value={value}>{children}</DriveSyncContext.Provider>;
}
