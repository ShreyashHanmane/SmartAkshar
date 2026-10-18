import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type Tone = 'info' | 'error' | 'success' | 'offline';

const TONES: Record<Tone, { icon: IconName; className: string }> = {
  info: { icon: 'info', className: 'border-line bg-primary-soft text-ink' },
  error: { icon: 'alert', className: 'border-danger bg-surface text-ink' },
  success: { icon: 'check', className: 'border-success bg-surface text-ink' },
  offline: { icon: 'wifiOff', className: 'border-line-strong bg-surface-sunken text-ink' },
};

export function Alert({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  const { icon, className } = TONES[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${className}`}
    >
      <Icon
        name={icon}
        size={18}
        className={tone === 'error' ? 'mt-0.5 shrink-0 text-danger' : 'mt-0.5 shrink-0'}
      />
      <div>{children}</div>
    </div>
  );
}
