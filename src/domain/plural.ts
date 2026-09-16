/**
 * České skloňování podle počtu: 1 přednáška, 2–4 přednášky, 0 a 5+ přednášek.
 * Jen základní pravidlo — pro čísla, která aplikace ukazuje, stačí.
 */
export function plural(count: number, one: string, few: string, many: string): string {
  const n = Math.abs(count);
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

/** „3 přednášky“ — číslo a správný tvar dohromady. */
export function countOf(count: number, one: string, few: string, many: string): string {
  return `${count} ${plural(count, one, few, many)}`;
}
