export function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`display select-none text-2xl font-bold tracking-tight text-foreground ${className}`}
      aria-label="RX"
    >
      <span className="inline-block -scale-x-100">R</span>X
    </span>
  );
}
