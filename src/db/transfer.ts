import type { StudiumDB } from './db';
import { SCHEMA_VERSION } from './db';
import { metaRepo } from './meta';
import { nowIso, todayIso } from '../domain/date';
import { isLectureStatus } from '../domain/status';
import {
  SLOT_KINDS,
  SUBJECT_COLORS,
  WEEK_PARITIES,
  type Id,
  type IsoDateTime,
  type Lecture,
  type ScheduleSlot,
  type StatusTimestamps,
  type Subject,
  type Term,
} from '../domain/types';

export const EXPORT_FORMAT = 'studium-prehled';

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  schemaVersion: number;
  exportedAt: IsoDateTime;
  /** Včetně tombstones — jinak by se smazání nepřeneslo na druhé zařízení. */
  subjects: Subject[];
  lectures: Lecture[];
  /** Od schématu 2. Starší zálohy je nemají, při čtení se doplní prázdné. */
  slots: ScheduleSlot[];
  terms: Term[];
}

export type ImportMode =
  /** Zahodit všechno místní a vzít soubor tak, jak je. */
  | 'replace'
  /** Sloučit podle id; při rozporu vyhrává novější `updatedAt`. */
  | 'merge-newer'
  /** Sloučit podle id; při rozporu vyhrává to, co mám tady. */
  | 'merge-keep-mine';

export interface EntityDiff {
  added: number;
  updated: number;
  unchanged: number;
  /** Jen u režimu `replace`: kolik místních záznamů soubor neobsahuje a zmizí. */
  removed: number;
}

export interface ImportPlan {
  mode: ImportMode;
  subjects: EntityDiff;
  lectures: EntityDiff;
  slots: EntityDiff;
  terms: EntityDiff;
  /** Záznamy existující na obou stranách s odlišným obsahem. */
  conflicts: number;
}

export type ParseResult = { ok: true; file: ExportFile } | { ok: false; error: string };

/* ---------- validace ---------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNullableStr = (v: unknown): v is string | null => v === null || typeof v === 'string';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const oneOf = <T extends string>(values: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (values as readonly string[]).includes(v);

function hasTimestamps(raw: Record<string, unknown>): boolean {
  return isStr(raw['createdAt']) && isStr(raw['updatedAt']) && isNullableStr(raw['deletedAt']);
}

function parseSubject(raw: unknown, index: number): Subject | string {
  if (!isRecord(raw)) return `Předmět #${index} není objekt.`;
  if (
    !isStr(raw['id']) ||
    !isStr(raw['name']) ||
    !isStr(raw['code']) ||
    !isStr(raw['term']) ||
    !oneOf(SUBJECT_COLORS, raw['color']) ||
    !isNullableStr(raw['lmsUrl']) ||
    !isNullableStr(raw['defaultLecturer']) ||
    !isBool(raw['archived']) ||
    !isNum(raw['sortOrder']) ||
    !hasTimestamps(raw)
  ) {
    return `Předmět #${index} má poškozená nebo chybějící pole.`;
  }
  return {
    id: raw['id'],
    name: raw['name'],
    code: raw['code'],
    term: raw['term'],
    color: raw['color'],
    lmsUrl: raw['lmsUrl'],
    defaultLecturer: raw['defaultLecturer'],
    archived: raw['archived'],
    sortOrder: raw['sortOrder'],
    createdAt: raw['createdAt'] as string,
    updatedAt: raw['updatedAt'] as string,
    deletedAt: raw['deletedAt'] as string | null,
  };
}

function parseStatusAt(raw: unknown): StatusTimestamps | null {
  if (!isRecord(raw)) return null;
  const out: StatusTimestamps = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isLectureStatus(key) || !isStr(value)) return null;
    out[key] = value;
  }
  return out;
}

/**
 * Přednáška ze zálohy. Pole přidaná ve schématu 2 (rozvrh, zápisky) starší
 * záloha nemá — doplní se prázdná, stejně jako to dělá migrace databáze.
 */
function parseLecture(raw: unknown, index: number, schemaVersion: number): Lecture | string {
  if (!isRecord(raw)) return `Přednáška #${index} není objekt.`;
  const statusAt = parseStatusAt(raw['statusAt']);
  const legacy = schemaVersion < 2;
  const slotId = legacy && raw['slotId'] === undefined ? null : raw['slotId'];
  const summary = legacy && raw['summary'] === undefined ? '' : raw['summary'];
  const focus = legacy && raw['focus'] === undefined ? '' : raw['focus'];
  const transcript = legacy && raw['transcript'] === undefined ? '' : raw['transcript'];

  if (
    !isStr(raw['id']) ||
    !isStr(raw['subjectId']) ||
    !isNum(raw['number']) ||
    !isStr(raw['title']) ||
    !isNullableStr(raw['date']) ||
    !isNullableStr(raw['lecturer']) ||
    !isBool(raw['hasSlides']) ||
    !isBool(raw['hasTranscript']) ||
    !isLectureStatus(raw['status']) ||
    statusAt === null ||
    !isStr(raw['note']) ||
    !isNullableStr(raw['url']) ||
    !isStrArray(raw['tags']) ||
    !isNullableStr(slotId) ||
    !isStr(summary) ||
    !isStr(focus) ||
    !isStr(transcript) ||
    !hasTimestamps(raw)
  ) {
    return `Přednáška #${index} má poškozená nebo chybějící pole.`;
  }
  return {
    id: raw['id'],
    subjectId: raw['subjectId'],
    number: raw['number'],
    title: raw['title'],
    date: raw['date'],
    lecturer: raw['lecturer'],
    hasSlides: raw['hasSlides'],
    hasTranscript: raw['hasTranscript'],
    status: raw['status'],
    statusAt,
    note: raw['note'],
    url: raw['url'],
    tags: raw['tags'],
    slotId,
    summary,
    focus,
    transcript,
    createdAt: raw['createdAt'] as string,
    updatedAt: raw['updatedAt'] as string,
    deletedAt: raw['deletedAt'] as string | null,
  };
}

function parseSlot(raw: unknown, index: number): ScheduleSlot | string {
  if (!isRecord(raw)) return `Hodina rozvrhu #${index} není objekt.`;
  if (
    !isStr(raw['id']) ||
    !isStr(raw['subjectId']) ||
    !oneOf(SLOT_KINDS, raw['kind']) ||
    !isNum(raw['dayOfWeek']) ||
    !isStr(raw['start']) ||
    !isStr(raw['end']) ||
    !isStr(raw['room']) ||
    !isNullableStr(raw['teacher']) ||
    !oneOf(WEEK_PARITIES, raw['parity']) ||
    !isStr(raw['note']) ||
    !hasTimestamps(raw)
  ) {
    return `Hodina rozvrhu #${index} má poškozená nebo chybějící pole.`;
  }
  return {
    id: raw['id'],
    subjectId: raw['subjectId'],
    kind: raw['kind'],
    dayOfWeek: raw['dayOfWeek'],
    start: raw['start'],
    end: raw['end'],
    room: raw['room'],
    teacher: raw['teacher'],
    parity: raw['parity'],
    note: raw['note'],
    createdAt: raw['createdAt'] as string,
    updatedAt: raw['updatedAt'] as string,
    deletedAt: raw['deletedAt'] as string | null,
  };
}

function parseTerm(raw: unknown, index: number): Term | string {
  if (!isRecord(raw)) return `Semestr #${index} není objekt.`;
  if (
    !isStr(raw['id']) ||
    !isStr(raw['teachingStart']) ||
    !isStr(raw['teachingEnd']) ||
    !isStrArray(raw['skipDates']) ||
    !hasTimestamps(raw)
  ) {
    return `Semestr #${index} má poškozená nebo chybějící pole.`;
  }
  return {
    id: raw['id'],
    teachingStart: raw['teachingStart'],
    teachingEnd: raw['teachingEnd'],
    skipDates: raw['skipDates'],
    createdAt: raw['createdAt'] as string,
    updatedAt: raw['updatedAt'] as string,
    deletedAt: raw['deletedAt'] as string | null,
  };
}

function parseList<T>(
  raw: unknown,
  parse: (item: unknown, index: number) => T | string,
): { ok: true; items: T[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'Seznam v záloze chybí nebo je poškozený.' };
  const items: T[] = [];
  for (const [index, item] of raw.entries()) {
    const parsed = parse(item, index + 1);
    if (typeof parsed === 'string') return { ok: false, error: parsed };
    items.push(parsed);
  }
  return { ok: true, items };
}

/**
 * Ověří soubor dřív, než se sáhne na databázi. Import, který spolkne cizí nebo
 * poškozený JSON a rozbije semestr práce, by byl ten nejdražší možný bug.
 */
export function parseExportFile(raw: unknown): ParseResult {
  if (!isRecord(raw)) return { ok: false, error: 'Soubor neobsahuje JSON objekt.' };
  if (raw['format'] !== EXPORT_FORMAT) {
    return { ok: false, error: 'Tohle není záloha téhle aplikace (chybí označení formátu).' };
  }
  const version = raw['schemaVersion'];
  if (!isNum(version)) return { ok: false, error: 'Chybí verze schématu.' };
  if (version > SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Záloha je z novější verze aplikace (schéma ${version}, tahle umí ${SCHEMA_VERSION}). Aktualizuj aplikaci.`,
    };
  }
  if (!Array.isArray(raw['subjects']) || !Array.isArray(raw['lectures'])) {
    return { ok: false, error: 'Chybí seznam předmětů nebo přednášek.' };
  }

  const subjects = parseList(raw['subjects'], parseSubject);
  if (!subjects.ok) return subjects;
  const lectures = parseList(raw['lectures'], (item, index) => parseLecture(item, index, version));
  if (!lectures.ok) return lectures;

  // Rozvrh a semestry existují až od schématu 2; ve starší záloze nejsou a to je v pořádku.
  const slots = version < 2 && raw['slots'] === undefined ? { ok: true as const, items: [] } : parseList(raw['slots'], parseSlot);
  if (!slots.ok) return slots;
  const terms = version < 2 && raw['terms'] === undefined ? { ok: true as const, items: [] } : parseList(raw['terms'], parseTerm);
  if (!terms.ok) return terms;

  return {
    ok: true,
    file: {
      format: EXPORT_FORMAT,
      schemaVersion: version,
      exportedAt: isStr(raw['exportedAt']) ? raw['exportedAt'] : nowIso(),
      subjects: subjects.items,
      lectures: lectures.items,
      slots: slots.items,
      terms: terms.items,
    },
  };
}

/* ---------- slučování ---------- */

interface Versioned {
  id: Id;
  updatedAt: IsoDateTime;
}

/** Porovnání nezávislé na pořadí klíčů — importovaný soubor je mít seřazené nemusí. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).toSorted();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export interface MergeOutcome<T> {
  /** Výsledná množina záznamů, které se mají v databázi objevit. */
  result: T[];
  /** Id záznamů, které se v režimu `replace` mají smazat. */
  toRemove: Id[];
  diff: EntityDiff;
  conflicts: number;
}

/**
 * Čistá funkce — žádná databáze. Díky tomu jde náhled importu spočítat
 * a ukázat uživateli dřív, než se cokoliv zapíše.
 */
export function mergeRecords<T extends Versioned>(
  existing: readonly T[],
  incoming: readonly T[],
  mode: ImportMode,
): MergeOutcome<T> {
  const mine = new Map(existing.map((r) => [r.id, r]));
  const theirs = new Map(incoming.map((r) => [r.id, r]));

  let added = 0;
  let updated = 0;
  let unchanged = 0;
  let conflicts = 0;

  const result: T[] = [];

  for (const [id, incomingRow] of theirs) {
    const currentRow = mine.get(id);
    if (currentRow === undefined) {
      added += 1;
      result.push(incomingRow);
      continue;
    }
    if (canonical(currentRow) === canonical(incomingRow)) {
      unchanged += 1;
      result.push(currentRow);
      continue;
    }

    conflicts += 1;
    let winner: T;
    if (mode === 'replace') {
      winner = incomingRow;
    } else if (mode === 'merge-keep-mine') {
      winner = currentRow;
    } else {
      // Shoda časů se řeší ve prospěch místních dat — když nevím, nesahám na to.
      winner = incomingRow.updatedAt > currentRow.updatedAt ? incomingRow : currentRow;
    }

    if (winner === currentRow) unchanged += 1;
    else updated += 1;
    result.push(winner);
  }

  const toRemove: Id[] = [];
  for (const [id, currentRow] of mine) {
    if (theirs.has(id)) continue;
    if (mode === 'replace') toRemove.push(id);
    else result.push(currentRow);
  }

  return {
    result,
    toRemove,
    diff: { added, updated, unchanged, removed: toRemove.length },
    conflicts,
  };
}

/* ---------- veřejné API ---------- */

const byId = <T extends { id: string }>(a: T, b: T): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export async function exportAll(db: StudiumDB, now: string = nowIso()): Promise<ExportFile> {
  const [subjects, lectures, slots, terms] = await Promise.all([
    db.subjects.toArray(),
    db.lectures.toArray(),
    db.slots.toArray(),
    db.terms.toArray(),
  ]);
  return {
    format: EXPORT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now,
    subjects: subjects.toSorted(byId),
    lectures: lectures.toSorted(byId),
    slots: slots.toSorted(byId),
    terms: terms.toSorted(byId),
  };
}

/** Export + poznámka o čase zálohy, ze které se počítá připomínka. */
export async function exportAndMark(db: StudiumDB, now: string = nowIso()): Promise<ExportFile> {
  const file = await exportAll(db, now);
  await metaRepo(db).set('lastExportAt', now);
  return file;
}

export function exportFilename(today: string = todayIso()): string {
  return `studium-prehled-${today}.json`;
}

interface MergedAll {
  subjects: MergeOutcome<Subject>;
  lectures: MergeOutcome<Lecture>;
  slots: MergeOutcome<ScheduleSlot>;
  terms: MergeOutcome<Term>;
}

async function mergeAll(db: StudiumDB, file: ExportFile, mode: ImportMode): Promise<MergedAll> {
  const [subjects, lectures, slots, terms] = await Promise.all([
    db.subjects.toArray(),
    db.lectures.toArray(),
    db.slots.toArray(),
    db.terms.toArray(),
  ]);
  return {
    subjects: mergeRecords(subjects, file.subjects, mode),
    lectures: mergeRecords(lectures, file.lectures, mode),
    slots: mergeRecords(slots, file.slots, mode),
    terms: mergeRecords(terms, file.terms, mode),
  };
}

function toPlan(mode: ImportMode, merged: MergedAll): ImportPlan {
  return {
    mode,
    subjects: merged.subjects.diff,
    lectures: merged.lectures.diff,
    slots: merged.slots.diff,
    terms: merged.terms.diff,
    conflicts:
      merged.subjects.conflicts + merged.lectures.conflicts + merged.slots.conflicts + merged.terms.conflicts,
  };
}

/** Náhled: co se stane, když tenhle soubor naimportuju. Nic nezapisuje. */
export async function planImport(db: StudiumDB, file: ExportFile, mode: ImportMode): Promise<ImportPlan> {
  return toPlan(mode, await mergeAll(db, file, mode));
}

export interface ImportResult extends ImportPlan {
  appliedAt: IsoDateTime;
}

/** Zapíše import v jedné transakci — buď projde celý, nebo se nestane nic. */
export async function applyImport(
  db: StudiumDB,
  file: ExportFile,
  mode: ImportMode,
  now: string = nowIso(),
): Promise<ImportResult> {
  const plan = await db.transaction('rw', [db.subjects, db.lectures, db.slots, db.terms], async () => {
    const merged = await mergeAll(db, file, mode);

    if (merged.subjects.toRemove.length > 0) await db.subjects.bulkDelete(merged.subjects.toRemove);
    if (merged.lectures.toRemove.length > 0) await db.lectures.bulkDelete(merged.lectures.toRemove);
    if (merged.slots.toRemove.length > 0) await db.slots.bulkDelete(merged.slots.toRemove);
    if (merged.terms.toRemove.length > 0) await db.terms.bulkDelete(merged.terms.toRemove);
    await db.subjects.bulkPut(merged.subjects.result);
    await db.lectures.bulkPut(merged.lectures.result);
    await db.slots.bulkPut(merged.slots.result);
    await db.terms.bulkPut(merged.terms.result);

    return toPlan(mode, merged);
  });

  return { ...plan, appliedAt: now };
}

/* ---------- soubor ---------- */

/** Text souboru zálohy. Odsazený, aby se dal v nouzi přečíst i opravit ručně. */
export function serializeExport(file: ExportFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** Přečte obsah vybraného souboru včetně ověření. Nikdy nevyhazuje výjimku. */
export function parseExportText(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Soubor není platný JSON. Vybral jsi opravdu zálohu?' };
  }
  return parseExportFile(raw);
}
