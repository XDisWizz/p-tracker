import Dexie, { type Table } from 'dexie';
import { ensureIdbCompat } from '../lib/idbCompat';
import type { Id, Lecture, MetaRow, ScheduleSlot, Subject, Term } from '../domain/types';

/** Verze schématu zapisovaná do exportu. Zvyš ji, kdykoliv přibude migrace. */
export const SCHEMA_VERSION = 3;

/** Schéma verze 1 — zachované kvůli testu migrace, ať je jasné, odkud se migruje. */
export const SCHEMA_V1 = {
  subjects: 'id, code, term, sortOrder',
  lectures: 'id, subjectId, status, date, [subjectId+number], *tags',
  meta: 'key',
} as const;

/** Tabulky přidané ve verzi 2 — zachované kvůli testu migrace 2 → 3. */
export const SCHEMA_V2_ADDED = {
  slots: 'id, subjectId, dayOfWeek',
  terms: 'id',
} as const;

/**
 * Poznámka k indexům: IndexedDB neumí jako klíč boolean ani `null`. Proto se
 * `archived` ani `deletedAt` neindexují a filtrují se v paměti. Při řádu stovek
 * záznamů za semestr je to bez měřitelného rozdílu.
 */
export class StudiumDB extends Dexie {
  constructor(name = 'studium-prehled') {
    super(name);

    // Nikdy neupravuj existující verzi — vždy přidej novou s vyšším číslem.
    this.version(1).stores(SCHEMA_V1);

    // v2: rozvrh (slots), období výuky (terms) a zápisky u přednášek.
    this.version(2)
      .stores(SCHEMA_V2_ADDED)
      .upgrade(async (tx) => {
        await tx
          .table<Partial<Lecture>>('lectures')
          .toCollection()
          .modify((lecture) => {
            lecture.slotId ??= null;
            lecture.summary ??= '';
            lecture.focus ??= '';
            lecture.transcript ??= '';
          });
      });

    // v3: termín zkoušky u předmětu. Bez nového indexu — jen doplnění pole.
    this.version(3)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table<Partial<Subject>>('subjects')
          .toCollection()
          .modify((subject) => {
            subject.examDate ??= null;
          });
      });
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

  get slots(): Table<ScheduleSlot, Id> {
    return this.table('slots');
  }

  get terms(): Table<Term, string> {
    return this.table('terms');
  }
}

/** Tabulky, bez kterých aplikace nemůže běžet. */
export const REQUIRED_STORES = ['subjects', 'lectures', 'meta', 'slots', 'terms'] as const;

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
