import { useEffect, useRef } from 'react';

/** Handler vrátí `false`, když klávesu nechce — pak zůstane výchozí chování prohlížeče. */
export type HotkeyHandlers = Partial<Record<string, (event: KeyboardEvent) => void | boolean>>;

/** Píše zrovna uživatel do pole? Pak zkratky mlčí, jinak by „n“ nešlo napsat. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Klávesové zkratky pro desktop. Klíčem je hodnota `event.key`, takže `'n'`
 * nebo `'/'`. Ctrl, Alt a Meta se ignorují — Ctrl+N patří prohlížeči a AltGr
 * na české klávesnici se hlásí jako Ctrl+Alt.
 *
 * Pod otevřeným modalem zkratky mlčí: fokus je tam často na tlačítku, ne
 * v poli, a „n“ by jinak otevřelo druhý formulář přes první.
 */
export function useHotkeys(handlers: HotkeyHandlers, enabled = true): void {
  // Handlery se drží v refu, aby se posluchač nepřipojoval znovu při každém překreslení.
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!enabled) return undefined;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target)) return;
      if (document.querySelector('dialog[open]') !== null) return;

      const handler = ref.current[event.key];
      if (handler === undefined) return;
      if (handler(event) === false) return;
      event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
