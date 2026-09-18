/**
 * Minimální formátování zápisků — jen to, co se při psaní poznámek z přednášky
 * opravdu používá: nadpisy, odrážky, číslované body a tučné písmo.
 *
 * Záměrně žádný Markdown parser z npm (desítky kB kvůli čtyřem pravidlům)
 * a žádné vkládání HTML: výstupem je strom, ze kterého React složí prvky,
 * takže vložený text nikdy nemůže spustit skript.
 */

export type Inline = { kind: 'text'; text: string } | { kind: 'bold'; text: string } | { kind: 'code'; text: string };

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; content: Inline[] }
  | { kind: 'paragraph'; content: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Array<{ depth: number; content: Inline[] }> };

const BULLET = /^(\s*)[-*•–]\s+(.*)$/;
const NUMBERED = /^(\s*)\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;

/** **tučně** a `kód`; ostatní hvězdičky nechá být, ať se nerozbije matematika typu a*b. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const pattern = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    if (index > last) out.push({ kind: 'text', text: text.slice(last, index) });
    if (match[1] !== undefined) out.push({ kind: 'bold', text: match[1] });
    else if (match[2] !== undefined) out.push({ kind: 'code', text: match[2] });
    last = index + match[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

function depthOf(indent: string): number {
  const spaces = indent.replace(/\t/g, '  ').length;
  return Math.min(3, Math.floor(spaces / 2));
}

export function parseNotes(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: 'paragraph', content: parseInline(paragraph.join('\n')) });
    paragraph = [];
  };

  for (const rawLine of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trimEnd();
    if (line.trim() === '') {
      flushParagraph();
      continue;
    }

    const heading = HEADING.exec(line.trim());
    if (heading !== null) {
      flushParagraph();
      const level = Math.min(3, heading[1]?.length ?? 1) as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, content: parseInline(heading[2] ?? '') });
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = bullet === null ? NUMBERED.exec(line) : null;
    const item = bullet ?? numbered;
    if (item !== null) {
      flushParagraph();
      const ordered = numbered !== null;
      const entry = { depth: depthOf(item[1] ?? ''), content: parseInline(item[2] ?? '') };
      const previous = blocks.at(-1);
      if (previous?.kind === 'list' && previous.ordered === ordered) previous.items.push(entry);
      else blocks.push({ kind: 'list', ordered, items: [entry] });
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  return blocks;
}
