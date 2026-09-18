import { useMemo, useState } from 'react';
import { CalendarRange, Plus, X } from 'lucide-react';
import { formatCsDate } from '../domain/date';
import { teachingWeekCount } from '../domain/schedule';
import { guessTerm, normalizeSkipDates, termPreset, validateTerm } from '../domain/terms';
import { countOf } from '../domain/plural';
import type { Term, TermInput } from '../domain/types';
import { schedule, terms as termsRepo, useSubjects, useTerms } from '../hooks/useLiveData';
import { Button } from './ui/Button';
import { TextInput } from './ui/Field';
import { useToast } from './ui/Toast';

/**
 * Období výuky pro každý semestr, který mají předměty. Z něj se počítají
 * liché/sudé týdny a data přednášek; svátky v něm hodiny ruší.
 */
export function TermsSection() {
  const subjects = useSubjects(true);
  const stored = useTerms();

  const termIds = useMemo(() => {
    const ids = new Set((subjects ?? []).map((s) => s.term).filter((t) => t.trim() !== ''));
    for (const t of stored ?? []) ids.add(t.id);
    return [...ids].toSorted().toReversed();
  }, [subjects, stored]);

  if (subjects === undefined || stored === undefined) return null;

  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <span className="text-muted">
          <CalendarRange size={17} />
        </span>
        Semestry
      </h3>
      <p className="mb-3 text-xs text-muted">
        Z období výuky se počítají liché a sudé týdny a data přednášek z rozvrhu. Ve dnech volna hodiny odpadají.
      </p>
      {termIds.length === 0 ? (
        <p className="text-sm text-muted">Zatím žádný předmět — semestr se objeví s prvním předmětem.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {termIds.map((id) => (
            <TermEditor key={id} id={id} stored={stored.find((t) => t.id === id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function TermEditor({ id, stored }: { id: string; stored: Term | undefined }) {
  const toast = useToast();
  const preset = termPreset(id);
  const initial: TermInput = stored ?? preset ?? guessTerm(id);
  const [draft, setDraft] = useState<TermInput>(initial);
  const [newSkip, setNewSkip] = useState('');
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(stored === undefined ? null : {
    id: stored.id,
    teachingStart: stored.teachingStart,
    teachingEnd: stored.teachingEnd,
    skipDates: stored.skipDates,
  });
  const problem = validateTerm(draft);
  const source = stored !== undefined ? null : preset !== undefined ? 'podle harmonogramu FEI' : 'odhad — zkontroluj';

  async function save(): Promise<void> {
    setSaving(true);
    try {
      const result = await termsRepo.save({ ...draft, skipDates: normalizeSkipDates(draft.skipDates) });
      if (typeof result === 'string') {
        toast(result);
        return;
      }
      const synced = await schedule.syncAll();
      const created = synced.reduce((sum, r) => sum + (r.status === 'ok' ? r.created : 0), 0);
      toast(
        created > 0
          ? `Semestr uložen · přidáno ${countOf(created, 'přednáška', 'přednášky', 'přednášek')} podle rozvrhu`
          : 'Semestr uložen',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{id}</p>
        <p className="text-xs text-muted">
          {problem === null ? `${teachingWeekCount(draft)} týdnů výuky` : problem}
          {source !== null && ` · ${source}`}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Začátek výuky
          <TextInput
            type="date"
            value={draft.teachingStart}
            onChange={(e) => setDraft((d) => ({ ...d, teachingStart: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Konec výuky
          <TextInput
            type="date"
            value={draft.teachingEnd}
            onChange={(e) => setDraft((d) => ({ ...d, teachingEnd: e.target.value }))}
          />
        </label>
      </div>

      <p className="mt-3 mb-1 text-xs text-muted">Dny bez výuky</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {draft.skipDates.map((date) => (
          <span key={date} className="inline-flex h-9 items-center gap-1 rounded-full bg-surface pr-1 pl-3 text-xs ring-1 ring-line">
            {formatCsDate(date)}
            <button
              type="button"
              aria-label={`Odebrat ${formatCsDate(date)}`}
              onClick={() => setDraft((d) => ({ ...d, skipDates: d.skipDates.filter((x) => x !== date) }))}
              className="inline-flex size-7 items-center justify-center rounded-full text-muted hover:text-ink"
            >
              <X size={13} />
            </button>
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <TextInput
            type="date"
            value={newSkip}
            aria-label="Přidat den volna"
            className="h-9 w-40 text-sm"
            onChange={(e) => setNewSkip(e.target.value)}
          />
          <Button
            size="sm"
            variant="ghost"
            disabled={newSkip === ''}
            onClick={() => {
              setDraft((d) => ({ ...d, skipDates: normalizeSkipDates([...d.skipDates, newSkip]) }));
              setNewSkip('');
            }}
          >
            <Plus size={14} />
            Přidat
          </Button>
        </span>
      </div>

      {(dirty || stored === undefined) && (
        <div className="mt-3 flex justify-end">
          <Button variant="primary" size="sm" disabled={problem !== null || saving} onClick={() => void save()}>
            {stored === undefined ? 'Potvrdit a vytvořit přednášky' : 'Uložit a přepočítat přednášky'}
          </Button>
        </div>
      )}
    </div>
  );
}
