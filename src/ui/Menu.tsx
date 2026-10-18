import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';

export interface MenuItem {
  label: string;
  icon?: IconName;
  danger?: boolean;
  onSelect: () => void;
}

interface MenuProps {
  /** Accessible name for the trigger button. */
  label: string;
  items: MenuItem[];
  trigger?: ReactNode;
  align?: 'start' | 'end';
  triggerClassName?: string;
}

/** Menu button following the WAI-ARIA menu pattern (arrow keys, Home/End, Escape). */
export function Menu({ label, items, trigger, align = 'end', triggerClassName = '' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  function close(refocus = true) {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const nodes = itemRefs.current.filter((n): n is HTMLButtonElement => n !== null);
    const index = nodes.indexOf(document.activeElement as HTMLButtonElement);
    const focus = (i: number) => nodes[(i + nodes.length) % nodes.length]?.focus();
    if (e.key === 'ArrowDown') focus(index + 1);
    else if (e.key === 'ArrowUp') focus(index - 1);
    else if (e.key === 'Home') focus(0);
    else if (e.key === 'End') focus(nodes.length - 1);
    else if (e.key === 'Escape') close();
    else if (e.key === 'Tab') setOpen(false);
    else return;
    e.preventDefault();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`inline-flex size-11 items-center justify-center rounded-lg text-ink-muted hover:bg-primary-soft hover:text-ink ${triggerClassName}`}
      >
        {trigger ?? <Icon name="more" />}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          className={`absolute top-full z-40 mt-1 min-w-48 rounded-lg border border-line bg-surface py-1 shadow-lg ${align === 'end' ? 'right-0' : 'left-0'}`}
        >
          {items.map((item, i) => (
            <button
              key={item.label}
              ref={(n) => {
                itemRefs.current[i] = n;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close(false);
                item.onSelect();
              }}
              className={`flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-primary-soft focus:bg-primary-soft ${item.danger ? 'text-danger' : 'text-ink'}`}
            >
              {item.icon && <Icon name={item.icon} size={18} />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
