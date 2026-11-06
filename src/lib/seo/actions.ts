import { RULES } from "./rules";
import type { QueryOpportunity } from "./gsc";

export type Impact = "élevé" | "moyen" | "faible";

export interface WeeklyAction {
  id: string;
  priority: 1 | 2 | 3;
  impact: Impact;
  source: "audit" | "search-console" | "démarrage";
  title: string;
  why: string;
  how: string;
  urls?: string[];
}

export interface QueryPageRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface Cannibalization {
  query: string;
  totalImpressions: number;
  pages: { page: string; clicks: number; impressions: number; position: number }[];
}

/**
 * Requêtes pour lesquelles au moins deux pages du site apparaissent avec une part significative
 * d'impressions : Google hésite entre elles, ce qui freine le classement de chacune.
 */
export function findCannibalization(
  rows: QueryPageRow[],
  minImpressions = 100,
  minShare = 0.2,
  limit = 15,
): Cannibalization[] {
  const byQuery = new Map<string, QueryPageRow[]>();
  for (const r of rows) byQuery.set(r.query, [...(byQuery.get(r.query) ?? []), r]);
  const out: Cannibalization[] = [];
  for (const [query, list] of byQuery) {
    const total = list.reduce((a, r) => a + r.impressions, 0);
    if (total < minImpressions) continue;
    const meaningful = list.filter(
      (r) => r.impressions >= minImpressions * 0.3 && r.impressions / total >= minShare,
    );
    if (meaningful.length < 2) continue;
    out.push({
      query,
      totalImpressions: total,
      pages: meaningful
        .sort((a, b) => b.impressions - a.impressions)
        .map(({ page, clicks, impressions, position }) => ({
          page,
          clicks,
          impressions,
          position,
        })),
    });
  }
  return out.sort((a, b) => b.totalImpressions - a.totalImpressions).slice(0, limit);
}

export interface DecliningPage {
  page: string;
  clicks: number;
  previous: number;
  delta: number;
  topQueries: { query: string; clicks: number; position: number }[];
}

export function decliningPages(
  losers: { key: string; clicks: number; previous: number; delta: number }[],
  queryPages: QueryPageRow[],
): DecliningPage[] {
  return losers.slice(0, 8).map((l) => ({
    page: l.key,
    clicks: l.clicks,
    previous: l.previous,
    delta: l.delta,
    topQueries: queryPages
      .filter((r) => r.page === l.key)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 3)
      .map((r) => ({ query: r.query, clicks: r.clicks, position: r.position })),
  }));
}

export interface ActionInput {
  audit: { counts: Record<string, number>; samples: Record<string, string[]> } | null;
  gsc: {
    opportunities: QueryOpportunity[];
    declining: DecliningPage[];
    cannibalization: Cannibalization[];
  } | null;
  gscConnected: boolean;
  savedKeywords: number;
}

const path = (u: string) => u.replace(/^https?:\/\/[^/]+/, "") || "/";
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** Transforme les données du projet en 5 tâches maximum, classées par impact attendu. */
export function buildWeeklyActions(input: ActionInput): WeeklyAction[] {
  const out: WeeklyAction[] = [];
  const c = input.audit?.counts ?? {};
  const urls = (code: string) => (input.audit?.samples[code] ?? []).slice(0, 5);

  // — Urgences techniques
  const broken = (c.broken_link ?? 0) + (c.http_4xx ?? 0) + (c.http_5xx ?? 0);
  if (c.robots_blocks_all)
    out.push({
      id: "robots-blocks-all",
      priority: 1,
      impact: "élevé",
      source: "audit",
      title: "Débloquez votre site dans robots.txt",
      why: RULES.robots_blocks_all.why,
      how: RULES.robots_blocks_all.fix,
    });
  if (broken > 0)
    out.push({
      id: "broken-links",
      priority: 1,
      impact: "élevé",
      source: "audit",
      title: `Corrigez ${plural(broken, "lien ou page cassé", "liens ou pages cassés")}`,
      why: "Les erreurs 4xx/5xx gaspillent le crawl de Google et dégradent l'expérience des visiteurs.",
      how: "Redirigez chaque page disparue en 301 vers son équivalent, ou retirez les liens qui y mènent.",
      urls: [...urls("http_4xx"), ...urls("broken_link")].slice(0, 5),
    });

  // — Search Console : le plus rentable
  const g = input.gsc;
  if (g) {
    for (const o of g.opportunities.slice(0, 2))
      out.push({
        id: `opp:${o.query}`,
        priority: 1,
        impact: o.gain >= 50 ? "élevé" : "moyen",
        source: "search-console",
        title:
          o.kind === "ctr"
            ? `Réécrivez le title pour « ${o.query} »`
            : `Poussez « ${o.query} » vers le top 3`,
        why: `Position ${o.position.toFixed(1)}, ${o.impressions} impressions, environ +${o.gain} clics possibles.`,
        how: o.advice,
      });
    const worst = g.declining[0];
    if (worst)
      out.push({
        id: `decline:${worst.page}`,
        priority: 1,
        impact: "élevé",
        source: "search-console",
        title: `Mettez à jour ${path(worst.page)} (${worst.delta} clics)`,
        why: `Cette page est passée de ${worst.previous} à ${worst.clicks} clics sur la période.`,
        how: worst.topQueries.length
          ? `Relisez-la pour répondre aux requêtes « ${worst.topQueries.map((q) => q.query).join(" », « ")} » : données à jour, nouvelle section, meilleur title.`
          : "Actualisez les chiffres, ajoutez une section manquante et vérifiez le title.",
        urls: [worst.page],
      });
    const cannibal = g.cannibalization[0];
    if (cannibal)
      out.push({
        id: `cannibal:${cannibal.query}`,
        priority: 2,
        impact: "moyen",
        source: "search-console",
        title: `Deux pages se disputent « ${cannibal.query} »`,
        why: `${cannibal.pages.length} pages apparaissent pour cette requête : Google hésite et aucune ne monte.`,
        how: "Choisissez la page principale, fusionnez ou différenciez l'autre, et faites les liens internes vers la principale.",
        urls: cannibal.pages.map((p) => p.page),
      });
  } else if (!input.gscConnected) {
    out.push({
      id: "connect-gsc",
      priority: 1,
      impact: "élevé",
      source: "démarrage",
      title: "Connectez la Search Console",
      why: "C'est elle qui révèle vos vraies requêtes, vos opportunités et les pages qui déclinent.",
      how: "Onglet « Search Console » du projet, puis « Connecter avec Google ».",
    });
  }

  // — Corrections de fond de l'audit
  if (c.meta_missing)
    out.push({
      id: "meta-missing",
      priority: 2,
      impact: "moyen",
      source: "audit",
      title: `Rédigez ${plural(c.meta_missing, "meta description", "meta descriptions")}`,
      why: RULES.meta_missing.why,
      how: RULES.meta_missing.fix,
      urls: urls("meta_missing"),
    });
  if (c.title_missing || c.title_duplicate)
    out.push({
      id: "titles",
      priority: 1,
      impact: "élevé",
      source: "audit",
      title: "Donnez un title unique à chaque page",
      why: RULES.title_duplicate.why,
      how: RULES.title_missing.fix,
      urls: [...urls("title_missing"), ...urls("title_duplicate")].slice(0, 5),
    });
  if (c.orphan_page)
    out.push({
      id: "orphans",
      priority: 2,
      impact: "moyen",
      source: "audit",
      title: `Reliez ${plural(c.orphan_page, "page orpheline", "pages orphelines")}`,
      why: RULES.orphan_page.why,
      how: "Ouvrez l'onglet Maillage : il propose les pages d'où placer le lien.",
      urls: urls("orphan_page"),
    });
  if (c.thin_content)
    out.push({
      id: "thin",
      priority: 2,
      impact: "moyen",
      source: "audit",
      title: `Étoffez ${plural(c.thin_content, "page légère", "pages légères")}`,
      why: RULES.thin_content.why,
      how: RULES.thin_content.fix,
      urls: urls("thin_content"),
    });
  if (c.jsonld_missing)
    out.push({
      id: "schema",
      priority: 3,
      impact: "faible",
      source: "audit",
      title: "Ajoutez des données structurées",
      why: RULES.jsonld_missing.why,
      how: "Générez le balisage dans Outils gratuits > Générateur JSON-LD.",
      urls: urls("jsonld_missing"),
    });

  if (input.savedKeywords === 0)
    out.push({
      id: "keywords",
      priority: 3,
      impact: "moyen",
      source: "démarrage",
      title: "Constituez votre liste de mots-clés",
      why: "Elle guide tout le reste : articles, titles, suivi.",
      how: "Page Mots-clés : cherchez votre sujet principal et étoilez 10 idées pertinentes.",
    });

  return out
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        (a.impact === "élevé" ? -1 : 0) - (b.impact === "élevé" ? -1 : 0),
    )
    .slice(0, 5);
}
