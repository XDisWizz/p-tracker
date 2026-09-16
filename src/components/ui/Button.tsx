import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'destructive';
type Size = 'md' | 'sm';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:opacity-90 active:opacity-80',
  secondary: 'bg-surface-2 text-ink ring-1 ring-line hover:bg-line/40',
  ghost: 'text-muted hover:bg-surface-2 hover:text-ink',
  danger: 'text-danger hover:bg-danger/10',
  /** Plné tlačítko pro nevratnější akce, třeba „Nahradit“ při importu. */
  destructive: 'bg-danger text-white hover:opacity-90 active:opacity-80',
};

/* Dotykové cíle: 44 px na výšku je minimum, pod které se nejde dostat. */
const SIZES: Record<Size, string> = {
  md: 'h-11 px-4 text-sm',
  sm: 'h-11 px-3 text-sm sm:h-9',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium',
        'transition-colors disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Povinný — ikona sama o sobě nesdělí nic odečítači obrazovky. */
  label: string;
  variant?: Variant;
}

export function IconButton({ label, variant = 'ghost', className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors',
        'disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  );
}
