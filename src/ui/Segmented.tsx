import { type KeyboardEvent, useRef } from 'react';
import { Icon, type IconName } from './Icon';

interface Option<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}

/** Single-choice segmented control (radio group semantics, arrow-key navigation). */
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent, index: number) {
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!delta) return;
    e.preventDefault();
    const next = options[(index + delta + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    refs.current[options.indexOf(next)]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex flex-wrap gap-1 rounded-lg bg-surface-sunken p-1"
    >
      {options.map((option, i) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(n) => {
              refs.current[i] = n;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold transition ${checked ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
          >
            {option.icon && <Icon name={option.icon} size={18} filled={checked} />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
