import { parse } from "node-html-parser";

export type CheckStatus = "pass" | "warn" | "fail";
export interface Check {
  id: string;
  group: "Mot-clé" | "Structure" | "Contenu" | "Technique";
  label: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
}
export interface OptimizerResult {
  score: number;
  checks: Check[];
  stats: {
    wordCount: number;
    keywordCount: number;
    density: number;
    h2Count: number;
    internalLinks: number;
    externalLinks: number;
    avgSentenceWords: number;
  };
  serp: { title: string; url: string; description: string };
  headings: { level: number; text: string }[];
}

/** Minuscule, sans accents ni ponctuation : pour comparer un mot-clé au texte d'une page. */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function countOccurrences(haystack: string, needle: string): number {
  const n = fold(needle);
  if (!n) return 0;
  const h = ` ${fold(haystack)} `;
  let count = 0;
  let i = h.indexOf(` ${n} `);
  while (i !== -1) {
    count++;
    i = h.indexOf(` ${n} `, i + n.length + 1);
  }
  return count;
}

const containsKw = (text: string, kw: string) => countOccurrences(text, kw) > 0;
const WEIGHT: Record<CheckStatus, number> = { pass: 1, warn: 0.5, fail: 0 };

export function analyzeOnPage(html: string, url: string, keyword: string): OptimizerResult {
  const root = parse(html);
  const txt = (s?: string | null) => (s ?? "").replace(/\s+/g, " ").trim();
  const title = txt(root.querySelector("title")?.text);
  const meta = txt(
    root
      .querySelectorAll("meta")
      .find((m) => m.getAttribute("name")?.toLowerCase() === "description")
      ?.getAttribute("content"),
  );
  const h1s = root.querySelectorAll("h1").map((h) => txt(h.text));
  const headings = root
    .querySelectorAll("h1, h2, h3")
    .map((h) => ({ level: Number(h.tagName[1]), text: txt(h.text) }))
    .filter((h) => h.text);
  const h2s = headings.filter((h) => h.level === 2);

  const imgs = root.querySelectorAll("img");
  const body = root.querySelector("body");
  const links = body?.querySelectorAll("a[href]") ?? [];
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* url invalide */
  }
  let internalLinks = 0;
  let externalLinks = 0;
  for (const a of links) {
    const href = a.getAttribute("href") ?? "";
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    try {
      const h = new URL(href, url).hostname.replace(/^www\./, "");
      if (h === host) internalLinks++;
      else externalLinks++;
    } catch {
      /* ignore */
    }
  }

  const hasTable = !!body?.querySelector("table");
  const hasList = !!body?.querySelector("ul, ol");
  const hasJsonLd = root
    .querySelectorAll("script")
    .some((s) => s.getAttribute("type") === "application/ld+json");
  for (const el of body?.querySelectorAll("script, style, noscript, nav, footer, header") ?? [])
    el.remove();
  const text = txt(body?.text);
  const words = text.split(" ").filter(Boolean);
  const wordCount = words.length;
  const first100 = words.slice(0, 100).join(" ");
  const keywordCount = countOccurrences(text, keyword);
  const kwWords = fold(keyword).split(" ").filter(Boolean).length || 1;
  const density = wordCount ? ((keywordCount * kwWords) / wordCount) * 100 : 0;
  const sentences = text.split(/[.!?…]+\s/).filter((s) => s.trim().split(" ").length > 2);
  const avgSentenceWords = sentences.length ? Math.round(wordCount / sentences.length) : 0;
  const slug = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  })();
  const altWithKw = imgs.filter((i) => containsKw(i.getAttribute("alt") ?? "", keyword)).length;

  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);

  // — Mot-clé
  const titleHas = containsKw(title, keyword);
  const titleStart = titleHas && fold(title).indexOf(fold(keyword)) <= 20;
  add({
    id: "kw_title",
    group: "Mot-clé",
    label: "Mot-clé dans le title",
    status: titleHas ? (titleStart ? "pass" : "warn") : "fail",
    detail: titleHas
      ? titleStart
        ? "Présent en début de title."
        : "Présent, mais pas en début de title."
      : "Absent du title.",
    fix: titleHas
      ? "Placez le mot-clé dans les premiers mots du title."
      : "Ajoutez le mot-clé principal, idéalement au début du title.",
  });
  add({
    id: "kw_h1",
    group: "Mot-clé",
    label: "Mot-clé dans le H1",
    status: h1s.some((h) => containsKw(h, keyword)) ? "pass" : "fail",
    detail: h1s.length ? `H1 : « ${h1s[0].slice(0, 80)} »` : "Aucun H1 trouvé.",
    fix: "Faites apparaître le mot-clé (ou sa variante exacte) dans l'unique H1.",
  });
  add({
    id: "kw_meta",
    group: "Mot-clé",
    label: "Mot-clé dans la meta description",
    status: containsKw(meta, keyword) ? "pass" : meta ? "warn" : "fail",
    detail: meta
      ? containsKw(meta, keyword)
        ? "Présent."
        : "Absent de la description."
      : "Meta description manquante.",
    fix: "Intégrez le mot-clé naturellement dans la meta description, avec un appel à l'action.",
  });
  add({
    id: "kw_url",
    group: "Mot-clé",
    label: "Mot-clé dans l'URL",
    status: containsKw(slug.replace(/[-_/]+/g, " "), keyword) ? "pass" : "warn",
    detail: slug,
    fix: "Un slug court contenant le mot-clé aide la compréhension (ne changez pas une URL déjà classée sans redirection 301).",
  });
  add({
    id: "kw_intro",
    group: "Mot-clé",
    label: "Mot-clé dans les 100 premiers mots",
    status: containsKw(first100, keyword) ? "pass" : "warn",
    detail: containsKw(first100, keyword)
      ? "Présent dans l'introduction."
      : "Absent de l'introduction.",
    fix: "Annoncez le sujet dès l'introduction, avec le mot-clé exact.",
  });
  add({
    id: "kw_density",
    group: "Mot-clé",
    label: "Fréquence du mot-clé",
    status:
      keywordCount === 0
        ? "fail"
        : density > 3
          ? "fail"
          : density > 2.5 || density < 0.3
            ? "warn"
            : "pass",
    detail: `${keywordCount} occurrence(s), densité ${density.toFixed(2)} %.`,
    fix:
      density > 2.5
        ? "Risque de sur-optimisation : variez avec des synonymes."
        : "Utilisez le mot-clé et ses variantes plus naturellement dans le texte.",
  });
  add({
    id: "kw_h2",
    group: "Mot-clé",
    label: "Mot-clé ou variante dans un H2",
    status: h2s.some((h) => containsKw(h.text, keyword)) ? "pass" : h2s.length ? "warn" : "fail",
    detail: `${h2s.length} H2 sur la page.`,
    fix: "Reprenez le mot-clé ou une variante dans au moins un sous-titre.",
  });

  // — Structure
  const tl = title.length;
  add({
    id: "title_len",
    group: "Structure",
    label: "Longueur du title (30–60 car.)",
    status: tl >= 30 && tl <= 60 ? "pass" : tl === 0 ? "fail" : "warn",
    detail: `${tl} caractères.`,
    fix: "Visez 30 à 60 caractères pour éviter la troncature.",
  });
  const ml = meta.length;
  add({
    id: "meta_len",
    group: "Structure",
    label: "Longueur de la meta description (70–160 car.)",
    status: ml >= 70 && ml <= 160 ? "pass" : ml === 0 ? "fail" : "warn",
    detail: `${ml} caractères.`,
    fix: "Visez 70 à 160 caractères.",
  });
  add({
    id: "h1_single",
    group: "Structure",
    label: "Un seul H1",
    status: h1s.length === 1 ? "pass" : h1s.length === 0 ? "fail" : "warn",
    detail: `${h1s.length} H1.`,
    fix: "Conservez exactement un H1.",
  });
  add({
    id: "h2_count",
    group: "Structure",
    label: "Plan structuré en sous-titres",
    status: h2s.length >= 3 ? "pass" : h2s.length >= 1 ? "warn" : "fail",
    detail: `${h2s.length} H2.`,
    fix: "Découpez le contenu avec des H2 qui répondent à des questions précises.",
  });

  // — Contenu
  add({
    id: "words",
    group: "Contenu",
    label: "Longueur du contenu",
    status: wordCount >= 800 ? "pass" : wordCount >= 300 ? "warn" : "fail",
    detail: `${wordCount} mots.`,
    fix: "Couvrez le sujet en profondeur. Comparez avec les pages du top 10 sur votre requête.",
  });
  add({
    id: "readability",
    group: "Contenu",
    label: "Lisibilité (phrases courtes)",
    status:
      avgSentenceWords === 0
        ? "warn"
        : avgSentenceWords <= 22
          ? "pass"
          : avgSentenceWords <= 30
            ? "warn"
            : "fail",
    detail: avgSentenceWords
      ? `${avgSentenceWords} mots par phrase en moyenne.`
      : "Phrases non détectées.",
    fix: "Raccourcissez les phrases (idéalement moins de 20 mots).",
  });
  add({
    id: "format",
    group: "Contenu",
    label: "Listes ou tableaux",
    status: hasList || hasTable ? "pass" : "warn",
    detail: hasList || hasTable ? "Contenu structuré présent." : "Aucune liste ni tableau.",
    fix: "Les listes et tableaux facilitent la lecture et les extraits enrichis.",
  });
  add({
    id: "internal_links",
    group: "Contenu",
    label: "Liens internes (3 ou plus)",
    status: internalLinks >= 3 ? "pass" : internalLinks >= 1 ? "warn" : "fail",
    detail: `${internalLinks} lien(s) interne(s).`,
    fix: "Ajoutez des liens vers vos pages liées, avec des ancres descriptives.",
  });
  add({
    id: "external_links",
    group: "Contenu",
    label: "Source externe citée",
    status: externalLinks >= 1 ? "pass" : "warn",
    detail: `${externalLinks} lien(s) externe(s).`,
    fix: "Citez une source fiable : bon signal de confiance et de citation.",
  });

  // — Technique
  add({
    id: "img_alt",
    group: "Technique",
    label: "Images avec texte alternatif",
    status:
      imgs.length === 0
        ? "warn"
        : imgs.every((i) => i.getAttribute("alt"))
          ? altWithKw
            ? "pass"
            : "warn"
          : "fail",
    detail: imgs.length
      ? `${imgs.length} image(s), ${altWithKw} avec le mot-clé dans l'alt.`
      : "Aucune image.",
    fix: "Décrivez chaque image ; le mot-clé dans un alt pertinent est un plus.",
  });
  add({
    id: "schema",
    group: "Technique",
    label: "Données structurées (JSON-LD)",
    status: hasJsonLd ? "pass" : "warn",
    detail: hasJsonLd ? "Balisage présent." : "Aucun balisage.",
    fix: "Ajoutez le schema adapté (Article, FAQ, Product…). Voir le générateur dans Outils.",
  });

  // Les critères liés au mot-clé comptent double : c'est le but de l'optimisation.
  const w = (c: Check) => (c.group === "Mot-clé" ? 2 : 1);
  const score = Math.round(
    (checks.reduce((a, c) => a + WEIGHT[c.status] * w(c), 0) /
      checks.reduce((a, c) => a + w(c), 0)) *
      100,
  );
  return {
    score,
    checks,
    stats: {
      wordCount,
      keywordCount,
      density: Math.round(density * 100) / 100,
      h2Count: h2s.length,
      internalLinks,
      externalLinks,
      avgSentenceWords,
    },
    serp: { title, url, description: meta },
    headings,
  };
}
