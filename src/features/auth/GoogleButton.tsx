import { t } from '../../i18n/i18n';
import { Spinner } from '../../ui/Spinner';

/**
 * Google's sign-in mark must keep its brand colors (Google branding rules),
 * so this is the one place with non-token fills.
 */
export function GoogleButton({
  onClick,
  loading,
  disabled,
}: {
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className="inline-flex min-h-11 w-full items-center justify-center gap-3 rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold text-ink transition hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? (
        <Spinner />
      ) : (
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path
            fill="#EA4335"
            d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.2C12.5 13.6 17.8 9.5 24 9.5z"
          />
          <path
            fill="#4285F4"
            d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z"
          />
          <path
            fill="#FBBC05"
            d="M10.6 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.2A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l8-6z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.8l-8 6C6.6 42.6 14.6 48 24 48z"
          />
        </svg>
      )}
      <span>{t('auth.google')}</span>
    </button>
  );
}

