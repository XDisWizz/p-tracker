import { describe, expect, it } from 'vitest';
import { parseInline, parseNotes } from './notesFormat';

describe('parseInline', () => {
  it('tučné písmo a kód', () => {
    expect(parseInline('Věta **o sevření** a `lim`')).toEqual([
      { kind: 'text', text: 'Věta ' },
      { kind: 'bold', text: 'o sevření' },
      { kind: 'text', text: ' a ' },
      { kind: 'code', text: 'lim' },
    ]);
  });

  it('osamocená hvězdička z matematiky zůstane textem', () => {
    expect(parseInline('a*b + c*d')).toEqual([{ kind: 'text', text: 'a*b + c*d' }]);
  });
});

describe('parseNotes', () => {
  it('odrážky všech obvyklých druhů spojí do jednoho seznamu', () => {
    const blocks = parseNotes('- první\n* druhý\n• třetí');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: 'list', ordered: false });
    expect(blocks[0]?.kind === 'list' && blocks[0].items).toHaveLength(3);
  });

  it('odsazení vytvoří vnořený bod', () => {
    const blocks = parseNotes('- limita\n  - vlastní\n  - nevlastní');
    expect(blocks[0]?.kind === 'list' && blocks[0].items.map((i) => i.depth)).toEqual([0, 1, 1]);
  });

  it('nadpisy, číslovaný seznam a odstavce', () => {
    const blocks = parseNotes('# Limity\n\nÚvodní věta\npokračování\n\n1. krok\n2) krok');
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'list']);
    expect(blocks[2]).toMatchObject({ kind: 'list', ordered: true });
  });

  it('odstavec zachová zalomení řádků uvnitř', () => {
    const blocks = parseNotes('řádek jedna\nřádek dva');
    expect(blocks[0]).toEqual({ kind: 'paragraph', content: [{ kind: 'text', text: 'řádek jedna\nřádek dva' }] });
  });

  it('text s HTML zůstane textem', () => {
    const blocks = parseNotes('<img src=x onerror=alert(1)>');
    expect(blocks[0]).toEqual({
      kind: 'paragraph',
      content: [{ kind: 'text', text: '<img src=x onerror=alert(1)>' }],
    });
  });

  it('prázdný vstup', () => {
    expect(parseNotes('   \n\n')).toEqual([]);
  });
});
