import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { db } from '../db/db';
import {
  applyImport,
  exportAll,
  planImport,
  type EntityDiff,
  type ExportFile,
  type ImportMode,
  type ImportPlan,
} from '../db/transfer';
import { formatCsDate, todayIso } from '../domain/date';
import { countOf } from '../domain/plural';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Checkbox } from './ui/Field';
import { useToast } from './ui/Toast';
import { cx } from './tokens';

interface ImportDialogProps {
  file: ExportFile;
  fileName: string;
  onClose: () => void;
}

const MODES: ReadonlyArray<{ mode: ImportMode; title: string; hint: string }> = [
  {
    mode: 'merge-newer',
    title: 'Sloučit — novější vyhrává',
    hint: 'Pro přenos mezi telefonem a tabletem. U přednášky upravené na obou místech zůstane novější verze.',
  },
  {
    mode: 'merge-keep-mine',
    title: 'Sloučit — moje data vyhrávají',
    hint: 'Doplní jen to, co tady chybí. Nic, co tu už je, se nepřepíše.',
  },
  {
    mode: 'replace',
    title: 'Nahradit všechno',
    hint: 'Obnova ze zálohy. Co v souboru není, z aplikace zmizí.',
  },
];

type Plans = Record<ImportMode, ImportPlan>;

/**
 * Import s náhledem. Než se cokoliv zapíše, ukáže se pro každý režim, co
 * přesně udělá — a náhled počítá stejná funkce, která pak import provede.
 */
export function ImportDialog({ file, fileName, onClose }: ImportDialogProps) {
  const toast = useToast();
  const [plans, setPlans] = useState<Plans | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge-newer');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all(MODES.map(({ mode: m }) => planImport(db, file, m))).then(([a, b, c]) => {
      if (active && a && b && c) setPlans({ 'merge-newer': a, 'merge-keep-mine': b, replace: c });
    });
    return () => {
      active = false;
    };
  }, [file]);

  const plan = plans?.[mode];
  const removed = plan === undefined ? 0 : plan.subjects.removed + plan.lectures.removed;
  const needsConfirmation = mode === 'replace' && removed > 0;
  const nothingChanges = plan !== undefined && isNoop(plan);

  async function handleImport(): Promise<void> {
    setBusy(true);
    try {
      // Snímek před importem. „Zpět“ ho vrátí v režimu nahrazení — pokryté testem
      // „snímek pořízený před importem vrátí databázi přesně do původního stavu“.
      const snapshot = await exportAll(db);
      await applyImport(db, file, mode);
      onClose();
      toast('Import dokončen', {
        label: 'Zpět',
        run: async () => {
          await applyImport(db, snapshot, 'replace');
          toast('Import vrácen');
        },
      });
    } catch (error) {
      toast(`Import selhal, nic se nezměnilo: ${error instanceof Error ? error.message : 'neznámá chyba'}`);
      setBusy(false);
    }
  }

  const liveSubjects = file.subjects.filter((s) => s.deletedAt === null).length;
  const liveLectures = file.lectures.filter((l) => l.deletedAt === null).length;
  const exportedDate = todayIso(new Date(file.exportedAt));

  return (
    <Modal
      open
      title="Obnovit ze zálohy"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button
            variant={mode === 'replace' ? 'destructive' : 'primary'}
            disabled={plan === undefined || busy || nothingChanges || (needsConfirmation && !confirmed)}
            onClick={() => void handleImport()}
          >
            {mode === 'replace' ? 'Nahradit' : 'Sloučit'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
          <p className="truncate font-medium">{fileName}</p>
          <p className="text-xs text-muted">
            Záloha z {formatCsDate(exportedDate)} · {countOf(liveSubjects, 'předmět', 'předměty', 'předmětů')} ·{' '}
            {countOf(liveLectures, 'přednáška', 'přednášky', 'přednášek')}
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-muted">Jak naložit s daty</legend>
          {MODES.map((option) => {
            const optionPlan = plans?.[option.mode];
            const selected = option.mode === mode;
            return (
              <label
                key={option.mode}
                className={cx(
                  'flex cursor-pointer gap-3 rounded-xl p-3 ring-1 transition-colors',
                  selected ? 'bg-accent-soft ring-2 ring-accent' : 'ring-line hover:bg-surface-2',
                )}
              >
                <input
                  type="radio"
                  name="import-mode"
                  className="mt-1 size-5 shrink-0 accent-[var(--color-accent)]"
                  checked={selected}
                  onChange={() => {
                    setMode(option.mode);
                    setConfirmed(false);
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{option.title}</span>
                  <span className="mt-0.5 block text-xs text-muted">{option.hint}</span>
                  <span className="mt-2 block text-xs">
                    {optionPlan === undefined ? (
                      <span className="text-muted">Počítám…</span>
                    ) : (
                      <PlanSummary plan={optionPlan} />
                    )}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        {needsConfirmation && (
          <div className="flex flex-col gap-2 rounded-xl bg-danger/10 p-3 text-sm">
            <p className="flex items-start gap-2 text-danger">
              <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden />
              Z aplikace zmizí {countOf(removed, 'záznam', 'záznamy', 'záznamů')}, které soubor neobsahuje. Hned
              po importu to půjde vrátit, později už ne.
            </p>
            <Checkbox
              label="Rozumím, nahradit"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

function isNoop(plan: ImportPlan): boolean {
  const quiet = (d: EntityDiff): boolean => d.added === 0 && d.updated === 0 && d.removed === 0;
  return quiet(plan.subjects) && quiet(plan.lectures);
}

function PlanSummary({ plan }: { plan: ImportPlan }) {
  if (isNoop(plan)) return <span className="text-muted">Nic se nezmění — data jsou už stejná.</span>;
  return (
    <span className="flex flex-col gap-0.5">
      <DiffLine label="Předměty" diff={plan.subjects} />
      <DiffLine label="Přednášky" diff={plan.lectures} />
    </span>
  );
}

function DiffLine({ label, diff }: { label: string; diff: EntityDiff }) {
  const parts: Array<{ text: string; tone: 'add' | 'change' | 'remove' }> = [];
  if (diff.added > 0) parts.push({ text: `+${diff.added} nové`, tone: 'add' });
  if (diff.updated > 0) parts.push({ text: `${diff.updated} přepsáno`, tone: 'change' });
  if (diff.removed > 0) parts.push({ text: `−${diff.removed} smazáno`, tone: 'remove' });
  if (parts.length === 0) return null;

  return (
    <span>
      <span className="text-muted">{label}: </span>
      {parts.map((part, index) => (
        <span
          key={part.tone}
          className={cx(
            'font-medium',
            part.tone === 'add' && 'text-emerald-700 dark:text-emerald-300',
            part.tone === 'change' && 'text-amber-700 dark:text-amber-300',
            part.tone === 'remove' && 'text-danger',
          )}
        >
          {index > 0 && <span className="font-normal text-muted"> · </span>}
          {part.text}
        </span>
      ))}
    </span>
  );
}
