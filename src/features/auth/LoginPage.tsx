import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { continueAsGuest, signInWithEmail, signInWithGoogle } from '../../data/auth';
import { t, tDynamic } from '../../i18n/i18n';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/TextField';
import { useOnline } from '../../ui/useOnline';
import { useNextPath } from '../../app/session/Guards';
import { useSession } from '../../app/session/SessionProvider';
import { AuthLayout, OrDivider } from './AuthLayout';
import { GoogleButton } from './GoogleButton';
import { fieldErrors, loginSchema } from './schemas';
import { useAuthAction } from './useAuthAction';

export function LoginPage() {
  const session = useSession();
  const online = useOnline();
  const { busy, error, run } = useAuthAction();
  const navigate = useNavigate();
  const next = useNextPath();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const isGuest = session.status === 'signedIn' && session.user.isGuest;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFields(fieldErrors(parsed.error));
      return;
    }
    setFields({});
    await run('email', 'signIn', () => signInWithEmail(parsed.data.email, parsed.data.password));
  }

  // Guests may stay on auth pages (to sign in elsewhere), so move on explicitly.
  async function onGuest() {
    if (await run('guest', 'other', continueAsGuest)) navigate(next, { replace: true });
  }

  return (
    <AuthLayout title={t('auth.login.title')} subtitle={t('auth.login.subtitle')}>
      {isGuest && <Alert tone="info">{t('auth.login.guestWarning')}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
        <TextField
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={tDynamic(fields.email)}
          required
        />
        <TextField
          label={t('auth.password')}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={tDynamic(fields.password)}
          required
        />
        <Link
          to="/forgot-password"
          className="self-end text-sm font-semibold text-accent underline-offset-2 hover:underline"
        >
          {t('auth.login.forgot')}
        </Link>
        <Button type="submit" block loading={busy === 'email'} disabled={!online || busy !== null}>
          {t('auth.login.submit')}
        </Button>
      </form>
      <OrDivider />
      <GoogleButton
        loading={busy === 'google'}
        disabled={!online || busy !== null}
        onClick={() => void run('google', 'signIn', signInWithGoogle)}
      />
      {!isGuest && (
        <div className="flex flex-col gap-1">
          <Button
            variant="ghost"
            block
            loading={busy === 'guest'}
            disabled={!online || busy !== null}
            onClick={() => void onGuest()}
          >
            {t('auth.guest')}
          </Button>
          <p className="text-center text-xs text-ink-muted">{t('auth.guestHint')}</p>
        </div>
      )}
      <p className="text-center text-sm text-ink-muted">
        {t('auth.login.noAccount')}{' '}
        <Link to="/signup" className="font-semibold text-accent underline-offset-2 hover:underline">
          {t('auth.login.createAccount')}
        </Link>
      </p>
    </AuthLayout>
  );
}
