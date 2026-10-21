import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '../../data/auth';
import { t, tDynamic } from '../../i18n/i18n';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/TextField';
import { useOnline } from '../../ui/useOnline';
import { AuthLayout } from './AuthLayout';
import { fieldErrors, forgotSchema } from './schemas';
import { useAuthAction } from './useAuthAction';

export function ForgotPasswordPage() {
  const online = useOnline();
  const { busy, error, run } = useAuthAction();
  const [email, setEmail] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = forgotSchema.safeParse({ email });
    if (!parsed.success) {
      setFields(fieldErrors(parsed.error));
      return;
    }
    setFields({});
    const ok = await run('send', 'other', () => requestPasswordReset(parsed.data.email));
    if (ok) setSentTo(parsed.data.email);
  }

  return (
    <AuthLayout title={t('auth.forgot.title')} subtitle={t('auth.forgot.subtitle')}>
      {error && <Alert tone="error">{error}</Alert>}
      {sentTo ? (
        <Alert tone="success">{t('auth.forgot.sent', { email: sentTo })}</Alert>
      ) : (
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
          <Button type="submit" block loading={busy === 'send'} disabled={!online || busy !== null}>
            {t('auth.forgot.submit')}
          </Button>
        </form>
      )}
      <Link
        to="/login"
        className="text-center text-sm font-semibold text-accent underline-offset-2 hover:underline"
      >
        {t('auth.forgot.back')}
      </Link>
    </AuthLayout>
  );
}

