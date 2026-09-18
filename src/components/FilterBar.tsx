import { useState, type ReactNode, type Ref } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import {
  EMPTY_FILTER,
  countFilterChips,
  toggleValue,
  type LectureFilter,
} from '../domain/filter';
import { STATUS_META } from '../domain/status';
import { LECTURE_STATUSES, type Subject } from '../domain/types';
import { Chip } from './ui/Chip';
import { Button } from './ui/Button';
import { STATUS_VISUALS, SUBJECT_COLOR_CLASSES, cx } from './tokens';

interface FilterBarProps {
  filter: LectureFilter;
  onChange: (filter: LectureFilter) => void;
  subjects: readonly Subject[];
  tags: readonly string[];
  searchRef?: Ref<HTMLInputElement>;
}

export function FilterBar({ filter, onChange, subjects, tags, searchRef }: FilterBarProps) {
  const chipCount = countFilterChips(filter);
  // Když je filtr zapnutý už při otevření (třeba z adresy), panel se rovnou ukáže —
  // jinak by uživatel nevěděl, proč seznam vypadá, jak vypadá.
  const [expanded, setExpanded] = useState(chipCount > 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={17}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            ref={searchRef}
            type="search"
            enterKeyHint="search"
            value={filter.query}
            placeholder="Hledat v názvu, poznámce, tagu…"
            aria-label="Hledat přednášky"
            onChange={(event) => onChange({ ...filter, query: event.target.value })}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              // První Escape vymaže dotaz, druhý opustí pole.
              if (filter.query !== '') onChange({ ...filter, query: '' });
              else event.currentTarget.blur();
              event.preventDefault();
            }}
            className={cx(
              'h-11 w-full rounded-xl bg-surface-2 pr-10 pl-9 text-base text-ink ring-1 ring-line',
              'placeholder:text-muted/70 focus:ring-2 focus:ring-accent focus:outline-none',
              '[&::-webkit-search-cancel-button]:hidden',
            )}
          />
          {filter.query !== '' && (
            <button
              type="button"
              aria-label="Vymazat hledání"
              onClick={() => onChange({ ...filter, query: '' })}
              className="absolute top-0 right-0 inline-flex size-11 items-center justify-center text-muted hover:text-ink"
            >
              <X size={17} />
            </button>
          )}
        </div>

        <Button
          variant={expanded || chipCount > 0 ? 'secondary' : 'ghost'}
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
          className="shrink-0 px-3"
        >
          <SlidersHorizontal size={17} />
          <span className="hidden sm:inline">Filtry</span>
          {chipCount > 0 && (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-white">
              {chipCount}
            </span>
          )}
        </Button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 rounded-2xl bg-surface p-3 ring-1 ring-line">
          {subjects.length > 1 && (
            <ChipGroup label="Předmět">
              {subjects.map((subject) => (
                <Chip
                  key={subject.id}
                  pressed={filter.subjectIds.includes(subject.id)}
                  pressedClassName={SUBJECT_COLOR_CLASSES[subject.color].soft}
                  onToggle={() =>
                    onChange({ ...filter, subjectIds: toggleValue(filter.subjectIds, subject.id) })
                  }
                >
                  <span
                    className={cx('size-2 rounded-full', SUBJECT_COLOR_CLASSES[subject.color].dot)}
                    aria-hidden
                  />
                  {subject.code || subject.name}
                </Chip>
              ))}
            </ChipGroup>
          )}

          <ChipGroup
            label="Stav"
            hint={filter.statuses.length === 0 ? 'Bez výběru se ukazují nezpracované.' : undefined}
          >
            {LECTURE_STATUSES.map((status) => {
              const Icon = STATUS_VISUALS[status].icon;
              return (
                <Chip
                  key={status}
                  pressed={filter.statuses.includes(status)}
                  pressedClassName={STATUS_VISUALS[status].badge}
                  onToggle={() =>
                    onChange({ ...filter, statuses: toggleValue(filter.statuses, status) })
                  }
                >
                  <Icon size={14} aria-hidden />
                  {STATUS_META[status].short}
                </Chip>
              );
            })}
          </ChipGroup>

          {tags.length > 0 && (
            <ChipGroup label="Tag">
              {tags.map((tag) => (
                <Chip
                  key={tag}
                  pressed={filter.tags.includes(tag)}
                  onToggle={() => onChange({ ...filter, tags: toggleValue(filter.tags, tag) })}
                >
                  {tag}
                </Chip>
              ))}
            </ChipGroup>
          )}

          <ChipGroup label="Archiv">
            <Chip
              pressed={filter.includeArchived}
              onToggle={() => onChange({ ...filter, includeArchived: !filter.includeArchived })}
            >
              Hledat i v archivovaných předmětech
            </Chip>
          </ChipGroup>

          {chipCount > 0 && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange({ ...EMPTY_FILTER, query: filter.query })}
              >
                <X size={15} />
                Zrušit filtry
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChipGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-xs font-medium text-muted">
        {label}
        {hint !== undefined && <span className="font-normal"> — {hint}</span>}
      </legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}
