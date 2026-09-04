export function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`display select-none text-2xl font-bold tracking-tight text-foreground ${className}`}
      aria-label="Dronacharya"
    >
      <span className="inline-block -scale-x-100">D</span>ronacharya
    </span>
  );
}
