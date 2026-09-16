import type { StudiumDB } from './db';
import { SCHEMA_VERSION } from './db';
import { metaRepo } from './meta';
import { nowIso, todayIso } from '../domain/date';
import { isLectureStatus } from '../domain/status';
import {
  SUBJECT_COLORS,
  type Id,
  type IsoDateTime,
  type Lecture,
  type StatusTimestamps,
  type Subject,
} from '../domain/types';

export const EXPORT_FORMAT = 'studium-prehled';

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  schemaVersion: number;
  exportedAt: IsoDateTime;
  /** Včetně tombstones — jinak by se smazání nepřeneslo na druhé zařízení. */
  subjects: Subject[];
  lectures: Lecture[];
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

function parseSubject(raw: unknown, index: number): Subject | string {
  if (!isRecord(raw)) return `Předmět #${index} není objekt.`;
  const colors: readonly string[] = SUBJECT_COLORS;
  if (
    !isStr(raw['id']) ||
    !isStr(raw['name']) ||
    !isStr(raw['code']) ||
    !isStr(raw['term']) ||
    !isStr(raw['color']) ||
    !colors.includes(raw['color']) ||
    !isNullableStr(raw['lmsUrl']) ||
    !isNullableStr(raw['defaultLecturer']) ||
    !isBool(raw['archived']) ||
    !isNum(raw['sortOrder']) ||
    !isStr(raw['createdAt']) ||
    !isStr(raw['updatedAt']) ||
    !isNullableStr(raw['deletedAt'])
  ) {
    return `Předmět #${index} má poškozená nebo chybějící pole.`;
  }
  return {
    id: raw['id'],
    name: raw['name'],
    code: raw['code'],
    term: raw['term'],
    color: raw['color'] as Subject['color'],
    lmsUrl: raw['lmsUrl'],
    defaultLecturer: raw['defaultLecturer'],
    archived: raw['archived'],
    sortOrder: raw['sortOrder'],
    createdAt: raw['createdAt'],
    updatedAt: raw['updatedAt'],
    deletedAt: raw['deletedAt'],
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

function parseLecture(raw: unknown, index: number): Lecture | string {
  if (!isRecord(raw)) return `Přednáška #${index} není objekt.`;
  const statusAt = parseStatusAt(raw['statusAt']);
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
    !isStr(raw['createdAt']) ||
    !isStr(raw['updatedAt']) ||
    !isNullableStr(raw['deletedAt'])
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
    createdAt: raw['createdAt'],
    updatedAt: raw['updatedAt'],
    deletedAt: raw['deletedAt'],
  };
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
  if (!isNum(raw['schemaVersion'])) {
    return { ok: false, error: 'Chybí verze schématu.' };
  }
  if (raw['schemaVersion'] > SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Záloha je z novější verze aplikace (schéma ${raw['schemaVersion']}, tahle umí ${SCHEMA_VERSION}). Aktualizuj aplikaci.`,
    };
  }
  if (!Array.isArray(raw['subjects']) || !Array.isArray(raw['lectures'])) {
    return { ok: false, error: 'Chybí seznam předmětů nebo přednášek.' };
  }

  const subjects: Subject[] = [];
  for (const [index, item] of raw['subjects'].entries()) {
    const parsed = parseSubject(item, index + 1);
    if (typeof parsed === 'string') return { ok: false, error: parsed };
    subjects.push(parsed);
  }

  const lectures: Lecture[] = [];
  for (const [index, item] of raw['lectures'].entries()) {
    const parsed = parseLecture(item, index + 1);
    if (typeof parsed === 'string') return { ok: false, error: parsed };
    lectures.push(parsed);
  }

  return {
    ok: true,
    file: {
      format: EXPORT_FORMAT,
      schemaVersion: raw['schemaVersion'],
      exportedAt: isStr(raw['exportedAt']) ? raw['exportedAt'] : nowIso(),
      subjects,
      lectures,
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
    const keys = Object.keys(value).sort();
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

export async function exportAll(db: StudiumDB, now: string = nowIso()): Promise<ExportFile> {
  const [subjects, lectures] = await Promise.all([db.subjects.toArray(), db.lectures.toArray()]);
  return {
    format: EXPORT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now,
    subjects: subjects.sort((a, b) => (a.id < b.id ? -1 : 1)),
    lectures: lectures.sort((a, b) => (a.id < b.id ? -1 : 1)),
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

/** Náhled: co se stane, když tenhle soubor naimportuju. Nic nezapisuje. */
export async function planImport(
  db: StudiumDB,
  file: ExportFile,
  mode: ImportMode,
): Promise<ImportPlan> {
  const [subjects, lectures] = await Promise.all([db.subjects.toArray(), db.lectures.toArray()]);
  const s = mergeRecords(subjects, file.subjects, mode);
  const l = mergeRecords(lectures, file.lectures, mode);
  return { mode, subjects: s.diff, lectures: l.diff, conflicts: s.conflicts + l.conflicts };
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
  const plan = await db.transaction('rw', db.subjects, db.lectures, async () => {
    const [subjects, lectures] = await Promise.all([db.subjects.toArray(), db.lectures.toArray()]);
    const s = mergeRecords(subjects, file.subjects, mode);
    const l = mergeRecords(lectures, file.lectures, mode);

    if (s.toRemove.length > 0) await db.subjects.bulkDelete(s.toRemove);
    if (l.toRemove.length > 0) await db.lectures.bulkDelete(l.toRemove);
    await db.subjects.bulkPut(s.result);
    await db.lectures.bulkPut(l.result);

    return {
      mode,
      subjects: s.diff,
      lectures: l.diff,
      conflicts: s.conflicts + l.conflicts,
    } satisfies ImportPlan;
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
