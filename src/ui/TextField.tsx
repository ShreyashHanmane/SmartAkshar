import { type InputHTMLAttributes, useId, useState } from 'react';
import { t } from '../i18n/i18n';
import { Icon } from './Icon';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
}

export function TextField({ label, error, hint, type = 'text', className = '', ...rest }: TextFieldProps) {
  const id = useId();
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password';
  const describedBy =
    [error ? `${id}-error` : '', hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && reveal ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`min-h-11 w-full rounded-lg border bg-surface px-3 text-base text-ink placeholder:text-ink-muted ${error ? 'border-danger' : 'border-line-strong'} ${isPassword ? 'pr-12' : ''}`}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? t('auth.hidePassword') : t('auth.showPassword')}
            aria-pressed={reveal}
            className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-lg text-ink-muted hover:text-ink"
          >
            <Icon name={reveal ? 'eyeOff' : 'eye'} size={18} />
          </button>
        )}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
