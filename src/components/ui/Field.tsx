import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from '../tokens';

const CONTROL =
  'w-full rounded-xl bg-surface-2 px-3 text-base text-ink ring-1 ring-line ' +
  'placeholder:text-muted/70 focus:ring-2 focus:ring-accent focus:outline-none';

interface FieldProps {
  label: string;
  /** Doplňující informace pod polem — třeba proč je něco nepovinné. */
  hint?: string;
  children: (id: string) => ReactNode;
}

export function Field({ label, hint, children }: FieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-muted">
        {label}
      </label>
      {children(id)}
      {hint !== undefined && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  // Výška 44 px a `text-base` — menší písmo než 16 px nutí Safari na iOS přiblížit stránku.
  return <input className={cx(CONTROL, 'h-11', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(CONTROL, 'min-h-24 py-2.5', className)} {...rest} />;
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(CONTROL, 'h-11', className)} {...rest} />;
}

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

/** Zaškrtávátko s celým řádkem jako dotykovým cílem. */
export function Checkbox({ label, className, ...rest }: CheckboxProps) {
  return (
    <label
      className={cx(
        'flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3',
        'bg-surface-2 ring-1 ring-line',
        className,
      )}
    >
      <input type="checkbox" className="size-5 accent-[var(--color-accent)]" {...rest} />
      <span className="text-sm">{label}</span>
    </label>
  );
}
