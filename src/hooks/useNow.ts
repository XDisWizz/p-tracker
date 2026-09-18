import { useEffect, useState } from 'react';

/**
 * Aktuální čas, obnovovaný každých 20 sekund a hned po návratu do aplikace.
 *
 * Karta „teď / další hodina“ musí sedět i po hodině v kapse: telefon aplikaci
 * na pozadí uspí a časovače zastaví, proto se čas přepočítá i při
 * `visibilitychange`.
 */
export function useNow(intervalMs = 20_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = (): void => setNow(new Date());
    const timer = window.setInterval(tick, intervalMs);
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', tick);
    };
  }, [intervalMs]);

  return now;
}
