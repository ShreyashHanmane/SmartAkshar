import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { signUp } from '../../data/auth';
import { t, tDynamic } from '../../i18n/i18n';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/TextField';
import { useServerReachable } from '../../ui/useOnline';
import { AuthLayout } from './AuthLayout';
import { fieldErrors, signUpSchema } from './schemas';
import { useAuthAction } from './useAuthAction';

export function SignUpPage() {
  const online = useServerReachable();
  const { busy, error, run } = useAuthAction();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = signUpSchema.safeParse({ name, username, password });
    if (!parsed.success) {
      setFields(fieldErrors(parsed.error));
      return;
    }
    setFields({});
    await run('signup', 'signUp', () => signUp(parsed.data.name, parsed.data.username, parsed.data.password));
  }

  return (
    <AuthLayout title={t('auth.signup.title')} subtitle={t('auth.signup.subtitle')}>
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
          label={t('auth.username')}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={tDynamic(fields.username)}
          hint={t('auth.usernameHint')}
          maxLength={32}
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
        <Button type="submit" block loading={busy === 'signup'} disabled={!online || busy !== null}>
          {t('auth.signup.submit')}
        </Button>
      </form>
      <p className="text-center text-sm text-ink-muted">
        {t('auth.signup.haveAccount')}{' '}
        <Link to="/login" className="font-semibold text-accent underline-offset-2 hover:underline">
          {t('auth.signup.signIn')}
        </Link>
      </p>
    </AuthLayout>
  );
}
