/**
 * Práce se soubory v prohlížeči. Všechno lokálně — soubor nikdy neopustí
 * zařízení jinak než přes systémové stažení nebo sdílení, o kterém rozhoduje uživatel.
 */

export function downloadFile(filename: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Uvolnit až s odstupem: Chrome na Androidu začíná stahovat asynchronně
  // a okamžité zneplatnění adresy by stažení tiše zrušilo.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Typ, pod kterým jde soubor sdílet. Chrome na Androidu sdílení JSON souborů
 * odmítá, textové ale bere — obsah i přípona `.json` zůstanou stejné.
 */
function shareableType(filename: string): string | null {
  if (typeof navigator.canShare !== 'function') return null;
  for (const type of ['application/json', 'text/plain']) {
    try {
      if (navigator.canShare({ files: [new File(['{}'], filename, { type })] })) return type;
    } catch {
      // Některé prohlížeče na neznámý typ vyhodí výjimku místo `false`.
    }
  }
  return null;
}

export function canShareFiles(filename = 'zaloha.json'): boolean {
  return shareableType(filename) !== null;
}

export type ShareOutcome = 'shared' | 'cancelled' | 'unsupported';

/** Systémové sdílení — na telefonu třeba rovnou na Google Disk nebo do mailu. */
export async function shareFile(filename: string, text: string): Promise<ShareOutcome> {
  const type = shareableType(filename);
  if (type === null) return 'unsupported';
  try {
    await navigator.share({ files: [new File([text], filename, { type })], title: filename });
    return 'shared';
  } catch (error) {
    // Zavření sdílecího dialogu není chyba, jen si to uživatel rozmyslel.
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    throw error;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
