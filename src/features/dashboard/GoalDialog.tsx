import { type FormEvent, useState } from 'react';
import { useSettings } from '../../app/settings/SettingsProvider';
import { t } from '../../i18n/i18n';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { TextField } from '../../ui/TextField';

export function GoalDialog({ onClose }: { onClose: () => void }) {
  const { settings, update } = useSettings();
  const [value, setValue] = useState(String(settings.weeklyGoalHours));
  const [error, setError] = useState<string | undefined>();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const hours = Number(value);
    if (!Number.isInteger(hours) || hours < 1 || hours > 80) {
      setError(t('dashboard.goalInvalid'));
      return;
    }
    update({ weeklyGoalHours: hours });
    onClose();
  }

  return (
    <Dialog
      open
      title={t('dashboard.goalTitle')}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="goal-form">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="goal-form" noValidate onSubmit={onSubmit}>
        <TextField
          label={t('dashboard.goalLabel')}
          type="number"
          inputMode="numeric"
          min={1}
          max={80}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(undefined);
          }}
          error={error}
          hint={t('dashboard.goalHint')}
          autoFocus
        />
      </form>
    </Dialog>
  );
}
