import { RULES, SEVERITY_WEIGHT } from "./rules";

/**
 * Score de santé 0-100. Chaque issue pèse selon sa sévérité, normalisée par le nombre de pages :
 * un défaut présent sur 100 % des pages coûte autant qu'un défaut critique du site entier.
 */
export function healthScore(issueCounts: Record<string, number>, pagesCrawled: number): number {
  if (pagesCrawled <= 0) return 0;
  let penalty = 0;
  for (const [code, count] of Object.entries(issueCounts)) {
    const rule = RULES[code];
    if (!rule || count <= 0) continue;
    const share = Math.min(1, count / pagesCrawled);
    // part de pages touchées (concave : les premiers défauts comptent beaucoup)
    penalty += SEVERITY_WEIGHT[rule.severity] * Math.sqrt(share) * 2.2;
  }
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}
