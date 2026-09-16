import { describe, expect, it } from 'vitest';
import { countOf, plural } from './plural';

describe('plural', () => {
  it('rozliší jeden, pár a mnoho', () => {
    const forms = ['předmět', 'předměty', 'předmětů'] as const;
    expect(plural(1, ...forms)).toBe('předmět');
    expect(plural(3, ...forms)).toBe('předměty');
    expect(plural(5, ...forms)).toBe('předmětů');
    expect(plural(0, ...forms)).toBe('předmětů');
  });

  it('countOf spojí číslo a tvar', () => {
    expect(countOf(2, 'přednáška', 'přednášky', 'přednášek')).toBe('2 přednášky');
  });
});
