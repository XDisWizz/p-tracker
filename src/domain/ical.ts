import { slotDates, SLOT_KIND_LABELS } from './schedule';
import type { IsoDate, ScheduleSlot, Subject, Term, TimeOfDay } from './types';

/**
 * Export rozvrhu do formátu iCalendar (.ics) pro Google Kalendář, kalendář
 * v telefonu a podobně.
 *
 * Každá hodina v semestru je samostatná událost, ne opakování (RRULE):
 * liché/sudé týdny a svátky se pak nemusí překládat do pravidel, která každý
 * kalendář chápe trochu jinak. Časy jsou v pásmu Europe/Prague, takže přechod
 * na zimní čas uprostřed semestru nic nerozhodí.
 */

const PRODID = '-//Prehled prednasek//CS';

/** Definice pásma Europe/Prague — některé kalendáře bez ní TZID neznají. */
const VTIMEZONE_PRAGUE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Prague',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/** Escapování textu podle RFC 5545: zpětné lomítko, středník, čárka, konec řádku. */
export function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/**
 * Zalomení řádku na nejvýš 75 bajtů (ne znaků — čeština má dvoubajtové znaky)
 * s pokračováním začínajícím mezerou. Nikdy nerozdělí vícebajtový znak.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74; // pokračovací řádek má na začátku mezeru
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = '';
      currentBytes = 0;
    }
    current += char;
    currentBytes += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function localStamp(date: IsoDate, time: TimeOfDay): string {
  return `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
}

function utcStamp(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export interface IcsResult {
  text: string;
  events: number;
  /** Předměty, u kterých chybí období výuky — jejich hodiny se exportovat nedají. */
  skippedSubjects: string[];
}

export function scheduleToIcs(
  slots: readonly ScheduleSlot[],
  subjects: readonly Subject[],
  terms: readonly Term[],
  now: Date = new Date(),
): IcsResult {
  const subjectById = new Map(subjects.filter((s) => s.deletedAt === null && !s.archived).map((s) => [s.id, s]));
  const termById = new Map(terms.filter((t) => t.deletedAt === null).map((t) => [t.id, t]));
  const stamp = utcStamp(now.toISOString());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Rozvrh',
    'X-WR-TIMEZONE:Europe/Prague',
    ...VTIMEZONE_PRAGUE,
  ];
  const skipped = new Set<string>();
  let events = 0;

  const ordered = slots
    .filter((s) => s.deletedAt === null && subjectById.has(s.subjectId))
    .toSorted((a, b) => a.dayOfWeek - b.dayOfWeek || a.start.localeCompare(b.start));

  for (const slot of ordered) {
    const subject = subjectById.get(slot.subjectId);
    if (subject === undefined) continue;
    const term = termById.get(subject.term);
    if (term === undefined) {
      skipped.add(subject.code || subject.name);
      continue;
    }

    const kind = SLOT_KIND_LABELS[slot.kind];
    const description = [subject.name, slot.teacher === null ? '' : `Vyučující: ${slot.teacher}`, slot.note]
      .filter((part) => part !== '')
      .join('\n');

    for (const date of slotDates(slot, term)) {
      events += 1;
      lines.push(
        'BEGIN:VEVENT',
        // Stabilní UID: opakovaný import události aktualizuje, místo aby je zdvojil.
        `UID:${slot.id}-${date}@prehled-prednasek`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=Europe/Prague:${localStamp(date, slot.start)}`,
        `DTEND;TZID=Europe/Prague:${localStamp(date, slot.end)}`,
        `SUMMARY:${escapeText(`${subject.code || subject.name} – ${kind}`)}`,
      );
      if (slot.room !== '') lines.push(`LOCATION:${escapeText(slot.room)}`);
      if (description !== '') lines.push(`DESCRIPTION:${escapeText(description)}`);
      lines.push(`CATEGORIES:${escapeText(kind)}`, 'END:VEVENT');
    }
  }

  lines.push('END:VCALENDAR');
  return {
    // RFC 5545 vyžaduje CRLF.
    text: `${lines.map(foldLine).join('\r\n')}\r\n`,
    events,
    skippedSubjects: [...skipped],
  };
}
