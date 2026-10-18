import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { signIn } from '../../data/auth';
import { t, tDynamic } from '../../i18n/i18n';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/TextField';
import { useServerReachable } from '../../ui/useOnline';
import { AuthLayout } from './AuthLayout';
import { fieldErrors, loginSchema } from './schemas';
import { useAuthAction } from './useAuthAction';

export function LoginPage() {
  const online = useServerReachable();
  const { busy, error, run } = useAuthAction();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [forgot, setForgot] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = loginSchema.safeParse({ username, password });
    if (!parsed.success) {
      setFields(fieldErrors(parsed.error));
      return;
    }
    setFields({});
    await run('login', 'signIn', () => signIn(parsed.data.username, parsed.data.password));
  }

  return (
    <AuthLayout title={t('auth.login.title')} subtitle={t('auth.login.subtitle')}>
      {error && <Alert tone="error">{error}</Alert>}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField
          label={t('auth.username')}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={tDynamic(fields.username)}
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
        <button
          type="button"
          onClick={() => setForgot((v) => !v)}
          aria-expanded={forgot}
          className="self-end text-sm font-semibold text-accent underline-offset-2 hover:underline"
        >
          {t('auth.login.forgot')}
        </button>
        {forgot && (
          <Alert tone="info">
            {t('auth.login.forgotHint')}{' '}
            <code className="font-mono">
              npm run reset-password -- {username || t('auth.usernamePlaceholder')}
            </code>
          </Alert>
        )}
        <Button type="submit" block loading={busy === 'login'} disabled={!online || busy !== null}>
          {t('auth.login.submit')}
        </Button>
      </form>
      <p className="text-center text-sm text-ink-muted">
        {t('auth.login.noAccount')}{' '}
        <Link to="/signup" className="font-semibold text-accent underline-offset-2 hover:underline">
          {t('auth.login.createAccount')}
        </Link>
      </p>
    </AuthLayout>
  );
}
