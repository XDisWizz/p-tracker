import { useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  Cloud,
  CloudOff,
  ExternalLink,
  LogIn,
  RefreshCw,
  Settings2,
  Unplug,
} from 'lucide-react';
import { useDriveSync, type SyncPhase } from '../hooks/useDriveSync';
import { describeSyncAge } from '../domain/sync';
import { isClientId, CLIENT_ID_FROM_BUILD } from '../sync/config';
import { DRIVE_FILE_NAME } from '../sync/drive';
import { useNow } from '../hooks/useNow';
import { Button } from './ui/Button';
import { Field, TextInput } from './ui/Field';
import { Modal } from './ui/Modal';
import { cx } from './tokens';

/**
 * Nastavení synchronizace.
 *
 * Zřízení přístupu u Googlu je jednorázová otravná věc, kterou za uživatele
 * nikdo neudělá — projekt v Google Cloudu musí patřit jemu, jinak by jeho data
 * tekla přes cizí účet. Návod je proto přímo tady a s adresou téhle stránky
 * předvyplněnou, ať se nic neopisuje z paměti.
 */

const PHASE_LOOK: Record<SyncPhase, { label: string; icon: ReactNode; tone: string }> = {
  unconfigured: { label: 'Nenastavená', icon: <CloudOff size={16} />, tone: 'text-muted' },
  off: { label: 'Vypnutá', icon: <CloudOff size={16} />, tone: 'text-muted' },
  idle: { label: 'Zapnutá', icon: <Check size={16} />, tone: 'text-emerald-700 dark:text-emerald-300' },
  syncing: { label: 'Synchronizuji…', icon: <RefreshCw size={16} className="animate-spin" />, tone: 'text-accent' },
  'needs-auth': { label: 'Přihlášení vypršelo', icon: <LogIn size={16} />, tone: 'text-amber-700 dark:text-amber-300' },
  offline: { label: 'Offline — pošle se po připojení', icon: <CloudOff size={16} />, tone: 'text-muted' },
  error: { label: 'Nepovedlo se', icon: <AlertTriangle size={16} />, tone: 'text-danger' },
};

export function SyncSection() {
  const sync = useDriveSync();
  const now = useNow(30_000);
  const [setupOpen, setSetupOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const look = PHASE_LOOK[sync.phase];

  async function guard(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    try {
      await action();
    } catch {
      // Chybu si drží sám hook a ukáže ji ve stavu; tady jde jen o odblokování tlačítek.
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="text-muted">
          <Cloud size={17} />
        </span>
        Synchronizace mezi zařízeními
      </h3>

      <p className={cx('flex items-center gap-2 text-sm font-medium', look.tone)}>
        {look.icon}
        {look.label}
      </p>

      {sync.enabled && (
        <p className="mt-1 text-xs text-muted">
          Naposledy {describeSyncAge(sync.lastSyncAt, now)}
          {sync.account !== null && ` · ${sync.account}`}
        </p>
      )}

      {sync.error !== null && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-sm text-danger">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden />
          {sync.error}
        </p>
      )}

      {sync.phase === 'unconfigured' ? (
        <>
          <p className="mt-2 text-xs text-muted">
            Data můžou jezdit přes tvůj Google Disk — na telefonu uvidíš, co jsi napsal na počítači, a naopak.
            Aplikace si na Disku vytvoří jediný soubor <code className="font-mono">{DRIVE_FILE_NAME}</code> a na
            nic jiného nevidí. Nejdřív je potřeba jednorázové nastavení u Googlu.
          </p>
          <div className="mt-3">
            <Button variant="primary" onClick={() => setSetupOpen(true)}>
              <Settings2 size={16} />
              Nastavit
            </Button>
          </div>
        </>
      ) : !sync.enabled ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" disabled={busy} onClick={() => void guard(sync.connect)}>
            <LogIn size={16} />
            Připojit Google Disk
          </Button>
          {!CLIENT_ID_FROM_BUILD && (
            <Button onClick={() => setSetupOpen(true)}>
              <Settings2 size={16} />
              Změnit nastavení
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {sync.phase === 'needs-auth' ? (
            <Button variant="primary" disabled={busy} onClick={() => void guard(sync.connect)}>
              <LogIn size={16} />
              Přihlásit znovu
            </Button>
          ) : (
            <Button variant="primary" disabled={busy} onClick={() => void guard(sync.syncNow)}>
              <RefreshCw size={16} className={sync.phase === 'syncing' ? 'animate-spin' : undefined} />
              Synchronizovat teď
            </Button>
          )}
          <Button disabled={busy} onClick={() => void guard(() => sync.disconnect(false))}>
            <Unplug size={16} />
            Odpojit
          </Button>
        </div>
      )}

      {sync.enabled && (
        <p className="mt-3 text-xs text-muted">
          Změny odcházejí samy a na cizí se kouká, dokud máš aplikaci otevřenou. Na obou stranách vyhrává
          novější úprava, smazané záznamy se nevracejí zpátky.
        </p>
      )}

      <SetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} />
    </section>
  );
}

const CONSOLE_URL = 'https://console.cloud.google.com/apis/credentials';

function SetupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sync = useDriveSync();
  const [value, setValue] = useState(sync.clientId ?? '');
  const [touched, setTouched] = useState(false);
  const valid = isClientId(value);
  const origin = window.location.origin;

  function save(): void {
    if (!valid) {
      setTouched(true);
      return;
    }
    sync.configure(value.trim());
    onClose();
  }

  return (
    <Modal
      open={open}
      title="Nastavení synchronizace"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Zavřít</Button>
          <Button variant="primary" onClick={save}>
            Uložit
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-muted">
          Přístup ke tvému Disku musí povolit Google, a to jen projektu, který patří tobě. Je to na pět minut
          a dělá se to jednou.
        </p>

        <ol className="flex list-decimal flex-col gap-2 pl-5 text-muted marker:font-semibold marker:text-ink">
          <li>
            Otevři{' '}
            <a
              href={CONSOLE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-accent underline"
            >
              Google Cloud Console
              <ExternalLink size={13} aria-hidden />
            </a>{' '}
            a založ nový projekt, třeba <em>Přednášky</em>.
          </li>
          <li>
            V nabídce <strong className="text-ink">APIs &amp; Services → Library</strong> zapni{' '}
            <strong className="text-ink">Google Drive API</strong>.
          </li>
          <li>
            V <strong className="text-ink">OAuth consent screen</strong> vyplň název a svůj e-mail. Typ nech{' '}
            <em>External</em> a sebe přidej mezi <em>Test users</em> — víc uživatelů tahle aplikace nepotřebuje.
          </li>
          <li>
            V <strong className="text-ink">Credentials</strong> zvol <em>Create credentials → OAuth client ID</em>{' '}
            a typ <strong className="text-ink">Web application</strong>.
          </li>
          <li>
            Do <strong className="text-ink">Authorized JavaScript origins</strong> vlož přesně tuhle adresu:
            <code className="mt-1 block rounded-lg bg-surface-2 px-2 py-1 font-mono text-xs break-all text-ink">
              {origin}
            </code>
            Pole s přesměrováním zůstane prázdné, nepoužívá se.
          </li>
          <li>Vzniklé „Client ID“ zkopíruj sem dolů.</li>
        </ol>

        <Field
          label="Client ID"
          hint="Končí na .apps.googleusercontent.com. Není to heslo — zůstává jen v tomhle zařízení."
        >
          {(id) => (
            <TextInput
              id={id}
              data-autofocus
              value={value}
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="123456789-abc.apps.googleusercontent.com"
              onChange={(event) => setValue(event.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={touched && !valid}
            />
          )}
        </Field>

        {touched && !valid && value.trim() !== '' && (
          <p role="alert" className="text-sm text-danger">
            Tohle nevypadá jako Client ID. Má končit na <code className="font-mono">.apps.googleusercontent.com</code>.
          </p>
        )}

        {sync.clientId !== null && (
          <Button
            variant="danger"
            className="self-start"
            onClick={() => {
              sync.configure(null);
              setValue('');
              onClose();
            }}
          >
            Zapomenout nastavení
          </Button>
        )}
      </div>
    </Modal>
  );
}
