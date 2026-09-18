import { useEffect, useEffectEvent, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './Button';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Patička s tlačítky. Na mobilu zůstává přilepená dole. */
  footer?: ReactNode;
}

/**
 * Postavené na nativním `<dialog>`. Prohlížeč tím zadarmo řeší zachycení fokusu,
 * zavření Escapem i zablokování obsahu pod ním — ručně psané modály tohle
 * skoro vždycky mají rozbité.
 *
 * Na úzkém displeji vyjíždí zespodu jako sheet, na širokém je to karta uprostřed.
 */
export function Modal({ open, title, onClose, children, footer }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      dialog.showModal();
      focusInitial(dialog);
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Vždy aktuální obsluha, aniž by se posluchače při každém překreslení přepojovaly.
  const requestClose = useEffectEvent((): void => onClose());

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return undefined;

    // Nativní cesta: Escape nad modálním <dialog> spustí `cancel`. Necháváme si
    // zavření na starosti sami, aby o něm věděl i React.
    const onCancel = (event: Event): void => {
      event.preventDefault();
      requestClose();
    };

    // Záloha pro případy, kdy se `cancel` nespustí — Escape je vyžadovaná
    // zkratka a nesmí záviset na tom, jestli ho prohlížeč vyhodnotí jako
    // požadavek na zavření.
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !dialog.open) return;
      event.preventDefault();
      event.stopPropagation();
      requestClose();
    };

    dialog.addEventListener('cancel', onCancel);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);

  return (
    <dialog ref={ref} aria-label={title}>
      <div className="flex h-full w-full items-end justify-center sm:items-center sm:p-6">
        {/* Kliknutí mimo kartu zavírá. Uvnitř se klik nešíří dál. */}
        <button
          type="button"
          aria-label="Zavřít"
          tabIndex={-1}
          className="absolute inset-0 cursor-default"
          onClick={onClose}
        />
        <div
          data-modal-card
          tabIndex={-1}
          className="relative flex max-h-[90dvh] w-full flex-col rounded-t-2xl bg-surface shadow-xl outline-none sm:max-w-lg sm:rounded-2xl"
          role="document"
        >
          <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="text-base font-semibold">{title}</h2>
            <IconButton label="Zavřít" onClick={onClose}>
              <X size={20} />
            </IconButton>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>

          {footer !== undefined && (
            <footer className="flex items-center justify-end gap-2 border-t border-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {footer}
            </footer>
          )}
        </div>
      </div>
    </dialog>
  );
}

/**
 * Úvodní fokus v modalu.
 *
 * React atribut `autoFocus` do DOM nezapisuje, takže nativní `<dialog>` o něm
 * neví a zaměří první tlačítko v pořadí — tady neviditelnou plochu na zavření.
 * Proto si to řídíme sami přes `data-autofocus`:
 *
 *   data-autofocus="always"  vždy (tlačítka — nevyvolají klávesnici)
 *   data-autofocus           jen s myší; na dotykovém zařízení by vyskočila
 *                            klávesnice a zakryla tlačítko Přidat
 *
 * Bez kandidáta dostane fokus karta sama, aby Escape i Tab fungovaly odtud.
 */
function focusInitial(dialog: HTMLDialogElement): void {
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const target =
    dialog.querySelector<HTMLElement>('[data-autofocus="always"]') ??
    (finePointer ? dialog.querySelector<HTMLElement>('[data-autofocus]') : null) ??
    dialog.querySelector<HTMLElement>('[data-modal-card]');
  target?.focus();
}
