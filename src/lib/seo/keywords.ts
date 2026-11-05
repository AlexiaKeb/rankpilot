import { fold } from "./optimizer";

export type Intent = "informationnelle" | "commerciale" | "transactionnelle" | "navigationnelle";

const TRANSAC =
  /\b(acheter|achat|prix|tarif|pas cher|promo|commander|devis|livraison|reduction|code promo|buy|price|cheap|order|discount|coupon)\b/;
const COMMERCIAL =
  /\b(meilleur|meilleurs|avis|comparatif|comparaison|alternative|vs|versus|top|test|review|reviews|best|comparison)\b/;
const NAV =
  /\b(login|connexion|se connecter|site officiel|contact|telecharger|download|app|application)\b/;
const INFO =
  /^(comment|pourquoi|quel|quelle|quels|quelles|qu est ce|que|quand|ou|combien|c est quoi|how|what|why|when|where|which)\b|\b(definition|guide|tutoriel|exemple|exemples|idee|idees|astuce|astuces|tuto)\b/;

export function classifyIntent(keyword: string): Intent {
  const k = fold(keyword);
  if (TRANSAC.test(k)) return "transactionnelle";
  if (COMMERCIAL.test(k)) return "commerciale";
  if (NAV.test(k)) return "navigationnelle";
  if (INFO.test(k)) return "informationnelle";
  return "informationnelle";
}

const STOP = new Set(
  "le la les un une des de du d l et en au aux pour sur dans par avec sans a est ce qui que quoi quel quelle quels quelles comment pourquoi quand ou combien the of and to in for on with how what why".split(
    " ",
  ),
);

export function significantTokens(keyword: string): string[] {
  return fold(keyword)
    .split(" ")
    .filter((t) => t.length > 2 && !STOP.has(t));
}

export interface Cluster {
  head: string;
  keywords: string[];
}

/**
 * Regroupe par terme dominant : on cherche les mots (hors mot-clé de base) partagés par le plus
 * d'idées, puis chaque idée rejoint le groupe de son terme le plus fréquent.
 */
export function clusterKeywords(keywords: string[], seed: string): Cluster[] {
  const seedTokens = new Set(significantTokens(seed));
  const freq = new Map<string, number>();
  for (const k of keywords)
    for (const t of new Set(significantTokens(k)))
      if (!seedTokens.has(t)) freq.set(t, (freq.get(t) ?? 0) + 1);
  const groups = new Map<string, string[]>();
  for (const k of keywords) {
    const tokens = significantTokens(k).filter((t) => !seedTokens.has(t));
    const best = tokens.sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0))[0];
    const head = best && (freq.get(best) ?? 0) > 1 ? best : "autres";
    groups.set(head, [...(groups.get(head) ?? []), k]);
  }
  return [...groups.entries()]
    .map(([head, list]) => ({ head, keywords: list }))
    .sort((a, b) =>
      a.head === "autres" ? 1 : b.head === "autres" ? -1 : b.keywords.length - a.keywords.length,
    );
}

const QUESTION_PREFIXES = ["comment", "pourquoi", "quel", "combien", "meilleur"];
const SUFFIXES = ["prix", "avis", "pas cher", "gratuit", "alternative", "vs"];

/** Requêtes envoyées à l'autocomplétion pour élargir les idées autour d'un mot-clé. */
export function buildQueries(seed: string): string[] {
  const s = seed.trim();
  return [s, ...QUESTION_PREFIXES.map((p) => `${p} ${s}`), ...SUFFIXES.map((x) => `${s} ${x}`)];
}

export function dedupeSuggestions(lists: string[][], seed: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of lists.flat()) {
    const f = fold(k);
    if (!f || f === fold(seed) || seen.has(f)) continue;
    seen.add(f);
    out.push(k.trim());
  }
  return out;
}
