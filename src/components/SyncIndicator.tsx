import { AlertTriangle, Check, CloudOff, LogIn, RefreshCw } from 'lucide-react';
import { useDriveSync } from '../hooks/useDriveSync';
import { describeSyncAge } from '../domain/sync';
import { useNow } from '../hooks/useNow';
import { IconButton } from './ui/Button';
import { cx } from './tokens';

/**
 * Stav synchronizace v hlavičce. Ukazuje se jen když je zapnutá — dokud ji
 * nikdo nepoužívá, nemá v liště co dělat.
 *
 * Zelená fajfka se po chvíli neschovává schválně: „odesláno“ je informace,
 * kterou člověk hledá právě ve chvíli, kdy si není jistý, jestli se něco ztratilo.
 */
export function SyncIndicator({ onOpen }: { onOpen: () => void }) {
  const sync = useDriveSync();
  const now = useNow(30_000);

  if (!sync.enabled) return null;

  const look = {
    idle: { icon: <Check size={18} />, tone: 'text-emerald-600 dark:text-emerald-400', text: 'Sesynchronizováno' },
    syncing: { icon: <RefreshCw size={18} className="animate-spin" />, tone: 'text-accent', text: 'Synchronizuji' },
    'needs-auth': { icon: <LogIn size={18} />, tone: 'text-amber-600 dark:text-amber-400', text: 'Přihlas se znovu' },
    offline: { icon: <CloudOff size={18} />, tone: 'text-muted', text: 'Offline, pošle se později' },
    error: { icon: <AlertTriangle size={18} />, tone: 'text-danger', text: 'Synchronizace se nepovedla' },
    off: null,
    unconfigured: null,
  }[sync.phase];

  if (look === null) return null;

  return (
    <IconButton
      label={`${look.text}. Naposledy ${describeSyncAge(sync.lastSyncAt, now)}. Otevřít nastavení.`}
      onClick={onOpen}
      className={cx(look.tone, 'hover:bg-surface-2')}
    >
      {look.icon}
    </IconButton>
  );
}
