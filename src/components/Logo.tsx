export function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 font-display text-lg font-extrabold ${className}`}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="10" stroke="var(--primary)" strokeWidth="2" />
        <circle cx="12" cy="12" r="5" stroke="var(--primary)" strokeWidth="2" opacity="0.5" />
        <path d="M12 12 19 5" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      RankPilot
    </span>
  );
}
