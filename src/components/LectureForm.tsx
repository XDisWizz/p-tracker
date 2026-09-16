import { useId, useState, type FormEvent } from 'react';
import { LECTURE_STATUSES, type LectureInput } from '../domain/types';
import { STATUS_META } from '../domain/status';
import { isValidIsoDate } from '../domain/date';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Checkbox, Field, Select, TextInput, Textarea } from './ui/Field';

interface LectureFormProps {
  open: boolean;
  title: string;
  initial: LectureInput;
  /** Popisek tlačítka — u zakládání „Přidat“, u úprav „Uložit“. */
  submitLabel: string;
  onSubmit: (input: LectureInput) => void | Promise<void>;
  onClose: () => void;
}

/**
 * Formulář je záměrně odesílatelný hned po otevření: všechno podstatné je
 * předvyplněné z předchozí přednášky a název je nepovinný. Jinak by přidání
 * nebylo na dva kliky, ale na dva kliky a psaní.
 */
export function LectureForm({
  open,
  title,
  initial,
  submitLabel,
  onSubmit,
  onClose,
}: LectureFormProps) {
  const [draft, setDraft] = useState<LectureInput>(initial);
  const [saving, setSaving] = useState(false);
  const [tagText, setTagText] = useState(initial.tags.join(', '));
  const formId = useId();

  const dateInvalid = draft.date !== null && draft.date !== '' && !isValidIsoDate(draft.date);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (saving || dateInvalid) return;
    setSaving(true);
    try {
      await onSubmit({
        ...draft,
        title: draft.title.trim(),
        note: draft.note.trim(),
        date: draft.date === '' ? null : draft.date,
        url: draft.url?.trim() === '' ? null : draft.url,
        lecturer: draft.lecturer?.trim() === '' ? null : draft.lecturer,
        tags: tagText
          .split(',')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button type="submit" form={formId} variant="primary" disabled={saving || dateInvalid}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
        <div className="grid grid-cols-[5rem_1fr] gap-3">
          <Field label="Číslo">
            {(id) => (
              <TextInput
                id={id}
                type="number"
                inputMode="numeric"
                min={1}
                value={draft.number}
                onChange={(event) =>
                  setDraft((d) => ({ ...d, number: Number(event.target.value) || 1 }))
                }
              />
            )}
          </Field>

          <Field label="Datum">
            {(id) => (
              <TextInput
                id={id}
                type="date"
                value={draft.date ?? ''}
                aria-invalid={dateInvalid}
                onChange={(event) => setDraft((d) => ({ ...d, date: event.target.value || null }))}
              />
            )}
          </Field>
        </div>

        <Field label="Název" hint="Nepovinný — bez něj se zobrazí pořadové číslo.">
          {(id) => (
            <TextInput
              id={id}
              // S klávesnicí: „n“, napsat název, Enter. Na dotyku se klávesnice nevnucuje.
              data-autofocus
              value={draft.title}
              placeholder="Limity a spojitost"
              onChange={(event) => setDraft((d) => ({ ...d, title: event.target.value }))}
            />
          )}
        </Field>

        <Field label="Stav zpracování">
          {(id) => (
            <Select
              id={id}
              value={draft.status}
              onChange={(event) =>
                setDraft((d) => ({ ...d, status: event.target.value as LectureInput['status'] }))
              }
            >
              {LECTURE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_META[status].label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Checkbox
            label="Prezentace"
            checked={draft.hasSlides}
            onChange={(event) => setDraft((d) => ({ ...d, hasSlides: event.target.checked }))}
          />
          <Checkbox
            label="Přepis"
            checked={draft.hasTranscript}
            onChange={(event) => setDraft((d) => ({ ...d, hasTranscript: event.target.checked }))}
          />
        </div>

        <Field label="Odkaz na podklady" hint="Složka na disku, soubor, cokoliv.">
          {(id) => (
            <TextInput
              id={id}
              type="url"
              inputMode="url"
              value={draft.url ?? ''}
              placeholder="https://..."
              onChange={(event) => setDraft((d) => ({ ...d, url: event.target.value || null }))}
            />
          )}
        </Field>

        <Field label="Přednášející">
          {(id) => (
            <TextInput
              id={id}
              value={draft.lecturer ?? ''}
              onChange={(event) => setDraft((d) => ({ ...d, lecturer: event.target.value || null }))}
            />
          )}
        </Field>

        <Field label="Tagy" hint="Oddělené čárkou.">
          {(id) => (
            <TextInput
              id={id}
              value={tagText}
              placeholder="zkouška, důležité"
              onChange={(event) => setTagText(event.target.value)}
            />
          )}
        </Field>

        <Field label="Poznámka">
          {(id) => (
            <Textarea
              id={id}
              value={draft.note}
              placeholder="Co dodělat, co nepochopeno…"
              onChange={(event) => setDraft((d) => ({ ...d, note: event.target.value }))}
            />
          )}
        </Field>
      </form>
    </Modal>
  );
}
