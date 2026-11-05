// Analyses des données Search Console (fonctions pures, testées).

export interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

const CTR_BY_POSITION = [0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018];

/** CTR indicatif d'un résultat organique selon sa position (ordre de grandeur, pas une vérité de Google). */
export function expectedCtr(position: number): number {
  const p = Math.max(1, Math.round(position));
  return p <= 10 ? CTR_BY_POSITION[p - 1] : p <= 20 ? 0.008 : 0.003;
}

export interface QueryOpportunity {
  query: string;
  impressions: number;
  clicks: number;
  position: number;
  ctr: number;
  kind: "page1" | "ctr";
  /** Clics supplémentaires estimés si on atteint le CTR attendu (ou le haut de page 1) */
  gain: number;
  advice: string;
}

/**
 * Requêtes à fort potentiel :
 * - "page1" : position 4 à 20 avec beaucoup d'impressions => rapprocher la page du top 3
 * - "ctr"   : bien placé (≤ 10) mais CTR sous la moyenne attendue => retravailler title/meta
 */
export function findOpportunities(
  rows: GscRow[],
  minImpressions = 50,
  limit = 20,
): QueryOpportunity[] {
  const out: QueryOpportunity[] = [];
  for (const r of rows) {
    if (r.impressions < minImpressions) continue;
    const query = r.keys[0];
    const exp = expectedCtr(r.position);
    if (r.position > 3 && r.position <= 20) {
      out.push({
        query,
        impressions: r.impressions,
        clicks: r.clicks,
        position: r.position,
        ctr: r.ctr,
        kind: "page1",
        gain: Math.max(0, Math.round(r.impressions * expectedCtr(3) - r.clicks)),
        advice:
          r.position <= 10
            ? "Déjà en page 1 : enrichissez la page et le maillage pour viser le top 3."
            : "En page 2 : renforcez le contenu et les liens internes pour passer en page 1.",
      });
    } else if (r.position <= 10 && r.ctr < exp * 0.6) {
      out.push({
        query,
        impressions: r.impressions,
        clicks: r.clicks,
        position: r.position,
        ctr: r.ctr,
        kind: "ctr",
        gain: Math.max(0, Math.round(r.impressions * exp - r.clicks)),
        advice:
          "CTR bas pour cette position : réécrivez le title et la meta description avec un bénéfice clair.",
      });
    }
  }
  return out.sort((a, b) => b.gain - a.gain).slice(0, limit);
}

export interface Mover {
  key: string;
  clicks: number;
  previous: number;
  delta: number;
}

/** Variation des clics entre deux périodes, par clé (page ou requête). */
export function movers(
  current: GscRow[],
  previous: GscRow[],
  minAbs = 5,
): { gainers: Mover[]; losers: Mover[] } {
  const prev = new Map(previous.map((r) => [r.keys[0], r.clicks]));
  const cur = new Map(current.map((r) => [r.keys[0], r.clicks]));
  const keys = new Set([...prev.keys(), ...cur.keys()]);
  const all: Mover[] = [...keys].map((key) => {
    const c = cur.get(key) ?? 0;
    const p = prev.get(key) ?? 0;
    return { key, clicks: c, previous: p, delta: c - p };
  });
  return {
    gainers: all
      .filter((m) => m.delta >= minAbs)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 10),
    losers: all
      .filter((m) => m.delta <= -minAbs)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, 10),
  };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Fenêtres courante et précédente. Les données récentes de la Search Console ont ~2 jours de retard. */
export function periods(days: number, today = new Date()) {
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1));
  return { start: iso(start), end: iso(end), prevStart: iso(prevStart), prevEnd: iso(prevEnd) };
}

export function pctChange(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / before) * 1000) / 10;
}
