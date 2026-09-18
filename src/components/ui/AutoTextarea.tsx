import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';
import { cx } from '../tokens';

interface AutoTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Maximální výška v pixelech; nad ní se pole posouvá samo. */
  maxHeight?: number;
}

/**
 * Textové pole, které roste s obsahem. Zápis z přednášky je dlouhý text
 * a psát ho do okénka na tři řádky se scrollbarem je utrpení — hlavně na tabletu.
 */
export function AutoTextarea({ maxHeight = 640, className, value, ...rest }: AutoTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // `value` je záměrná závislost: výšku je potřeba přepočítat po každé změně textu.
  // oxlint-disable-next-line react/exhaustive-deps
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight + 2, maxHeight)}px`;
  }, [value, maxHeight]);

  return (
    <textarea
      ref={ref}
      value={value}
      className={cx(
        'w-full resize-none rounded-xl bg-surface-2 px-3 py-2.5 text-base leading-relaxed text-ink ring-1 ring-line',
        'placeholder:text-muted/70 focus:ring-2 focus:ring-accent focus:outline-none',
        className,
      )}
      {...rest}
    />
  );
}
