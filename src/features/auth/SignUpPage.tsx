import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { signInWithGoogle, signUpWithEmail } from '../../data/auth';
import { t, tDynamic } from '../../i18n/i18n';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/TextField';
import { useOnline } from '../../ui/useOnline';
import { useSession } from '../../app/session/SessionProvider';
import { AuthLayout, OrDivider } from './AuthLayout';
import { GoogleButton } from './GoogleButton';
import { fieldErrors, signUpSchema } from './schemas';
import { useAuthAction } from './useAuthAction';

export function SignUpPage() {
  const session = useSession();
  const online = useOnline();
  const { busy, error, run } = useAuthAction();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const isGuest = session.status === 'signedIn' && session.user.isGuest;
  const context = isGuest ? 'link' : 'signUp';

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = signUpSchema.safeParse({ name, email, password });
    if (!parsed.success) {
      setFields(fieldErrors(parsed.error));
      return;
    }
    setFields({});
    await run('email', context, () =>
      signUpWithEmail(parsed.data.name, parsed.data.email, parsed.data.password),
    );
  }

  return (
    <AuthLayout title={t('auth.signup.title')} subtitle={t('auth.signup.subtitle')}>
      {isGuest && <Alert tone="info">{t('auth.signup.guestUpgrade')}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField
          label={t('auth.name')}
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={tDynamic(fields.name)}
          maxLength={60}
          required
        />
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={tDynamic(fields.password)}
          hint={t('auth.passwordHint')}
          required
        />
        <Button type="submit" block loading={busy === 'email'} disabled={!online || busy !== null}>
          {t('auth.signup.submit')}
        </Button>
      </form>
      <OrDivider />
      <GoogleButton
        loading={busy === 'google'}
        disabled={!online || busy !== null}
        onClick={() => void run('google', context, signInWithGoogle)}
      />
      <p className="text-center text-sm text-ink-muted">
        {t('auth.signup.haveAccount')}{' '}
        <Link to="/login" className="font-semibold text-accent underline-offset-2 hover:underline">
          {t('auth.signup.signIn')}
        </Link>
      </p>
    </AuthLayout>
  );
}
