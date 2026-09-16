import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export interface ToastAction {
  label: string;
  /** Návratová hodnota se zahazuje — akce se volá pro její vedlejší efekt. */
  run: () => void | Promise<unknown>;
}

interface ToastItem {
  id: number;
  message: string;
  action: ToastAction | null;
}

type ShowToast = (message: string, action?: ToastAction) => void;

const ToastContext = createContext<ShowToast | null>(null);

/** Vrátí funkci na zobrazení hlášky. Bez Provideru nad sebou schválně spadne. */
export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (show === null) throw new Error('useToast vyžaduje ToastProvider.');
  return show;
}

/** Jak dlouho je vidět hláška s tlačítkem Zpět. Kratší čas na vrácení smazání nestačí. */
const WITH_ACTION_MS = 8000;
const PLAIN_MS = 3500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number): void => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const show = useCallback<ShowToast>(
    (message, action) => {
      nextId.current += 1;
      const id = nextId.current;
      setItems((current) => [...current, { id, message, action: action ?? null }]);
      window.setTimeout(() => dismiss(id), action === undefined ? PLAIN_MS : WITH_ACTION_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        // `polite` — hláška nemá přerušit to, co uživatel zrovna dělá.
        aria-live="polite"
        // Na úzkém displeji sedí nad spodní navigací (4rem), od `lg` ji aplikace nemá.
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 p-3 lg:bottom-0"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl bg-ink px-4 py-2.5 text-sm text-canvas shadow-lg"
          >
            <span className="min-w-0 flex-1">{item.message}</span>
            {item.action !== null && (
              // Vlastní tlačítko místo <Button>: barva varianty by se s inverzní
              // barvou toastu přetahovala a výsledek by závisel na pořadí v CSS.
              <button
                type="button"
                className="-mr-2 inline-flex h-11 shrink-0 items-center rounded-lg px-3 font-semibold text-accent-soft underline-offset-2 hover:underline sm:h-9"
                onClick={() => {
                  void item.action?.run();
                  dismiss(item.id);
                }}
              >
                {item.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
