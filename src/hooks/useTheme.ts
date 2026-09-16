import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';

/** S předponou: všechny projekty na <uzivatel>.github.io sdílejí jedno localStorage. */
const STORAGE_KEY = 'studium-prehled:theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function readStored(): ThemeChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'light' || raw === 'dark' ? raw : 'system';
  } catch {
    // Soukromý režim může úložiště zakázat. Není to chyba, jen to znamená „systémové“.
    return 'system';
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

export interface Theme {
  choice: ThemeChoice;
  /** Co je skutečně vidět po vyhodnocení systémového nastavení. */
  resolved: 'light' | 'dark';
  setChoice: (choice: ThemeChoice) => void;
  /** Přepnutí dokola: systém → světlé → tmavé → systém. */
  cycle: () => void;
}

export function useTheme(): Theme {
  const [choice, setChoiceState] = useState<ThemeChoice>(readStored);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Když je vybrané „podle systému“, musí se přepnout i za běhu — Android přepíná
  // tmavý režim podle času a appka může být zrovna otevřená.
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent): void => setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolved: 'light' | 'dark' =
    choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);

  const setChoice = useCallback((next: ThemeChoice): void => {
    setChoiceState(next);
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Volba pak nepřežije zavření karty. Aplikaci to nerozbije.
    }
  }, []);

  const cycle = useCallback((): void => {
    setChoiceState((current) => {
      const next: ThemeChoice =
        current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
      try {
        if (next === 'system') localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* viz výše */
      }
      return next;
    });
  }, []);

  return { choice, resolved, setChoice, cycle };
}
