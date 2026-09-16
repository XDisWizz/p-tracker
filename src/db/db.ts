import Dexie, { type Table } from 'dexie';
import { ensureIdbCompat } from '../lib/idbCompat';
import type { Id, Lecture, MetaRow, Subject } from '../domain/types';

/** Verze schématu zapisovaná do exportu. Zvyš ji, kdykoliv přibude migrace. */
export const SCHEMA_VERSION = 1;

/**
 * Poznámka k indexům: IndexedDB neumí jako klíč boolean ani `null`. Proto se
 * `archived` ani `deletedAt` neindexují a filtrují se v paměti. Při řádu stovek
 * záznamů za semestr je to bez měřitelného rozdílu.
 */
export class StudiumDB extends Dexie {
  constructor(name = 'studium-prehled') {
    super(name);

    this.version(1).stores({
      subjects: 'id, code, term, sortOrder',
      lectures: 'id, subjectId, status, date, [subjectId+number], *tags',
      meta: 'key',
    });

    /*
     * Vzor pro budoucí změny — nikdy neupravuj blok výše, vždy přidej nový:
     *
     * this.version(2).stores({ lectures: '..., novyIndex' }).upgrade(async (tx) => {
     *   await tx.table<Lecture>('lectures').toCollection().modify((l) => {
     *     l.novePole = vychoziHodnota;
     *   });
     * });
     */
  }

  // Přístup přes gettery místo deklarovaných polí: nezávisí to na nastavení
  // `useDefineForClassFields`, které by jinak Dexie tabulky přepsalo na undefined.
  get subjects(): Table<Subject, Id> {
    return this.table('subjects');
  }

  get lectures(): Table<Lecture, Id> {
    return this.table('lectures');
  }

  get meta(): Table<MetaRow, MetaRow['key']> {
    return this.table('meta');
  }
}

/** Tabulky, bez kterých aplikace nemůže běžet. */
export const REQUIRED_STORES = ['subjects', 'lectures', 'meta'] as const;

/**
 * Otevře databázi a ověří, že v ní jsou tabulky aplikace.
 *
 * Dexie 4 otevře i databázi s vyšší verzí nebo jiným obsahem bez chyby a selže
 * až první dotaz — pro uživatele to vypadá jako aplikace, která probleskne a zmizí.
 */
export async function openVerified(database: StudiumDB): Promise<void> {
  // Musí proběhnout před prvním otevřením — Dexie si podporu API zjišťuje právě při něm.
  const compat = await ensureIdbCompat();
  if (compat === 'patched') {
    console.info('IndexedDB: prohlížeč podporuje getAllRecords jen napůl, používám starší API.');
  }
  await database.open();
  const present = database.backendDB().objectStoreNames;
  const missing = REQUIRED_STORES.filter((name) => !present.contains(name));
  if (missing.length > 0) {
    database.close();
    const error = new Error(`V databázi chybí tabulky: ${missing.join(', ')}.`);
    error.name = 'SchemaMismatchError';
    throw error;
  }
}

/** Sdílená instance pro aplikaci. Testy si vytvářejí vlastní přes `createDb`. */
export const db = new StudiumDB();

/** Izolovaná databáze — každý test si sáhne na svou, ať na sobě nezávisí. */
export function createDb(name: string): StudiumDB {
  return new StudiumDB(name);
}

export function newId(): Id {
  return crypto.randomUUID();
}
