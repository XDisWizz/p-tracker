import type { ReactNode } from 'react';
import { cx } from '../tokens';

interface ChipProps {
  pressed: boolean;
  onToggle: () => void;
  children: ReactNode;
  /** Třídy pro zapnutý stav — třeba barva předmětu. Výchozí je akcent. */
  pressedClassName?: string;
}

/** Přepínací štítek ve filtru. `aria-pressed` řekne odečítači, že jde o přepínač. */
export function Chip({ pressed, onToggle, children, pressedClassName }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cx(
        'inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm ring-1 transition-colors sm:h-9',
        pressed
          ? cx('font-medium ring-transparent', pressedClassName ?? 'bg-accent text-white')
          : 'bg-surface text-ink ring-line hover:bg-surface-2',
      )}
    >
      {children}
    </button>
  );
}
