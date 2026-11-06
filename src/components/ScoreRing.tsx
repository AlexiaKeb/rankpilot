// Jauge circulaire du score de santé (0-100).
export function scoreTone(score: number) {
  if (score >= 80) return { color: "var(--success)", label: "Solide" };
  if (score >= 50) return { color: "var(--warning)", label: "À améliorer" };
  return { color: "var(--danger)", label: "Critique" };
}

export function ScoreRing({ score, size = 168 }: { score: number; size?: number }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = scoreTone(score);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone.color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-display text-5xl font-extrabold leading-none"
          style={{ color: tone.color }}
        >
          {score}
        </span>
        <span
          className={`font-data mt-1 uppercase text-muted-foreground ${size < 120 ? "text-[8px] tracking-wider" : "text-[11px] tracking-widest"}`}
        >
          {tone.label}
        </span>
      </div>
    </div>
  );
}
