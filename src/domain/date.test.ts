import { describe, expect, it } from 'vitest';
import {
  addDays,
  currentTerm,
  daysBetween,
  formatCsDate,
  formatCsShort,
  isValidIsoDate,
  relativeDays,
  todayIso,
} from './date';

describe('isValidIsoDate', () => {
  it('bere jen tvar YYYY-MM-DD', () => {
    expect(isValidIsoDate('2026-09-21')).toBe(true);
    expect(isValidIsoDate('2026-9-21')).toBe(false);
    expect(isValidIsoDate('21.9.2026')).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
  });

  it('odmítne neexistující dny', () => {
    expect(isValidIsoDate('2026-02-31')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-00-10')).toBe(false);
  });

  it('přestupný rok zná', () => {
    expect(isValidIsoDate('2028-02-29')).toBe(true);
    expect(isValidIsoDate('2027-02-29')).toBe(false);
  });
});

describe('addDays', () => {
  it('přičte týden', () => {
    expect(addDays('2026-09-21', 7)).toBe('2026-09-28');
  });

  it('přeleze přes konec měsíce i roku', () => {
    expect(addDays('2026-09-28', 7)).toBe('2026-10-05');
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
  });

  it('umí i dozadu', () => {
    expect(addDays('2026-01-04', -7)).toBe('2025-12-28');
  });

  it('nerozbije se na přechodu na letní čas', () => {
    // V Evropě se mění čas v noci na 29. 3. 2026. Počítá se v UTC, takže se nemá kam ztratit hodina.
    expect(addDays('2026-03-25', 7)).toBe('2026-04-01');
    expect(addDays('2026-10-21', 7)).toBe('2026-10-28');
  });

  it('přestupný den nepřeskočí', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('daysBetween', () => {
  it('kladné číslo znamená, že druhé datum je později', () => {
    expect(daysBetween('2026-09-21', '2026-09-28')).toBe(7);
    expect(daysBetween('2026-09-28', '2026-09-21')).toBe(-7);
    expect(daysBetween('2026-09-21', '2026-09-21')).toBe(0);
  });
});

describe('todayIso', () => {
  it('bere místní kalendářní datum, ne UTC', () => {
    // Pozdní večer v CEST je v UTC už další den. Uživatel ale vidí na kalendáři 21.
    const evening = new Date(2026, 8, 21, 23, 30);
    expect(todayIso(evening)).toBe('2026-09-21');
  });

  it('doplní nuly na dvě místa', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('formátování', () => {
  it('české datum bez úvodních nul', () => {
    expect(formatCsDate('2026-09-05')).toBe('5. 9. 2026');
  });

  it('krátký tvar se zkratkou dne', () => {
    // 21. 9. 2026 je pondělí
    expect(formatCsShort('2026-09-21')).toBe('po 21. 9.');
  });
});

describe('currentTerm', () => {
  it('od září běží zimní semestr', () => {
    expect(currentTerm(new Date(2026, 8, 15))).toBe('2026/27 ZS');
    expect(currentTerm(new Date(2026, 11, 15))).toBe('2026/27 ZS');
  });

  it('leden ještě patří k zimnímu semestru předchozího roku', () => {
    expect(currentTerm(new Date(2027, 0, 15))).toBe('2026/27 ZS');
  });

  it('od února běží letní semestr', () => {
    expect(currentTerm(new Date(2027, 2, 15))).toBe('2026/27 LS');
    expect(currentTerm(new Date(2027, 5, 15))).toBe('2026/27 LS');
  });
});

describe('relativeDays', () => {
  const today = '2026-09-16';

  it('dnes, včera, zítra', () => {
    expect(relativeDays('2026-09-16', today)).toBe('dnes');
    expect(relativeDays('2026-09-15', today)).toBe('včera');
    expect(relativeDays('2026-09-17', today)).toBe('zítra');
  });

  it('minulost vždy „před N dny“', () => {
    expect(relativeDays('2026-09-14', today)).toBe('před 2 dny');
    expect(relativeDays('2026-09-04', today)).toBe('před 12 dny');
  });

  it('budoucnost skloňuje podle počtu', () => {
    expect(relativeDays('2026-09-19', today)).toBe('za 3 dny');
    expect(relativeDays('2026-09-23', today)).toBe('za 7 dní');
  });

  it('funguje přes přelom měsíce', () => {
    expect(relativeDays('2026-08-31', today)).toBe('před 16 dny');
  });
});
