import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { db, openVerified } from '../db/db';
import { describeError, explainStorageError } from '../lib/errors';

/**
 * Pojistky proti prázdné stránce. Bez nich React při jakékoliv chybě ve
 * vykreslování celou aplikaci odpojí a uživateli zůstane jen tmavé pozadí.
 */

function FailureScreen({ title, hint, detail }: { title: string; hint: string; detail: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-6 text-ink">
      <div className="w-full max-w-lg rounded-2xl bg-surface p-6 ring-1 ring-line">
        <div className="flex items-start gap-3">
          <AlertTriangle size={24} className="mt-0.5 shrink-0 text-danger" aria-hidden />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">{title}</h1>
            <p className="mt-2 text-sm text-muted">{hint}</p>
          </div>
        </div>

        <pre className="mt-4 max-h-40 overflow-auto rounded-xl bg-surface-2 p-3 text-xs whitespace-pre-wrap break-words">
          {detail}
        </pre>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-white"
          >
            <RotateCw size={16} />
            Načíst znovu
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(detail).then(() => setCopied(true));
            }}
            className="inline-flex h-11 items-center rounded-xl bg-surface-2 px-4 text-sm ring-1 ring-line"
          >
            {copied ? 'Zkopírováno' : 'Zkopírovat popis chyby'}
          </button>
        </div>

        <p className="mt-4 text-xs text-muted">Uložená data tím nejsou nijak dotčená.</p>
      </div>
    </div>
  );
}

interface BoundaryState {
  error: unknown;
}

/** Zachytí chybu ve vykreslování a místo prázdné stránky ukáže, co se stalo. */
export class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Aplikace spadla při vykreslování:', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    return (
      <FailureScreen
        title="Něco se pokazilo"
        hint="Aplikace narazila na chybu, se kterou nepočítala. Zkus ji načíst znovu; pokud se to opakuje, pošli popis chyby níže."
        detail={describeError(this.state.error)}
      />
    );
  }
}

type GateState = { status: 'opening' } | { status: 'ready' } | { status: 'failed'; error: unknown };

/**
 * Otevře databázi dřív, než se vykreslí zbytek aplikace. Když to nejde
 * (blokované úložiště, soukromý režim, došlo místo), řekne proč — jinak by
 * aplikace krátce probleskla a zmizela s prvním dotazem do databáze.
 */
export function DatabaseGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ status: 'opening' });

  useEffect(() => {
    let active = true;
    openVerified(db).then(
      () => active && setState({ status: 'ready' }),
      (error: unknown) => {
        console.error('Databázi se nepodařilo otevřít:', error);
        if (active) setState({ status: 'failed', error });
      },
    );
    return () => {
      active = false;
    };
  }, []);

  // Neprázdný obal: záložní hláška v index.html se ukáže jen tehdy, když #root zůstane prázdný.
  if (state.status === 'opening') return <div aria-busy="true" className="min-h-dvh bg-canvas" />;
  if (state.status === 'failed') return <FailureScreen {...explainStorageError(state.error)} />;
  return children;
}
