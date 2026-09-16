export interface ErrorExplanation {
  title: string;
  hint: string;
  /** Technický popis k nahlášení — název a zpráva celého řetězce chyb. */
  detail: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Dexie chybu obaluje (`OpenFailedError` → `inner: SecurityError`). Projdi celý řetěz. */
function chain(error: unknown): Array<{ name: string; message: string }> {
  const out: Array<{ name: string; message: string }> = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && isRecord(current); depth += 1) {
    const name = typeof current['name'] === 'string' ? current['name'] : 'Error';
    const message = typeof current['message'] === 'string' ? current['message'] : '';
    // Dexie často opakuje zprávu vnitřní chyby i v obalu — duplicitu nevypisuj dvakrát.
    const previous = out[out.length - 1];
    if (previous === undefined || previous.message !== message || message === '') out.push({ name, message });
    current = current['inner'];
  }
  if (out.length === 0) out.push({ name: 'Error', message: String(error) });
  return out;
}

/**
 * Srozumitelné vysvětlení, proč se nepodařilo otevřít databázi prohlížeče.
 * Uživatel s prázdnou stránkou neví nic; s tímhle ví, co přepnout.
 */
export function explainStorageError(error: unknown): ErrorExplanation {
  const links = chain(error);
  const names = new Set(links.map((l) => l.name));
  const detail = links.map((l) => (l.message === '' ? l.name : `${l.name}: ${l.message}`)).join(' ← ');

  if (names.has('MissingAPIError') || names.has('SecurityError') || names.has('InvalidStateError')) {
    return {
      title: 'Prohlížeč nepovolil ukládat data',
      hint:
        'Aplikace ukládá data do úložiště prohlížeče (IndexedDB). Povol pro tuhle stránku ukládání dat ' +
        '(v nastavení cookies a dat webu, případně ve štítu nebo blokátoru), nepoužívej soukromé okno a načti stránku znovu.',
      detail,
    };
  }
  if (names.has('SchemaMismatchError') || names.has('NotFoundError')) {
    return {
      title: 'V úložišti jsou nekompatibilní data',
      hint:
        'Pod stejnou adresou nejspíš dřív běžela jiná verze aplikace nebo jiný projekt a jeho databáze se jmenuje stejně. ' +
        'Pokud tu nemáš nic důležitého, smaž data webu pro tuto adresu (ikona vlevo od adresy → Nastavení webu → Smazat data) a načti znovu.',
      detail,
    };
  }
  if (names.has('VersionError')) {
    return {
      title: 'Data jsou z novější verze aplikace',
      hint: 'Zavři ostatní karty s aplikací a načti stránku znovu, ať se stáhne aktuální verze.',
      detail,
    };
  }
  if (names.has('QuotaExceededError')) {
    return {
      title: 'V zařízení došlo místo',
      hint: 'Uvolni místo v úložišti a načti stránku znovu. Data zůstala nedotčená.',
      detail,
    };
  }
  return {
    title: 'Databázi se nepodařilo otevřít',
    hint: 'Často pomůže zavřít ostatní karty s aplikací a načíst stránku znovu.',
    detail,
  };
}

/** Popis libovolné chyby pro zobrazení a zkopírování. */
export function describeError(error: unknown): string {
  return chain(error)
    .map((l) => (l.message === '' ? l.name : `${l.name}: ${l.message}`))
    .join(' ← ');
}
