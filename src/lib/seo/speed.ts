// Extraction lisible d'une réponse PageSpeed Insights v5.

type Num = number | undefined;
export interface SpeedResult {
  strategy: "mobile" | "desktop";
  scores: { performance: Num; seo: Num; accessibility: Num; bestPractices: Num };
  lab: { label: string; value: string; rating: "good" | "ni" | "poor" | "na" }[];
  field: { label: string; value: string; rating: "good" | "ni" | "poor" | "na" }[] | null;
  opportunities: { title: string; savingsMs: number }[];
}

type Raw = {
  lighthouseResult?: {
    categories?: Record<string, { score?: number | null }>;
    audits?: Record<
      string,
      {
        title?: string;
        numericValue?: number;
        displayValue?: string;
        score?: number | null;
        details?: { type?: string; overallSavingsMs?: number };
      }
    >;
  };
  loadingExperience?: { metrics?: Record<string, { percentile?: number; category?: string }> };
};

const pct = (s?: number | null): Num => (typeof s === "number" ? Math.round(s * 100) : undefined);
const rate = (score?: number | null) =>
  (score == null ? "na" : score >= 0.9 ? "good" : score >= 0.5 ? "ni" : "poor") as
    "good" | "ni" | "poor" | "na";
const catRate = (c?: string) =>
  (c === "FAST" ? "good" : c === "AVERAGE" ? "ni" : c === "SLOW" ? "poor" : "na") as
    "good" | "ni" | "poor" | "na";
const sec = (ms?: number) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)} s`);

export function parseSpeed(raw: Raw, strategy: "mobile" | "desktop"): SpeedResult {
  const lh = raw.lighthouseResult ?? {};
  const cat = lh.categories ?? {};
  const a = lh.audits ?? {};
  const lab = [
    {
      label: "LCP (plus grand élément)",
      id: "largest-contentful-paint",
      fmt: (n?: number) => sec(n),
    },
    { label: "FCP (premier affichage)", id: "first-contentful-paint", fmt: (n?: number) => sec(n) },
    {
      label: "TBT (blocage)",
      id: "total-blocking-time",
      fmt: (n?: number) => (n == null ? "—" : `${Math.round(n)} ms`),
    },
    {
      label: "CLS (stabilité visuelle)",
      id: "cumulative-layout-shift",
      fmt: (n?: number) => (n == null ? "—" : n.toFixed(3)),
    },
    { label: "Speed Index", id: "speed-index", fmt: (n?: number) => sec(n) },
  ].map((m) => ({
    label: m.label,
    value: m.fmt(a[m.id]?.numericValue),
    rating: rate(a[m.id]?.score),
  }));

  const fm = raw.loadingExperience?.metrics;
  const field = fm
    ? [
        { label: "LCP réel (p75)", id: "LARGEST_CONTENTFUL_PAINT_MS", fmt: (n?: number) => sec(n) },
        {
          label: "INP réel (p75)",
          id: "INTERACTION_TO_NEXT_PAINT",
          fmt: (n?: number) => (n == null ? "—" : `${Math.round(n)} ms`),
        },
        {
          label: "CLS réel (p75)",
          id: "CUMULATIVE_LAYOUT_SHIFT_SCORE",
          fmt: (n?: number) => (n == null ? "—" : (n / 100).toFixed(2)),
        },
      ]
        .filter((m) => fm[m.id])
        .map((m) => ({
          label: m.label,
          value: m.fmt(fm[m.id].percentile),
          rating: catRate(fm[m.id].category),
        }))
    : null;

  const opportunities = Object.values(a)
    .filter((x) => x.details?.type === "opportunity" && (x.details.overallSavingsMs ?? 0) > 100)
    .map((x) => ({ title: x.title ?? "", savingsMs: Math.round(x.details!.overallSavingsMs!) }))
    .sort((x, y) => y.savingsMs - x.savingsMs)
    .slice(0, 6);

  return {
    strategy,
    scores: {
      performance: pct(cat.performance?.score),
      seo: pct(cat.seo?.score),
      accessibility: pct(cat.accessibility?.score),
      bestPractices: pct(cat["best-practices"]?.score),
    },
    lab,
    field: field?.length ? field : null,
    opportunities,
  };
}
