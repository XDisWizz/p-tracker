import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';
import { IconButton } from './Button';
import { cx } from '../tokens';

interface MenuProps {
  label: string;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
}

/**
 * Malá nabídka u řádku. Zavírá se kliknutím mimo, Escapem i po volbě položky.
 *
 * Ovládání z klávesnice podle vzoru WAI-ARIA „menu button“: po otevření dostane
 * fokus první položka, šipky mezi položkami chodí dokola, Home/End skočí na
 * kraj a Escape nabídku zavře a vrátí fokus na tlačítko.
 */
export function Menu({ label, children, align = 'right' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return undefined;
    const items = (): HTMLElement[] =>
      Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    items()[0]?.focus();

    const onPointerDown = (event: PointerEvent): void => {
      if (root.current !== null && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
        return;
      }
      if (event.key === 'Tab') {
        // Tab z nabídky ven ji zavře, ať nevisí otevřená bez fokusu.
        setOpen(false);
        return;
      }
      const all = items();
      if (all.length === 0) return;
      const current = all.indexOf(document.activeElement as HTMLElement);
      let next: number | null = null;
      if (event.key === 'ArrowDown') next = (current + 1) % all.length;
      else if (event.key === 'ArrowUp') next = (current - 1 + all.length) % all.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = all.length - 1;
      if (next === null) return;
      event.preventDefault();
      all[next]?.focus();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <IconButton
        ref={trigger}
        label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          // Šipka dolů na zavřeném tlačítku nabídku otevře, jako v nativních nabídkách.
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <MoreVertical size={18} />
      </IconButton>

      {open && (
        <div
          ref={list}
          id={id}
          role="menu"
          aria-label={label}
          className={cx(
            'absolute z-30 mt-1 min-w-52 overflow-hidden rounded-xl bg-surface py-1 shadow-xl ring-1 ring-line',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

interface MenuItemProps {
  onSelect: () => void;
  children: ReactNode;
  icon?: ReactNode;
  danger?: boolean;
  /** Zvýrazní aktuálně platnou volbu, například nastavený stav. */
  active?: boolean;
}

export function MenuItem({ onSelect, children, icon, danger = false, active = false }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      className={cx(
        'flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm transition-colors',
        danger ? 'text-danger hover:bg-danger/10' : 'text-ink hover:bg-surface-2',
        active && 'bg-accent-soft',
      )}
    >
      {icon !== undefined && <span className="shrink-0 text-muted">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-line" role="separator" />;
}
