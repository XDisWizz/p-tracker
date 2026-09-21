/**
 * Datové typy aplikace.
 *
 * Dvě pravidla, která platí bez výjimky pro všechno, co se ukládá do databáze:
 *
 * 1. Žádné volitelné vlastnosti (`foo?: string`). Místo nich `foo: string | null`.
 *    Důvod: `JSON.stringify` klíče s hodnotou `undefined` mlčky zahodí, takže by
 *    export → import přestal být identita a testy round-tripu by lhaly.
 *
 * 2. Identifikátory jsou UUID, nikdy pořadová čísla. Bez toho by sloučení dat
 *    ze dvou zařízení překrylo úplně nesouvisející záznamy.
 */

/** Identifikátor záznamu, `crypto.randomUUID()`. */
export type Id = string;

/** Kalendářní datum `YYYY-MM-DD` — bez času a bez časové zóny. */
export type IsoDate = string;

/** Okamžik v čase, ISO 8601 v UTC, např. `2026-09-15T08:21:00.000Z`. */
export type IsoDateTime = string;

/**
 * Stav zpracování přednášky.
 *
 * Prvních pět tvoří lineární pipeline. `skipped` stojí mimo ni: přednáška,
 * kterou vědomě neřeším (třeba si u ní nedělám kartičky), se nemá objevovat
 * v „Co mě čeká“ ani kazit procenta hotového.
 */
export const LECTURE_STATUSES = [
  'not_started',
  'materials',
  'summary',
  'flashcards',
  'tested',
  'skipped',
] as const;

export type LectureStatus = (typeof LECTURE_STATUSES)[number];

/** Klíče do palety. Záměrně ne hex — barva se musí umět přizpůsobit tmavému režimu. */
export const SUBJECT_COLORS = [
  'sky',
  'emerald',
  'amber',
  'rose',
  'violet',
  'teal',
  'orange',
  'indigo',
] as const;

export type SubjectColor = (typeof SUBJECT_COLORS)[number];

/** Kdy přednáška poprvé dosáhla kterého stavu. Zapisuje se automaticky při přepnutí. */
export type StatusTimestamps = Partial<Record<LectureStatus, IsoDateTime>>;

export interface Subject {
  id: Id;
  /** Plný název, např. „Základy matematické analýzy“. */
  name: string;
  /** Zkratka, např. „ZMA“. */
  code: string;
  /** Akademický rok a semestr, např. „2025/26 ZS“. */
  term: string;
  color: SubjectColor;
  /** Odkaz na stránku předmětu v LMS. */
  lmsUrl: string | null;
  /** Předvyplní se nové přednášce, když ji není odkud zdědit. */
  defaultLecturer: string | null;
  /** Termín zkoušky (nebo zápočtu), na který se chystám. Od schématu 3. */
  examDate: IsoDate | null;
  /** Předmět z uzavřeného semestru — zmizí z hlavní obrazovky, data zůstanou. */
  archived: boolean;
  sortOrder: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  /** Tombstone. Nenulová hodnota = smazáno; záznam zůstává kvůli budoucí synchronizaci a funkci Zpět. */
  deletedAt: IsoDateTime | null;
}

export interface Lecture {
  id: Id;
  subjectId: Id;
  /** Pořadové číslo v rámci předmětu. Nemusí být souvislé. */
  number: number;
  /** Smí být prázdný — UI pak zobrazí „5. přednáška“. Bez toho by přidání nebylo na dva kliky. */
  title: string;
  date: IsoDate | null;
  lecturer: string | null;
  hasSlides: boolean;
  hasTranscript: boolean;
  status: LectureStatus;
  statusAt: StatusTimestamps;
  note: string;
  /** Odkaz na složku nebo soubor s podklady. */
  url: string | null;
  tags: string[];
  /** Hodina rozvrhu, ze které přednáška vznikla. `null` = přidaná ručně. */
  slotId: Id | null;
  /** Co se probíralo — ukáže se jako „minule“ u další přednášky. */
  summary: string;
  /** Na co se zaměřit: důležité pro zkoušku, co doučit. */
  focus: string;
  /** Přepis přednášky. Může být dlouhý (desítky kB). */
  transcript: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  deletedAt: IsoDateTime | null;
}

/** Čas ve tvaru `HH:MM`, 24hodinový. */
export type TimeOfDay = string;

export const SLOT_KINDS = ['lecture', 'exercise', 'lab', 'seminar', 'other'] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];

/**
 * Ve kterých týdnech výuky se hodina koná. Počítá se od začátku výuky
 * v semestru: 1. týden je lichý.
 */
export const WEEK_PARITIES = ['every', 'odd', 'even'] as const;
export type WeekParity = (typeof WEEK_PARITIES)[number];

/** Jedna pravidelná hodina v rozvrhu — třeba „ZMA přednáška, po 9:00–10:30, NA-A01“. */
export interface ScheduleSlot {
  id: Id;
  subjectId: Id;
  kind: SlotKind;
  /** 1 = pondělí … 7 = neděle (ISO). */
  dayOfWeek: number;
  start: TimeOfDay;
  end: TimeOfDay;
  room: string;
  teacher: string | null;
  parity: WeekParity;
  /**
   * Jen od tohoto týdne výuky (včetně), `null` = od začátku. Pro hodiny, které
   * neběží celý semestr — třeba cvičení 1.–7. týden a laboratoře 8.–13. týden.
   */
  weekFrom: number | null;
  /** Jen do tohoto týdne výuky (včetně), `null` = do konce semestru. */
  weekTo: number | null;
  note: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  deletedAt: IsoDateTime | null;
}

/**
 * Období výuky jednoho semestru. `id` je stejný řetězec jako `Subject.term`
 * („2026/27 ZS“), takže se předmět se semestrem páruje bez dalšího klíče.
 */
export interface Term {
  id: string;
  teachingStart: IsoDate;
  teachingEnd: IsoDate;
  /** Dny bez výuky — státní svátky, rektorské volno. Hodiny v nich odpadají. */
  skipDates: IsoDate[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  deletedAt: IsoDateTime | null;
}

/** Pole, která při zakládání záznamu dodává uživatel; zbytek doplní datová vrstva. */
export type SubjectInput = Omit<Subject, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
export type SubjectPatch = Partial<SubjectInput>;

export type LectureInput = Omit<
  Lecture,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'statusAt'
>;
export type LecturePatch = Partial<LectureInput>;

export type SlotInput = Omit<ScheduleSlot, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
export type SlotPatch = Partial<SlotInput>;

export type TermInput = Omit<Term, 'createdAt' | 'updatedAt' | 'deletedAt'>;

/** Řádek tabulky `meta`. Typované čtení a zápis zajišťuje `db/meta.ts`. */
export interface MetaShape {
  /** Verze schématu naposledy zapsaná aplikací. Kontroluje se při importu. */
  schemaVersion: number;
  /** Kdy naposledy proběhl export. Podklad pro připomínku zálohy. */
  lastExportAt: IsoDateTime | null;
  /** Bylo uživateli nabídnuto trvalé úložiště? */
  storagePersistAsked: boolean;
  /** Do kdy je připomínka zálohy odložená tlačítkem „Později“. */
  backupSnoozedUntil: IsoDateTime | null;
  /** Zapnutá průběžná synchronizace s Google Diskem. */
  driveSyncEnabled: boolean;
  /** Id souboru se zálohou na Disku. Drží se, aby se nemusel hledat podle názvu. */
  driveFileId: string | null;
  /** Kdy naposledy proběhla úspěšná synchronizace. */
  driveLastSyncAt: IsoDateTime | null;
  /** Verze souboru na Disku, kterou tohle zařízení naposledy vidělo. */
  driveRemoteVersion: string | null;
  /** Otisk dat po poslední synchronizaci — podle něj se pozná změna bez stahování. */
  driveFingerprint: string | null;
  /** Účet, ke kterému je synchronizace připojená. Jen na zobrazení. */
  driveAccount: string | null;
}

export interface MetaRow {
  key: keyof MetaShape;
  value: MetaShape[keyof MetaShape];
}
