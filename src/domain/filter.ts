import type { Id, IsoDate, Lecture, LectureStatus, Subject } from './types';
import { PENDING_STATUSES } from './status';

export interface LectureFilter {
  /** Prázdné pole znamená „všechny předměty“. Stejně tak u stavů a tagů. */
  subjectIds: readonly Id[];
  statuses: readonly LectureStatus[];
  tags: readonly string[];
  /** Fulltext přes název, poznámku, zápisky, přepis, tagy, přednášejícího a předmět. */
  query: string;
}

export const EMPTY_FILTER: LectureFilter = {
  subjectIds: [],
  statuses: [],
  tags: [],
  query: '',
};

export function isFilterActive(filter: LectureFilter): boolean {
  return (
    filter.subjectIds.length > 0 ||
    filter.statuses.length > 0 ||
    filter.tags.length > 0 ||
    filter.query.trim().length > 0
  );
}

/** Počet zapnutých omezení mimo fulltext — číslo na tlačítku „Filtry“. */
export function countFilterChips(filter: LectureFilter): number {
  return filter.subjectIds.length + filter.statuses.length + filter.tags.length;
}

/**
 * Sjednocení textu pro porovnání: malá písmena bez diakritiky.
 *
 * Bez tohohle by „zaklady“ nenašlo „Základy“ a hledání by na mobilu, kde nikdo
 * nepíše háčky, bylo k ničemu.
 */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Normalizovaný text přednášky, uložený podle objektu záznamu. Přepis může mít
 * desítky kB a normalizovat ho při každém stisku klávesy pro každou přednášku
 * by hledání znatelně zpomalilo.
 *
 * Klíčem je objekt, ne `id` + `updatedAt`: databáze vrací po každé změně nové
 * objekty, takže zastaralý text se nikdy nepoužije, a mezi stisky kláves se
 * pole přednášek nemění, takže cache opravdu zabírá. WeakMap si navíc staré
 * záznamy uklidí sama.
 */
const lectureTextCache = new WeakMap<Lecture, string>();

function lectureText(lecture: Lecture): string {
  const cached = lectureTextCache.get(lecture);
  if (cached !== undefined) return cached;
  const text = normalizeText(
    [
      lecture.title,
      lecture.note,
      lecture.summary,
      lecture.focus,
      lecture.transcript,
      lecture.tags.join(' '),
      lecture.lecturer ?? '',
    ].join(' '),
  );
  lectureTextCache.set(lecture, text);
  return text;
}

function haystack(lecture: Lecture, subject: Subject | undefined): string {
  return `${lectureText(lecture)} ${normalizeText(`${subject?.name ?? ''} ${subject?.code ?? ''}`)}`;
}

/** Všechny termíny dotazu musí sedět (AND), každý zvlášť jako podřetězec. */
function matchesQuery(lecture: Lecture, subject: Subject | undefined, query: string): boolean {
  const terms = normalizeText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text = haystack(lecture, subject);
  return terms.every((term) => text.includes(term));
}

export function matchesFilter(
  lecture: Lecture,
  subject: Subject | undefined,
  filter: LectureFilter,
): boolean {
  if (lecture.deletedAt !== null) return false;
  if (filter.subjectIds.length > 0 && !filter.subjectIds.includes(lecture.subjectId)) return false;
  if (filter.statuses.length > 0 && !filter.statuses.includes(lecture.status)) return false;
  if (filter.tags.length > 0 && !filter.tags.some((tag) => lecture.tags.includes(tag))) return false;
  return matchesQuery(lecture, subject, filter.query);
}

export function filterLectures(
  lectures: readonly Lecture[],
  subjects: readonly Subject[],
  filter: LectureFilter,
): Lecture[] {
  const bySubject = new Map(subjects.map((s) => [s.id, s]));
  return lectures.filter((l) => matchesFilter(l, bySubject.get(l.subjectId), filter));
}

/** Řazení v detailu předmětu: podle pořadového čísla. */
export function compareByNumber(a: Lecture, b: Lecture): number {
  return a.number - b.number;
}

/**
 * Řazení pro „Co mě čeká“: od nejstarší. Přednášky bez data patří na konec —
 * nevím, kdy byly, takže je nemůžu poctivě zařadit mezi datované.
 */
export function compareForUpNext(a: Lecture, b: Lecture): number {
  if (a.date !== b.date) {
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return a.date < b.date ? -1 : 1;
  }
  if (a.subjectId !== b.subjectId) return a.subjectId < b.subjectId ? -1 : 1;
  return a.number - b.number;
}

/**
 * Obsah obrazovky „Co mě čeká“, která slouží zároveň jako hledání.
 *
 * Bez zvoleného stavu ukazuje nezpracované přednášky — to je výchozí otázka
 * „co mám dohnat“. Jakmile uživatel stav zvolí, dostane přesně ty stavy.
 *
 * Zobrazují se jen přednášky předmětů předaných v `subjects`, které nejsou
 * archivované ani smazané. Minulý semestr tak nestraší v aktuálním přehledu.
 */
export function browseLectures(
  lectures: readonly Lecture[],
  subjects: readonly Subject[],
  filter: LectureFilter,
): Lecture[] {
  const visible = new Set(
    subjects.filter((s) => !s.archived && s.deletedAt === null).map((s) => s.id),
  );
  const effective: LectureFilter =
    filter.statuses.length === 0 ? { ...filter, statuses: PENDING_STATUSES } : filter;

  return filterLectures(lectures, subjects, effective)
    .filter((l) => visible.has(l.subjectId))
    .sort(compareForUpNext);
}

export interface DueGroups {
  /** Přednáška už proběhla (nebo je dnes) — tohle je skutečný dluh. */
  due: Lecture[];
  /** Naplánovaná do budoucna, typicky přidaná „Rychle přidat“ dopředu. */
  upcoming: Lecture[];
  undated: Lecture[];
}

/** Rozdělí seřazený seznam podle toho, jestli přednáška už proběhla. Pořadí zachová. */
export function groupByDue(lectures: readonly Lecture[], today: IsoDate): DueGroups {
  const groups: DueGroups = { due: [], upcoming: [], undated: [] };
  for (const lecture of lectures) {
    if (lecture.date === null) groups.undated.push(lecture);
    else if (lecture.date <= today) groups.due.push(lecture);
    else groups.upcoming.push(lecture);
  }
  return groups;
}

/** Všechny použité tagy, bez duplicit, abecedně — podklad pro nabídku filtru. */
export function collectTags(lectures: readonly Lecture[]): string[] {
  const set = new Set<string>();
  for (const lecture of lectures) {
    if (lecture.deletedAt !== null) continue;
    for (const tag of lecture.tags) set.add(tag);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'cs'));
}

/** Přepne hodnotu v poli — pro čipy ve filtru. */
export function toggleValue<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}
