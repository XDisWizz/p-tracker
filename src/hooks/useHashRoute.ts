import { useCallback, useEffect, useState } from 'react';
import { EMPTY_FILTER, type LectureFilter } from '../domain/filter';
import { isLectureStatus } from '../domain/status';
import type { Id } from '../domain/types';

/**
 * Směrování přes hash. Důvod není šetření závislostí, ale GitHub Pages:
 * statický hosting neumí přesměrovat `/predmety/abc` na index.html, takže
 * hluboké odkazy s běžným routerem končí na 404. S hashem ten problém neexistuje.
 *
 *   #/                         Co mě čeká
 *   #/?q=limity&s=summary      Co mě čeká s filtrem (přežije reload i sdílení odkazu)
 *   #/predmety                 seznam předmětů
 *   #/predmety/<id>            detail předmětu
 *   #/nastaveni                záloha, úložiště, vzhled
 */
export type Route =
  | { name: 'upNext'; filter: LectureFilter }
  | { name: 'subjects' }
  | { name: 'subject'; id: Id }
  | { name: 'settings' };

export const DEFAULT_ROUTE: Route = { name: 'upNext', filter: EMPTY_FILTER };

/* Krátké klíče, ať adresa zůstane čitelná i na telefonu. */
const KEY_QUERY = 'q';
const KEY_SUBJECT = 'p';
const KEY_STATUS = 's';
const KEY_TAG = 't';

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // Ručně upravená adresa s rozbitým `%` nemá shodit aplikaci.
    return value;
  }
}

export function filterFromSearch(search: string): LectureFilter {
  const params = new URLSearchParams(search);
  const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))];
  return {
    query: params.get(KEY_QUERY) ?? '',
    subjectIds: unique(params.getAll(KEY_SUBJECT)),
    // Neznámé stavy se zahodí — adresa je vstup od uživatele, ne důvěryhodná data.
    statuses: unique(params.getAll(KEY_STATUS)).filter(isLectureStatus),
    tags: unique(params.getAll(KEY_TAG)),
  };
}

/** Opakované klíče místo čárek — tag s čárkou by jinak adresu rozbil. */
export function filterToSearch(filter: LectureFilter): string {
  const params = new URLSearchParams();
  if (filter.query !== '') params.set(KEY_QUERY, filter.query);
  for (const id of filter.subjectIds) params.append(KEY_SUBJECT, id);
  for (const status of filter.statuses) params.append(KEY_STATUS, status);
  for (const tag of filter.tags) params.append(KEY_TAG, tag);
  return params.toString();
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const questionMark = raw.indexOf('?');
  const path = questionMark === -1 ? raw : raw.slice(0, questionMark);
  const search = questionMark === -1 ? '' : raw.slice(questionMark + 1);

  const [first, second] = path.split('/').filter(Boolean).map(safeDecode);

  if (first === 'predmety') {
    return second === undefined ? { name: 'subjects' } : { name: 'subject', id: second };
  }
  if (first === 'nastaveni') return { name: 'settings' };
  if (first === undefined) return { name: 'upNext', filter: filterFromSearch(search) };
  return DEFAULT_ROUTE;
}

export function buildHash(route: Route): string {
  switch (route.name) {
    case 'upNext': {
      const search = filterToSearch(route.filter);
      return search === '' ? '#/' : `#/?${search}`;
    }
    case 'subjects':
      return '#/predmety';
    case 'subject':
      return `#/predmety/${encodeURIComponent(route.id)}`;
    case 'settings':
      return '#/nastaveni';
  }
}

export interface Router {
  route: Route;
  /** Přidá položku do historie — tlačítko Zpět pak funguje, jak uživatel čeká. */
  go: (route: Route) => void;
  /** Nahradí aktuální položku. Pro psaní do hledání — jinak by každé písmeno bylo krokem zpět. */
  replace: (route: Route) => void;
  back: () => void;
}

export function useHashRoute(): Router {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHashChange = (): void => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const go = useCallback((next: Route): void => {
    const hash = buildHash(next);
    if (window.location.hash === hash) return;
    window.location.hash = hash;
  }, []);

  const replace = useCallback((next: Route): void => {
    window.history.replaceState(null, '', buildHash(next));
    setRoute(next);
  }, []);

  const back = useCallback((): void => {
    window.history.back();
  }, []);

  return { route, go, replace, back };
}
