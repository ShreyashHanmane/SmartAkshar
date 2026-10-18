import { useId, type ReactNode } from 'react';
import { useSettings } from '../../app/settings/SettingsProvider';
import { PageHeader } from '../../app/shell/PageHeader';
import { t } from '../../i18n/i18n';
import { Button } from '../../ui/Button';
import { Segmented } from '../../ui/Segmented';
import { useSignOut } from '../auth/useSignOut';

function Row({ title, description, control }: { title: string; description?: string; control: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        {description && <p className="text-sm text-ink-muted">{description}</p>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <h2 className="mb-4 text-xl font-semibold text-ink">{title}</h2>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

export function SettingsPage() {
  const { settings, update } = useSettings();
  const signOut = useSignOut();
  const languageId = useId();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title={t('settings.title')} />

      <Card title={t('settings.appearance')}>
        <Row
          title={t('settings.theme')}
          description={t('settings.themeHint')}
          control={
            <Segmented
              label={t('settings.theme')}
              value={settings.theme}
              onChange={(theme) => update({ theme })}
              options={[
                { value: 'light', label: t('settings.theme.light'), icon: 'sun' },
                { value: 'dark', label: t('settings.theme.dark'), icon: 'moon' },
                { value: 'paper', label: t('settings.theme.paper'), icon: 'paper' },
              ]}
            />
          }
        />
        <Row
          title={t('settings.textSize')}
          description={t('settings.textSizeHint')}
          control={
            <Segmented
              label={t('settings.textSize')}
              value={settings.textSize}
              onChange={(textSize) => update({ textSize })}
              options={[
                { value: 'sm', label: t('settings.textSize.sm') },
                { value: 'md', label: t('settings.textSize.md') },
                { value: 'lg', label: t('settings.textSize.lg') },
              ]}
            />
          }
        />
        <Row
          title={t('settings.language')}
          control={
            <div className="flex flex-col gap-1.5">
              <label htmlFor={languageId} className="text-sm font-semibold text-ink">
                {t('settings.interfaceLanguage')}
              </label>
              <select
                id={languageId}
                value={settings.locale}
                onChange={(e) => update({ locale: e.target.value === 'en' ? 'en' : settings.locale })}
                className="min-h-11 min-w-48 rounded-lg border border-line-strong bg-surface px-3 text-base text-ink"
              >
                <option value="en">English</option>
              </select>
            </div>
          }
        />
        <Row
          title={t('settings.toolbarSide')}
          description={t('settings.toolbarSideHint')}
          control={
            <Segmented
              label={t('settings.toolbarSide')}
              value={settings.toolbarSide}
              onChange={(toolbarSide) => update({ toolbarSide })}
              options={[
                { value: 'left', label: t('settings.toolbarSide.left') },
                { value: 'right', label: t('settings.toolbarSide.right') },
              ]}
            />
          }
        />
      </Card>

      <Card title={t('settings.account')}>
        <Row
          title={t('auth.signOut')}
          control={
            <Button
              variant="secondary"
              icon="logOut"
              loading={signOut.busy}
              onClick={() => void signOut.start()}
            >
              {t('auth.signOut')}
            </Button>
          }
        />
      </Card>
      {signOut.dialog}
    </div>
  );
}
