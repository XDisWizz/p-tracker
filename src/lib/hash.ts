/**
 * Krátký otisk textu (cyrb53). Není to kryptografie a ani se tak nepoužívá —
 * slouží jedinému účelu: poznat „změnila se data od minule?“ bez toho, aby se
 * do nastavení ukládala celá kopie exportu.
 *
 * K otisku se přidává délka vstupu. Dva různé obsahy stejné délky by musely
 * shodou okolností trefit stejných 53 bitů; s délkou navíc je to ještě o řád
 * nepravděpodobnější než nepozorovaná chyba disku.
 */
export function fingerprint(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return `${text.length.toString(36)}-${value.toString(36)}`;
}
