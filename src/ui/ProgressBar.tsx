/** Determinate progress bar drawn with theme tokens (the native <progress> ignores them). */
export function ProgressBar({
  value,
  max,
  label,
  valueText,
}: {
  value: number;
  max: number;
  label: string;
  valueText?: string;
}) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      {...(valueText ? { 'aria-valuetext': valueText } : {})}
      className="h-2 w-full overflow-hidden rounded-full bg-primary-soft"
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
        style={{ width: `${percent}%`, minWidth: value > 0 ? '0.25rem' : 0 }}
      />
    </div>
  );
}
