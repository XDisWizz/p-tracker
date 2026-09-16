/**
 * Kompatibilita s prohlížeči, které IndexedDB 3 implementují jen napůl.
 *
 * Dexie od verze 4.2 zjišťuje nové API podle toho, jestli úložiště má metodu
 * `getAllRecords`, a pak volá `getAll({ query, count, direction })`. Některé
 * buildy Chromia (třeba Thorium) už `getAllRecords` mají, ale `getAll` slovník
 * s volbami ještě neumí a hodí `DataError: The parameter is not a valid key`.
 * Každý dotaz do databáze pak selže a aplikace se nespustí.
 *
 * Řešení: před otevřením databáze nový způsob volání vyzkoušet a pokud nefunguje,
 * `getAllRecords` z prototypů odebrat. Dexie pak použije starší cestu, kterou
 * podporují všechny prohlížeče.
 */

export type IdbCompatResult =
  /** Prohlížeč nové API nemá, není co řešit. */
  | 'not-needed'
  /** Nové API funguje celé. */
  | 'native'
  /** Nové API funguje jen napůl — bylo schováno. */
  | 'patched'
  /** Zkoušku se nepodařilo provést; necháno beze změny. */
  | 'unknown';

interface GetAllCapable {
  getAll: (...args: never[]) => unknown;
}

/**
 * Přijme `getAll` slovník s volbami? Nefunkční implementace ho převádí na klíč
 * a synchronně vyhodí `DataError`.
 */
export function acceptsGetAllOptions(source: GetAllCapable): boolean {
  try {
    (source.getAll as (options: unknown) => unknown)({ query: null, count: 1 });
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'DataError') return false;
    // Jiná chyba (třeba neaktivní transakce) o podpoře nic neříká.
    throw error;
  }
}

/** Odebere `getAllRecords` z prototypů, aby ho Dexie nenašel. */
export function hideIdb3Features(prototypes: readonly object[]): void {
  for (const prototype of prototypes) {
    if ('getAllRecords' in prototype) {
      Reflect.deleteProperty(prototype, 'getAllRecords');
    }
  }
}

const PROBE_DB = '__studium-idb-probe';

/** Zkouška na skutečné dočasné databázi. Volá se jednou, před otevřením aplikační databáze. */
export async function ensureIdbCompat(): Promise<IdbCompatResult> {
  if (typeof indexedDB === 'undefined' || typeof IDBObjectStore === 'undefined') return 'not-needed';
  if (!('getAllRecords' in IDBObjectStore.prototype)) return 'not-needed';

  const supported = await new Promise<boolean | null>((resolve) => {
    let settled = false;
    const finish = (value: boolean | null): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    // Zkouška nesmí nikdy zablokovat start aplikace.
    const timer = setTimeout(() => finish(null), 2000);

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(PROBE_DB, 1);
    } catch {
      clearTimeout(timer);
      finish(null);
      return;
    }

    request.onupgradeneeded = () => {
      try {
        const store = request.result.createObjectStore('probe');
        finish(acceptsGetAllOptions(store));
      } catch {
        finish(null);
      }
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      request.result.close();
      indexedDB.deleteDatabase(PROBE_DB);
      finish(null);
    };
    request.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
    request.onblocked = () => finish(null);
  });

  if (supported === null) return 'unknown';
  if (supported) return 'native';

  hideIdb3Features([IDBObjectStore.prototype, IDBIndex.prototype]);
  return 'patched';
}
