import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { refreshSession, resendVerificationEmail } from '../../data/auth';
import { t } from '../../i18n/i18n';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { useOnline } from '../../ui/useOnline';
import { useSignedInUser } from '../../app/session/SessionProvider';
import { AuthLayout } from './AuthLayout';
import { useSignOut } from './useSignOut';
import { useAuthAction } from './useAuthAction';

const RESEND_COOLDOWN_S = 60;

export function VerifyEmailPage() {
  const user = useSignedInUser();
  const online = useOnline();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const { busy, error, setError, run } = useAuthAction();
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  async function onContinue() {
    setNotice(null);
    let verified = false;
    await run('check', 'other', async () => {
      verified = (await refreshSession())?.emailVerified ?? false;
    });
    if (verified) navigate('/', { replace: true });
    else setError(t('auth.verify.notYet'));
  }

  async function onResend() {
    setNotice(null);
    const ok = await run('resend', 'other', resendVerificationEmail);
    if (ok) {
      setNotice(t('auth.verify.resent'));
      setCooldown(RESEND_COOLDOWN_S);
    }
  }

  return (
    <AuthLayout title={t('auth.verify.title')}>
      <p className="text-base text-ink">{t('auth.verify.body', { email: user.email ?? '' })}</p>
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      <Button
        block
        loading={busy === 'check'}
        disabled={!online || busy !== null}
        onClick={() => void onContinue()}
      >
        {t('auth.verify.continue')}
      </Button>
      <Button
        variant="secondary"
        block
        icon="mail"
        loading={busy === 'resend'}
        disabled={!online || busy !== null || cooldown > 0}
        onClick={() => void onResend()}
      >
        {cooldown > 0 ? t('auth.verify.resendIn', { seconds: cooldown }) : t('auth.verify.resend')}
      </Button>
      <Button variant="ghost" block onClick={() => void signOut.start()}>
        {t('auth.verify.switch')}
      </Button>
      {signOut.dialog}
    </AuthLayout>
  );
}

