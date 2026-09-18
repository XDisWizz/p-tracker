import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import {
  DAY_SHORT,
  PARITY_LABELS,
  SLOT_KIND_LABELS,
  TEACHING_BLOCKS,
  formatTime,
  validateSlot,
} from '../domain/schedule';
import { SLOT_KINDS, WEEK_PARITIES, type SlotInput, type Subject } from '../domain/types';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Field, Select, TextInput } from './ui/Field';
import { SUBJECT_COLOR_CLASSES, cx } from './tokens';

interface SlotFormProps {
  title: string;
  initial: SlotInput;
  subjects: readonly Subject[];
  /** Předmět je daný (formulář otevřený z detailu předmětu) — výběr se schová. */
  lockSubject?: boolean;
  onSubmit: (input: SlotInput) => void | Promise<void>;
  onDelete?: (() => void) | undefined;
  onClose: () => void;
}

/**
 * Jedna hodina rozvrhu. Navržené na naklikání: den a blok jsou tlačítka,
 * psát se musí jen místnost.
 */
export function SlotForm({
  title,
  initial,
  subjects,
  lockSubject = false,
  onSubmit,
  onDelete,
  onClose,
}: SlotFormProps) {
  const [draft, setDraft] = useState<SlotInput>(initial);
  const [saving, setSaving] = useState(false);
  const formId = useId();

  const problem = validateSlot(draft) ?? (draft.subjectId === '' ? 'Vyber předmět.' : null);
  const selectedSubject = subjects.find((s) => s.id === draft.subjectId);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (problem !== null || saving) return;
    setSaving(true);
    try {
      await onSubmit({
        ...draft,
        room: draft.room.trim(),
        note: draft.note.trim(),
        teacher: draft.teacher?.trim() === '' ? null : draft.teacher,
      });
    } finally {
      setSaving(false);
    }
  }

  const set = <K extends keyof SlotInput>(key: K, value: SlotInput[K]): void =>
    setDraft((d) => ({ ...d, [key]: value }));

  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      footer={
        <>
          {onDelete !== undefined && (
            <Button variant="danger" className="mr-auto" onClick={onDelete}>
              <Trash2 size={16} />
              Smazat
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button type="submit" form={formId} variant="primary" disabled={problem !== null || saving}>
            Uložit
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
        {!lockSubject && (
          <Field label="Předmět">
            {(id) => (
              <Select id={id} value={draft.subjectId} onChange={(event) => set('subjectId', event.target.value)}>
                <option value="" disabled>
                  Vyber předmět…
                </option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.code} — {subject.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <Group label="Druh">
          {SLOT_KINDS.map((kind) => (
            <Toggle key={kind} pressed={draft.kind === kind} onClick={() => set('kind', kind)}>
              {SLOT_KIND_LABELS[kind]}
            </Toggle>
          ))}
        </Group>
        {draft.kind === 'lecture' && (
          <p className="-mt-2 text-xs text-muted">
            Podle přednášek se v předmětu samy vytvoří přednášky na celý semestr.
          </p>
        )}

        <Group label="Den">
          {DAY_SHORT.map((label, index) => (
            <Toggle
              key={label}
              pressed={draft.dayOfWeek === index + 1}
              onClick={() => set('dayOfWeek', index + 1)}
              className="min-w-11"
            >
              {label}
            </Toggle>
          ))}
        </Group>

        <Group label="Blok">
          {TEACHING_BLOCKS.map((block) => {
            const pressed = draft.start === block.start && draft.end === block.end;
            return (
              <Toggle
                key={block.start}
                pressed={pressed}
                onClick={() => setDraft((d) => ({ ...d, start: block.start, end: block.end }))}
              >
                {formatTime(block.start)}–{formatTime(block.end)}
              </Toggle>
            );
          })}
        </Group>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Začátek">
            {(id) => (
              <TextInput id={id} type="time" value={draft.start} onChange={(e) => set('start', e.target.value)} />
            )}
          </Field>
          <Field label="Konec">
            {(id) => <TextInput id={id} type="time" value={draft.end} onChange={(e) => set('end', e.target.value)} />}
          </Field>
        </div>

        <Group label="Týdny">
          {WEEK_PARITIES.map((parity) => (
            <Toggle key={parity} pressed={draft.parity === parity} onClick={() => set('parity', parity)}>
              {PARITY_LABELS[parity]}
            </Toggle>
          ))}
        </Group>
        {draft.parity !== 'every' && (
          <p className="-mt-2 text-xs text-muted">Počítá se od začátku výuky: první týden semestru je lichý.</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Místnost">
            {(id) => (
              <TextInput
                id={id}
                value={draft.room}
                placeholder="EB412"
                autoCapitalize="characters"
                onChange={(e) => set('room', e.target.value)}
              />
            )}
          </Field>
          <Field label="Vyučující">
            {(id) => (
              <TextInput
                id={id}
                value={draft.teacher ?? ''}
                placeholder={selectedSubject?.defaultLecturer ?? 'Nepovinné'}
                onChange={(e) => set('teacher', e.target.value || null)}
              />
            )}
          </Field>
        </div>

        <Field label="Poznámka" hint="Třeba „notebook s sebou“ nebo číslo skupiny.">
          {(id) => <TextInput id={id} value={draft.note} onChange={(e) => set('note', e.target.value)} />}
        </Field>

        {selectedSubject !== undefined && (
          <p className="flex items-center gap-2 text-xs text-muted">
            <span className={cx('size-2 rounded-full', SUBJECT_COLOR_CLASSES[selectedSubject.color].dot)} aria-hidden />
            Semestr {selectedSubject.term}
          </p>
        )}

        {problem !== null && <p className="text-sm text-danger">{problem}</p>}
      </form>
    </Modal>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-muted">{label}</legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}

function Toggle({
  pressed,
  onClick,
  children,
  className,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        'inline-flex h-11 items-center justify-center rounded-xl px-3 text-sm ring-1 transition-colors sm:h-9',
        pressed ? 'bg-accent font-medium text-white ring-transparent' : 'bg-surface-2 text-ink ring-line hover:bg-line/40',
        className,
      )}
    >
      {children}
    </button>
  );
}
