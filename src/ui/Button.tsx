import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:brightness-110 disabled:opacity-60',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-primary-soft disabled:opacity-60',
  ghost: 'text-ink hover:bg-primary-soft disabled:opacity-60',
  danger: 'bg-danger text-on-danger hover:brightness-110 disabled:opacity-60',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  block?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  icon,
  loading = false,
  block = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed ${VARIANTS[variant]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? <Spinner /> : icon ? <Icon name={icon} size={18} /> : null}
      <span>{children}</span>
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** Accessible name; required because the button has no visible text. */
  label: string;
  active?: boolean;
}

export function IconButton({
  icon,
  label,
  active = false,
  className = '',
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-lg transition disabled:opacity-40 ${active ? 'bg-primary-soft text-accent-on-soft' : 'text-ink hover:bg-primary-soft'} ${className}`}
      {...rest}
    >
      <Icon name={icon} filled={active} />
    </button>
  );
}
