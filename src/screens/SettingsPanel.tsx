import { useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Download,
  HardDrive,
  Keyboard,
  Monitor,
  Moon,
  Share2,
  ShieldCheck,
  Sun,
  Upload,
} from 'lucide-react';
import { describeLastBackup, isBackupDue } from '../domain/backup';
import { parseExportText, type ExportFile } from '../db/transfer';
import { canShareFiles, formatBytes } from '../lib/files';
import { useBackupActions, useBackupStatus } from '../hooks/useBackup';
import { useStorageInfo } from '../hooks/useStorage';
import type { ThemeChoice } from '../hooks/useTheme';
import { ImportDialog } from '../components/ImportDialog';
import { TermsSection } from '../components/TermsSection';
import { Button } from '../components/ui/Button';
import { cx } from '../components/tokens';

interface SettingsPanelProps {
  themeChoice: ThemeChoice;
  onThemeChange: (choice: ThemeChoice) => void;
}

export function SettingsPanel({ themeChoice, onThemeChange }: SettingsPanelProps) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4">
        <h2 className="text-lg font-semibold">Nastavení</h2>
        <BackupSection />
        <TermsSection />
        <StorageSection />
        <AppearanceSection choice={themeChoice} onChange={onThemeChange} />
        <AboutSection />
      </div>
    </div>
  );
}

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="text-muted">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function BackupSection() {
  const status = useBackupStatus();
  const { exportBackup } = useBackupActions();
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ file: ExportFile; name: string } | null>(null);
  const shareable = canShareFiles();

  async function handleFile(selected: File | undefined): Promise<void> {
    setError(null);
    if (selected === undefined) return;
    const result = parseExportText(await selected.text());
    if (result.ok) setPending({ file: result.file, name: selected.name });
    else setError(result.error);
  }

  const due = status !== undefined && isBackupDue(status);

  return (
    <Card icon={<ShieldCheck size={17} />} title="Záloha">
      <p className={cx('text-sm', due ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-muted')}>
        Poslední záloha: {status === undefined ? '…' : describeLastBackup(status.lastExportAt)}
      </p>
      <p className="mt-1 text-xs text-muted">
        Data jsou jen v tomhle zařízení. Záloha je jeden JSON soubor — ulož ho na disk nebo do cloudu a
        stejným souborem přeneseš data na tablet.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void exportBackup('download')}>
          <Download size={17} />
          Stáhnout zálohu
        </Button>
        {shareable && (
          <Button onClick={() => void exportBackup('share')}>
            <Share2 size={17} />
            Sdílet…
          </Button>
        )}
        <Button onClick={() => fileInput.current?.click()}>
          <Upload size={17} />
          Obnovit ze zálohy…
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            // Vynulovat, aby šel stejný soubor vybrat znovu i po zrušení dialogu.
            event.target.value = '';
          }}
        />
      </div>

      {error !== null && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-sm text-danger">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      {pending !== null && (
        <ImportDialog file={pending.file} fileName={pending.name} onClose={() => setPending(null)} />
      )}
    </Card>
  );
}

function StorageSection() {
  const { info, requestPersist } = useStorageInfo();
  const [denied, setDenied] = useState(false);

  return (
    <Card icon={<HardDrive size={17} />} title="Úložiště">
      {info === null ? (
        <p className="text-sm text-muted">Zjišťuji…</p>
      ) : !info.supported ? (
        <p className="text-sm text-muted">Prohlížeč neumí říct, jak s úložištěm zachází. Zálohuj pravidelně.</p>
      ) : (
        <>
          <p className="text-sm">
            {info.persisted ? (
              <span className="font-medium text-emerald-700 dark:text-emerald-300">Trvalé</span>
            ) : (
              <span className="font-medium text-amber-700 dark:text-amber-300">Běžné</span>
            )}
            {info.usageBytes !== null && <span className="text-muted"> · zabráno {formatBytes(info.usageBytes)}</span>}
          </p>
          <p className="mt-1 text-xs text-muted">
            {info.persisted
              ? 'Prohlížeč data sám nesmaže, ani když dojde místo.'
              : 'Při nedostatku místa smí prohlížeč data smazat bez ptaní.'}
          </p>
          {!info.persisted && (
            <div className="mt-3 flex flex-col gap-2">
              <div>
                <Button onClick={() => void requestPersist().then((granted) => setDenied(!granted))}>
                  Požádat o trvalé úložiště
                </Button>
              </div>
              {denied && (
                <p className="text-xs text-muted">
                  Prohlížeč žádost zamítl. Chrome ji obvykle schválí, až si aplikaci přidáš na plochu nebo ji
                  budeš častěji používat.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

const THEME_OPTIONS: ReadonlyArray<{ value: ThemeChoice; label: string; icon: ReactNode }> = [
  { value: 'system', label: 'Podle systému', icon: <Monitor size={16} /> },
  { value: 'light', label: 'Světlý', icon: <Sun size={16} /> },
  { value: 'dark', label: 'Tmavý', icon: <Moon size={16} /> },
];

function AppearanceSection({
  choice,
  onChange,
}: {
  choice: ThemeChoice;
  onChange: (choice: ThemeChoice) => void;
}) {
  return (
    <Card icon={<Monitor size={17} />} title="Vzhled">
      <div role="radiogroup" aria-label="Motiv" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={choice === option.value}
            onClick={() => onChange(option.value)}
            className={cx(
              'inline-flex h-11 items-center justify-center gap-1.5 rounded-lg text-sm',
              choice === option.value ? 'bg-surface font-medium shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink',
            )}
          >
            {option.icon}
            <span className="truncate">{option.label}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

const SHORTCUTS: ReadonlyArray<[string, string]> = [
  ['n', 'Nová přednáška'],
  ['/', 'Hledat'],
  ['j / k', 'Další / předchozí přednáška v seznamu'],
  ['Enter', 'Otevřít vybranou přednášku'],
  ['1 – 5', 'Nastavit stav vybrané přednášky'],
  ['0', 'Přeskočit vybranou přednášku'],
  ['g r', 'Rozvrh'],
  ['Esc', 'Zavřít okno, vymazat hledání'],
];

function AboutSection() {
  return (
    <Card icon={<Keyboard size={17} />} title="Klávesové zkratky">
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-sm">
        {SHORTCUTS.map(([key, label]) => (
          <div key={key} className="contents">
            <dt>
              <kbd className="inline-flex min-w-8 justify-center rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs ring-1 ring-line">
                {key}
              </kbd>
            </dt>
            <dd className="text-muted">{label}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs text-muted">
        Žádný účet, žádný server, žádná síťová komunikace. Verze {__APP_VERSION__}.
      </p>
    </Card>
  );
}
