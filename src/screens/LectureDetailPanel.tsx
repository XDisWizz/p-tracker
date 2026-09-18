import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  FileType2,
  History,
  Link2,
  MapPin,
  Pencil,
  StickyNote,
  Target,
  Trash2,
} from 'lucide-react';
import { formatCsShort, relativeDays, todayIso } from '../domain/date';
import { lectureDisplayTitle } from '../domain/defaults';
import { canMarkSummaryDone, textStats } from '../domain/notes';
import { STATUS_META } from '../domain/status';
import { SLOT_KIND_LABELS, formatTime, nextLectureOf, previousLecture } from '../domain/schedule';
import { countOf } from '../domain/plural';
import { LECTURE_STATUSES, type Id, type Lecture, type ScheduleSlot, type Subject } from '../domain/types';
import {
  lectures as lecturesRepo,
  useLecture,
  useSubject,
  useSubjectLectures,
  useSubjectSlots,
} from '../hooks/useLiveData';
import { useLectureActions } from '../hooks/useLectureActions';
import { useLectureNotes, type NoteField, type SaveState } from '../hooks/useLectureNotes';
import { AutoTextarea } from '../components/ui/AutoTextarea';
import { FormattedNotes } from '../components/FormattedNotes';
import { Button, IconButton } from '../components/ui/Button';
import { Menu, MenuItem, MenuSeparator } from '../components/ui/Menu';
import { useToast } from '../components/ui/Toast';
import { STATUS_VISUALS, SUBJECT_COLOR_CLASSES, cx } from '../components/tokens';

interface LectureDetailPanelProps {
  lectureId: Id;
  onBack: () => void;
  onOpenLecture: (id: Id) => void;
  onOpenSubject: (id: Id) => void;
  showBack: boolean;
}

/**
 * Jedna přednáška: co se probíralo, na co se zaměřit, přepis. Nahoře
 * rekapitulace minulé přednášky, aby šlo navázat, dole odkaz na příští.
 */
export function LectureDetailPanel({ lectureId, onBack, onOpenLecture, onOpenSubject, showBack }: LectureDetailPanelProps) {
  const lecture = useLecture(lectureId);
  const subject = useSubject(lecture?.subjectId ?? null);
  const siblings = useSubjectLectures(lecture?.subjectId ?? null);
  const slots = useSubjectSlots(lecture?.subjectId ?? null);

  if (lecture === undefined || subject === undefined || siblings === undefined || slots === undefined) return null;
  if (lecture === null || subject === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-muted">Přednáška neexistuje nebo byla smazána.</p>
        <Button onClick={onBack}>Zpět</Button>
      </div>
    );
  }

  return (
    // `key`: při přechodu na jinou přednášku začít s čistým konceptem zápisků.
    <LectureEditor
      key={lecture.id}
      lecture={lecture}
      subject={subject}
      siblings={siblings}
      slot={slots.find((s) => s.id === lecture.slotId) ?? null}
      onBack={onBack}
      onOpenLecture={onOpenLecture}
      onOpenSubject={onOpenSubject}
      showBack={showBack}
    />
  );
}

function LectureEditor({
  lecture,
  subject,
  siblings,
  slot,
  onBack,
  onOpenLecture,
  onOpenSubject,
  showBack,
}: {
  lecture: Lecture;
  subject: Subject;
  siblings: readonly Lecture[];
  slot: ScheduleSlot | null;
  onBack: () => void;
  onOpenLecture: (id: Id) => void;
  onOpenSubject: (id: Id) => void;
  showBack: boolean;
}) {
  const notes = useLectureNotes(lecture);
  const actions = useLectureActions();
  const toast = useToast();
  const today = todayIso();

  const previous = useMemo(() => previousLecture(lecture, siblings), [lecture, siblings]);
  const next = useMemo(() => nextLectureOf(lecture, siblings), [lecture, siblings]);
  const prevByNumber = useMemo(
    () => [...siblings].filter((l) => l.number < lecture.number).toSorted((a, b) => b.number - a.number)[0] ?? null,
    [siblings, lecture.number],
  );
  const colors = SUBJECT_COLOR_CLASSES[subject.color];

  // Před přechodem jinam uložit rozepsané — jinak by se text uložil až při odpojení.
  const go = (id: Id): void => {
    void notes.flush().then(() => onOpenLecture(id));
  };

  async function remove(): Promise<void> {
    await notes.flush();
    await lecturesRepo.softDelete(lecture.id);
    onBack();
    toast(`${lectureDisplayTitle(lecture)} smazána`, { label: 'Zpět', run: () => lecturesRepo.restore(lecture.id) });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-line px-4 pt-3 pb-3">
        <div className="flex items-center gap-1">
          {showBack && (
            <IconButton label="Zpět" onClick={onBack} className="-ml-2">
              <ArrowLeft size={20} />
            </IconButton>
          )}
          <button
            type="button"
            onClick={() => onOpenSubject(subject.id)}
            className={cx('rounded-md px-1.5 py-0.5 text-xs font-semibold', colors.soft)}
          >
            {subject.code || subject.name}
          </button>
          <span className="min-w-0 flex-1 truncate text-xs text-muted">{subject.name}</span>
          <SaveIndicator state={notes.state} />
          <IconButton
            label="Předchozí přednáška"
            disabled={prevByNumber === null}
            onClick={() => prevByNumber !== null && go(prevByNumber.id)}
          >
            <ChevronLeft size={20} />
          </IconButton>
          <IconButton label="Další přednáška" disabled={next === null} onClick={() => next !== null && go(next.id)}>
            <ChevronRight size={20} />
          </IconButton>
          <Menu label="Možnosti přednášky">
            {(close) => (
              <>
                <MenuItem
                  icon={<Pencil size={16} />}
                  onSelect={() => {
                    close();
                    actions.edit(lecture);
                  }}
                >
                  Upravit údaje
                </MenuItem>
                <MenuItem
                  icon={<BookOpen size={16} />}
                  onSelect={() => {
                    close();
                    onOpenSubject(subject.id);
                  }}
                >
                  Otevřít předmět
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  danger
                  icon={<Trash2 size={16} />}
                  onSelect={() => {
                    close();
                    void remove();
                  }}
                >
                  Smazat přednášku
                </MenuItem>
              </>
            )}
          </Menu>
        </div>

        <h2 className={cx('mt-1 text-lg font-semibold', lecture.title.trim() === '' && 'text-muted')}>
          {lectureDisplayTitle(lecture)}
          {lecture.title.trim() !== '' && (
            <span className="ml-2 text-sm font-normal text-muted">{lecture.number}. přednáška</span>
          )}
        </h2>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {lecture.date !== null && (
            <span>
              {formatCsShort(lecture.date)} · {relativeDays(lecture.date, today)}
            </span>
          )}
          {slot !== null && (
            <span className="tabular-nums">
              {SLOT_KIND_LABELS[slot.kind]} {formatTime(slot.start)}–{formatTime(slot.end)}
            </span>
          )}
          {slot !== null && slot.room !== '' && (
            <span className="inline-flex items-center gap-0.5 font-medium text-ink">
              <MapPin size={11} aria-hidden />
              {slot.room}
            </span>
          )}
          {lecture.lecturer !== null && <span>{lecture.lecturer}</span>}
          {lecture.url !== null && lecture.url !== '' && (
            <a
              href={lecture.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline"
            >
              <Link2 size={12} aria-hidden />
              podklady
            </a>
          )}
        </div>

        <StatusPicker lecture={lecture} onPick={(status) => void actions.setStatus(lecture, status, { announce: false })} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-4">
          {previous !== null && (previous.summary.trim() !== '' || previous.focus.trim() !== '') && (
            <button
              type="button"
              onClick={() => go(previous.id)}
              className="rounded-2xl bg-surface-2 p-3 text-left ring-1 ring-line hover:ring-accent"
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                <History size={14} aria-hidden />
                Minule — {lectureDisplayTitle(previous)}
                {previous.date !== null && <span className="font-normal">· {formatCsShort(previous.date)}</span>}
              </p>
              {previous.summary.trim() !== '' && (
                <div className="relative mt-1.5 max-h-48 overflow-hidden">
                  <FormattedNotes text={previous.summary} />
                </div>
              )}
              {previous.focus.trim() !== '' && (
                <div className="mt-2 border-l-2 border-amber-400 pl-3">
                  <p className="text-xs font-semibold text-muted">Zaměřit se</p>
                  <FormattedNotes text={previous.focus} />
                </div>
              )}
            </button>
          )}

          <NoteSection
            icon={<BookOpen size={16} />}
            title="Co se probíralo"
            hint="Učivo v bodech (odrážky -, nadpisy #, **tučně**). Ukáže se jako „minule“ u příští přednášky."
            field="summary"
            value={notes.draft.summary}
            onChange={notes.update}
            placeholder={'• Limita posloupnosti\n• Věta o sevření\n• …'}
            minRows={4}
          />

          {canMarkSummaryDone({ status: lecture.status, summary: notes.draft.summary }) && (
            <div className="-mt-3 flex">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void notes.flush().then(() => actions.setStatus(lecture, 'summary', { announce: true }))}
              >
                <Check size={15} />
                Shrnutí je hotové
              </Button>
            </div>
          )}

          <NoteSection
            icon={<Target size={16} />}
            title="Na co se zaměřit"
            hint="Důležité ke zkoušce, co nepochopeno, co doučit."
            field="focus"
            value={notes.draft.focus}
            onChange={notes.update}
            placeholder="Důkaz věty o limitě součtu bude u zkoušky."
            minRows={2}
          />

          <TranscriptSection value={notes.draft.transcript} onChange={notes.update} />

          <NoteSection
            icon={<StickyNote size={16} />}
            title="Poznámka"
            field="note"
            value={notes.draft.note}
            onChange={notes.update}
            placeholder="Cokoliv dalšího…"
            minRows={2}
          />

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <MaterialToggle
              icon={<FileType2 size={14} />}
              label="Prezentace"
              checked={lecture.hasSlides}
              onChange={(value) => void lecturesRepo.update(lecture.id, { hasSlides: value })}
            />
            <MaterialToggle
              icon={<StickyNote size={14} />}
              label="Přepis"
              checked={lecture.hasTranscript}
              onChange={(value) => void lecturesRepo.update(lecture.id, { hasTranscript: value })}
            />
            {lecture.tags.map((tag) => (
              <span key={tag} className="rounded bg-surface-2 px-1.5 py-0.5">
                {tag}
              </span>
            ))}
          </div>

          {next !== null && (
            <button
              type="button"
              onClick={() => go(next.id)}
              className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left text-sm ring-1 ring-line hover:bg-surface-2"
            >
              <span className="min-w-0">
                <span className="block text-xs text-muted">Příští přednáška</span>
                <span className="block truncate font-medium">
                  {lectureDisplayTitle(next)}
                  {next.date !== null && <span className="font-normal text-muted"> · {formatCsShort(next.date)}</span>}
                </span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {actions.editor}
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const label = { saved: 'Uloženo', pending: 'Upravuješ…', saving: 'Ukládám…', error: 'Neuloženo!' }[state];
  return (
    <span
      aria-live="polite"
      className={cx(
        'shrink-0 px-1 text-[11px] tabular-nums',
        state === 'error' ? 'font-semibold text-danger' : 'text-muted',
      )}
    >
      {label}
    </span>
  );
}

function StatusPicker({ lecture, onPick }: { lecture: Lecture; onPick: (status: Lecture['status']) => void }) {
  return (
    <div className="mt-3 flex flex-wrap gap-1" role="radiogroup" aria-label="Stav zpracování">
      {LECTURE_STATUSES.map((status) => {
        const Icon = STATUS_VISUALS[status].icon;
        const active = lecture.status === status;
        return (
          <button
            key={status}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onPick(status)}
            className={cx(
              'inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-xs font-medium ring-1 sm:h-9',
              active ? cx(STATUS_VISUALS[status].badge, 'ring-2 ring-accent') : 'text-muted ring-line hover:bg-surface-2',
            )}
          >
            <Icon size={14} aria-hidden />
            {STATUS_META[status].short}
          </button>
        );
      })}
    </div>
  );
}

function NoteSection({
  icon,
  title,
  hint,
  field,
  value,
  onChange,
  placeholder,
  minRows,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  field: NoteField;
  value: string;
  onChange: (field: NoteField, value: string) => void;
  placeholder: string;
  minRows: number;
}) {
  const id = `note-${field}`;
  return (
    <section className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-semibold">
        <span className="text-muted">{icon}</span>
        {title}
      </label>
      {hint !== undefined && <p className="-mt-1 text-xs text-muted">{hint}</p>}
      <AutoTextarea
        id={id}
        value={value}
        rows={minRows}
        placeholder={placeholder}
        onChange={(event) => onChange(field, event.target.value)}
      />
    </section>
  );
}

function TranscriptSection({
  value,
  onChange,
}: {
  value: string;
  onChange: (field: NoteField, value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const stats = textStats(value);
  const canPaste = typeof navigator.clipboard?.readText === 'function';

  async function paste(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim() === '') return;
      onChange('transcript', value.trim() === '' ? text : `${value}\n\n${text}`);
    } catch {
      // Prohlížeč přístup ke schránce odmítl — vložit jde pořád ručně (Ctrl+V).
    }
  }

  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="note-transcript" className="flex flex-1 items-center gap-1.5 text-sm font-semibold">
          <span className="text-muted">
            <FileType2 size={16} />
          </span>
          Přepis
          {stats.words > 0 && (
            <span className="text-xs font-normal text-muted">
              · {countOf(stats.words, 'slovo', 'slova', 'slov')} · ~{stats.readingMinutes} min čtení
            </span>
          )}
        </label>
        {canPaste && (
          <Button size="sm" variant="ghost" onClick={() => void paste()}>
            <ClipboardPaste size={15} />
            Vložit
          </Button>
        )}
        {value !== '' && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void navigator.clipboard?.writeText(value).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              })
            }
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? 'Zkopírováno' : 'Kopírovat'}
          </Button>
        )}
      </div>
      <AutoTextarea
        id="note-transcript"
        value={value}
        rows={3}
        maxHeight={expanded ? 100_000 : 320}
        placeholder="Sem vlož přepis přednášky. Prohledává se i v hledání."
        className="font-[inherit] text-sm"
        onChange={(event) => onChange('transcript', event.target.value)}
      />
      {stats.words > 250 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="self-start text-xs font-medium text-accent hover:underline"
        >
          {expanded ? 'Sbalit přepis' : 'Rozbalit celý přepis'}
        </button>
      )}
    </section>
  );
}

function MaterialToggle({
  icon,
  label,
  checked,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={cx(
        'inline-flex h-11 items-center gap-1.5 rounded-full px-3 ring-1 sm:h-8',
        checked ? 'bg-accent-soft font-medium text-ink ring-accent/40' : 'ring-line hover:bg-surface-2',
      )}
    >
      {icon}
      {label}
      {checked && <Check size={13} aria-hidden />}
    </button>
  );
}

