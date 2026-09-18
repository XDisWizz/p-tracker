import { useMemo } from 'react';
import { parseNotes, type Inline } from '../lib/notesFormat';
import { cx } from './tokens';

function InlineText({ content }: { content: Inline[] }) {
  return (
    <>
      {content.map((part, index) => {
        if (part.kind === 'bold') return <strong key={index}>{part.text}</strong>;
        if (part.kind === 'code')
          return (
            <code key={index} className="rounded bg-surface-2 px-1 font-mono text-[0.9em]">
              {part.text}
            </code>
          );
        return <span key={index}>{part.text}</span>;
      })}
    </>
  );
}

/** Zápisky s odrážkami, nadpisy a tučným písmem. Bez HTML — nic se neinterpretuje. */
export function FormattedNotes({ text, className }: { text: string; className?: string }) {
  const blocks = useMemo(() => parseNotes(text), [text]);

  return (
    <div className={cx('flex flex-col gap-1.5 text-sm leading-relaxed', className)}>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'heading':
            return (
              <p
                key={index}
                className={cx('font-semibold', block.level === 1 ? 'text-base' : 'text-sm', index > 0 && 'mt-1.5')}
              >
                <InlineText content={block.content} />
              </p>
            );
          case 'paragraph':
            return (
              <p key={index} className="whitespace-pre-line">
                <InlineText content={block.content} />
              </p>
            );
          case 'list': {
            const List = block.ordered ? 'ol' : 'ul';
            return (
              <List key={index} className={cx('flex flex-col gap-0.5', block.ordered ? 'list-decimal' : 'list-disc', 'pl-5')}>
                {block.items.map((item, i) => (
                  <li key={i} style={{ marginLeft: `${item.depth * 1.1}rem` }} className="marker:text-muted">
                    <InlineText content={item.content} />
                  </li>
                ))}
              </List>
            );
          }
        }
      })}
    </div>
  );
}
