export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
      style={{ width: size, height: size }}
    />
  );
}
