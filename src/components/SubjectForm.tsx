import { useId, useState, type FormEvent } from 'react';
import { SUBJECT_COLORS, type SubjectInput } from '../domain/types';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Field, TextInput } from './ui/Field';
import { SUBJECT_COLOR_CLASSES, cx } from './tokens';

interface SubjectFormProps {
  open: boolean;
  title: string;
  initial: SubjectInput;
  onSubmit: (input: SubjectInput) => void | Promise<void>;
  onClose: () => void;
}

export function SubjectForm({ open, title, initial, onSubmit, onClose }: SubjectFormProps) {
  const [draft, setDraft] = useState<SubjectInput>(initial);
  const [saving, setSaving] = useState(false);
  const formId = useId();

  // Formulář se pokaždé připojuje znovu (viz `key` v místě použití), takže
  // stav není potřeba synchronizovat efektem — rozepsané změny se nemají kam ztratit.

  const canSave = draft.name.trim().length > 0 || draft.code.trim().length > 0;

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await onSubmit({
        ...draft,
        name: draft.name.trim(),
        code: draft.code.trim().toUpperCase(),
        term: draft.term.trim(),
        lmsUrl: draft.lmsUrl?.trim() === '' ? null : draft.lmsUrl,
        defaultLecturer: draft.defaultLecturer?.trim() === '' ? null : draft.defaultLecturer,
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
          {/* Tlačítko je mimo <form>, proto se na formulář odkazuje atributem `form`. */}
          <Button type="submit" form={formId} variant="primary" disabled={!canSave || saving}>
            Uložit
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
        <Field label="Název">
          {(id) => (
            <TextInput
              id={id}
              data-autofocus
              value={draft.name}
              placeholder="Základy matematické analýzy"
              onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
            />
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Zkratka">
            {(id) => (
              <TextInput
                id={id}
                value={draft.code}
                placeholder="ZMA"
                maxLength={10}
                onChange={(event) => setDraft((d) => ({ ...d, code: event.target.value }))}
              />
            )}
          </Field>

          <Field label="Semestr">
            {(id) => (
              <TextInput
                id={id}
                value={draft.term}
                placeholder="2026/27 ZS"
                onChange={(event) => setDraft((d) => ({ ...d, term: event.target.value }))}
              />
            )}
          </Field>
        </div>

        <Field label="Barva">
          {(id) => (
            <div id={id} className="flex flex-wrap gap-2">
              {SUBJECT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Barva ${color}`}
                  aria-pressed={draft.color === color}
                  onClick={() => setDraft((d) => ({ ...d, color }))}
                  className={cx(
                    'size-11 rounded-xl transition-transform',
                    draft.color === color
                      ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface'
                      : 'ring-1 ring-line',
                  )}
                >
                  <span className={cx('mx-auto block size-5 rounded-full', SUBJECT_COLOR_CLASSES[color].dot)} />
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field label="Přednášející" hint="Předvyplní se u nové přednášky.">
          {(id) => (
            <TextInput
              id={id}
              value={draft.defaultLecturer ?? ''}
              placeholder="doc. Ing. Jan Novák, Ph.D."
              onChange={(event) =>
                setDraft((d) => ({ ...d, defaultLecturer: event.target.value || null }))
              }
            />
          )}
        </Field>

        <Field label="Odkaz na LMS" hint="Nepovinné.">
          {(id) => (
            <TextInput
              id={id}
              type="url"
              inputMode="url"
              value={draft.lmsUrl ?? ''}
              placeholder="https://lms.vsb.cz/..."
              onChange={(event) => setDraft((d) => ({ ...d, lmsUrl: event.target.value || null }))}
            />
          )}
        </Field>
      </form>
    </Modal>
  );
}
