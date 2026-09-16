import { useEffect } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useToast } from './ui/Toast';

/** Jak často se ptát na novou verzi, když aplikace zůstává otevřená. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * Offline běh a aktualizace.
 *
 * Nová verze se nenasadí sama — uprostřed úpravy přednášky by reload zahodil
 * rozepsaný formulář. Místo toho se ukáže pruh s tlačítkem a o nasazení
 * rozhodne uživatel.
 */
export function UpdatePrompt() {
  const toast = useToast();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration === undefined) return;
      // Nainstalovaná PWA na telefonu může zůstat otevřená dny — kontroluj i průběžně.
      setInterval(() => {
        if (navigator.onLine) void registration.update();
      }, UPDATE_CHECK_MS);
    },
    onRegisterError(error: unknown) {
      console.error('Service worker se nepodařilo zaregistrovat:', error);
    },
  });

  useEffect(() => {
    if (!offlineReady) return;
    toast('Aplikace je připravená i bez internetu');
    setOfflineReady(false);
  }, [offlineReady, setOfflineReady, toast]);

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-3 border-b border-line bg-accent-soft px-3 py-2 text-sm text-ink"
    >
      <RefreshCw size={17} className="shrink-0 text-accent" aria-hidden />
      <p className="min-w-0 flex-1">Je k dispozici nová verze aplikace.</p>
      <button
        type="button"
        onClick={() => void updateServiceWorker(true)}
        className="inline-flex h-11 shrink-0 items-center rounded-xl bg-accent px-3 font-medium text-white sm:h-9"
      >
        Aktualizovat
      </button>
      <button
        type="button"
        aria-label="Teď ne"
        onClick={() => setNeedRefresh(false)}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:text-ink sm:size-9"
      >
        <X size={17} />
      </button>
    </div>
  );
}
