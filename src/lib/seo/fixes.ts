import { fold } from "./optimizer";

// Corrections prêtes à copier, calculées à partir du contenu réel des pages (aucune donnée inventée).

export type FixKind =
  | "title"
  | "meta"
  | "h1"
  | "canonical"
  | "alt"
  | "schema"
  | "viewport"
  | "lang"
  | "robots"
  | "sitemap";

export interface Fix {
  id: string;
  kind: FixKind;
  url: string;
  label: string;
  current?: string;
  suggested: string;
  format: "texte" | "html" | "xml";
  note?: string;
  /** Mot-clé de départ pour demander des variantes à l'IA (titles et metas) */
  seed?: string;
}

export interface PageLite {
  url: string;
  status_code: number | null;
  title: string | null;
  meta_description: string | null;
  word_count: number | null;
  depth: number;
  noindex: boolean | null;
  canonical: string | null;
  data: { h1?: string[]; excerpt?: string; imgsNoAlt?: string[]; lang?: string | null } | null;
}

export interface FixInput {
  issues: { code: string; url: string }[];
  pages: PageLite[];
  siteName: string;
  origin: string;
  sitemapFound: boolean;
  robotsFound: boolean;
}

export const FIX_META: Record<FixKind, { title: string; where: string }> = {
  title: {
    title: "Titles à réécrire",
    where:
      "WordPress : Yoast / Rank Math > Titre SEO. Shopify : Modifier le référencement du site web. Autre CMS : balise <title>.",
  },
  meta: {
    title: "Meta descriptions",
    where:
      "WordPress : Yoast / Rank Math > Meta description. Shopify : Modifier le référencement du site web.",
  },
  h1: {
    title: "Titres H1",
    where: "Dans l'éditeur de la page : style « Titre 1 ». Un seul H1 par page.",
  },
  canonical: {
    title: "Balises canonical",
    where: "À placer dans le <head> de la page (souvent gérée par votre extension SEO).",
  },
  alt: {
    title: "Textes alternatifs d'images",
    where: "Médiathèque ou bloc image : champ « Texte alternatif ».",
  },
  schema: {
    title: "Données structurées (JSON-LD)",
    where:
      "À coller dans le <head> de la page, ou dans le champ « code personnalisé » de votre CMS.",
  },
  viewport: { title: "Balise viewport", where: "Dans le <head> du thème." },
  lang: { title: "Langue de la page", where: "Sur la balise <html> du thème." },
  robots: { title: "robots.txt", where: "À créer à la racine du site : /robots.txt." },
  sitemap: {
    title: "Sitemap XML",
    where: "À publier sur /sitemap.xml puis à soumettre dans la Search Console.",
  },
};

const path = (u: string) => {
  try {
    return new URL(u).pathname || "/";
  } catch {
    return u;
  }
};

/** Coupe proprement à la limite d'un mot (jamais au milieu). */
export function cutAtWord(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const i = cut.lastIndexOf(" ");
  return (i > max * 0.6 ? cut.slice(0, i) : t.slice(0, max)).replace(/[\s,;:–—-]+$/, "");
}

/** Adresse de page lisible : /chaudiere-gaz-prix/ -> « Chaudiere gaz prix » */
export function humanizeSlug(u: string): string {
  const seg = path(u).split("/").filter(Boolean).pop() ?? "";
  const t = decodeURIComponent(seg)
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}

export function brandFromHost(host: string): string {
  const base = host.replace(/^www\./, "").split(".")[0] ?? host;
  return base
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Title de 30 à 60 caractères : sujet de la page + marque, sans dépasser. */
export function suggestTitle(subject: string, brand: string): string {
  const s = subject.replace(/\s+/g, " ").trim();
  const sep = " | ";
  if (!s) return brand;
  const full = `${s}${sep}${brand}`;
  if (full.length <= 60 && full.length >= 30) return full;
  if (s.length > 60) return cutAtWord(s, 60);
  if (full.length > 60) return cutAtWord(s, 60 - sep.length - brand.length) + sep + brand;
  return s.length >= 30 ? s : full; // trop court : on ajoute la marque
}

/** Meta description de 70 à 155 caractères tirée du texte de la page. */
export function suggestMeta(excerpt: string, brand: string): string | null {
  const clean = excerpt
    .replace(/\s+/g, " ")
    .replace(/^[\s\W]+/, "")
    .trim();
  if (clean.length < 40) return null;
  let m = cutAtWord(clean, 150);
  if (!/[.!?…]$/.test(m)) m += "…";
  return m.length < 70 ? `${m} ${brand}.` : m;
}

/** Texte alternatif déduit du nom de fichier (à relire : le nom n'est pas toujours parlant). */
export function altFromSrc(src: string): string | null {
  let name = "";
  try {
    name = decodeURIComponent(new URL(src, "https://x.fr").pathname.split("/").pop() ?? "");
  } catch {
    return null;
  }
  const t = name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]\d{2,4}x\d{2,4}$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b(img|image|photo|dsc|screenshot|copie|copy)\b/gi, " ")
    .replace(/\d{4,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length >= 4 && /[a-zA-ZÀ-ÿ]{3,}/.test(t) ? t.charAt(0).toUpperCase() + t.slice(1) : null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildSitemap(urls: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join("\n")}\n</urlset>\n`;
}

export function buildRobots(origin: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
}

function jsonLd(obj: unknown): string {
  return `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n</script>`;
}

export function schemaFor(page: PageLite, origin: string, brand: string): string {
  const u = new URL(page.url);
  const home = u.pathname === "/" || u.pathname === "";
  if (home)
    return jsonLd({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: brand,
      url: origin,
    });
  const crumbs = u.pathname.split("/").filter(Boolean);
  return jsonLd({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: page.data?.h1?.[0] || page.title || humanizeSlug(page.url),
        url: page.url,
        ...(page.meta_description ? { description: page.meta_description } : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: brand, item: origin },
          ...crumbs.map((c, i) => ({
            "@type": "ListItem",
            position: i + 2,
            name: humanizeSlug(`${origin}/${c}`),
            item: `${origin}/${crumbs.slice(0, i + 1).join("/")}`,
          })),
        ],
      },
    ],
  });
}

export function buildFixes(input: FixInput, maxPerKind = 25): Fix[] {
  const { issues, pages, siteName, origin } = input;
  const brand = siteName || brandFromHost(new URL(origin).hostname);
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  const flagged = (code: string) => [
    ...new Set(issues.filter((i) => i.code === code).map((i) => i.url)),
  ];
  const out: Fix[] = [];
  const add = (f: Fix) => out.push(f);
  const subjectOf = (p: PageLite) => p.data?.h1?.[0] || humanizeSlug(p.url) || p.title || "";

  // Titles : manquants, trop courts/longs, dupliqués
  const titleUrls = [
    ...new Set(["title_missing", "title_short", "title_long", "title_duplicate"].flatMap(flagged)),
  ];
  for (const url of titleUrls.slice(0, maxPerKind)) {
    const p = byUrl.get(url);
    if (!p) continue;
    const subject = subjectOf(p);
    const home = path(url) === "/";
    const suggested = suggestTitle(home ? p.title || subject || brand : subject, brand);
    if (!suggested || suggested === p.title) continue;
    add({
      id: `title:${url}`,
      kind: "title",
      url,
      label: path(url),
      current: p.title ?? "(aucun)",
      suggested,
      format: "texte",
      seed: subject,
      note: `${suggested.length} caractères. Reformulez si le sujet n'est pas le bon mot-clé.`,
    });
  }

  // Meta descriptions : manquantes ou trop longues
  for (const url of [...new Set(["meta_missing", "meta_long"].flatMap(flagged))].slice(
    0,
    maxPerKind,
  )) {
    const p = byUrl.get(url);
    if (!p) continue;
    const base =
      p.meta_description && p.meta_description.length > 160
        ? p.meta_description
        : (p.data?.excerpt ?? "");
    const suggested = suggestMeta(base, brand);
    if (!suggested) continue;
    add({
      id: `meta:${url}`,
      kind: "meta",
      url,
      label: path(url),
      current: p.meta_description || "(aucune)",
      suggested,
      format: "texte",
      seed: subjectOf(p),
      note: `${suggested.length} caractères, tirée du texte de la page : relisez-la et ajoutez un appel à l'action.`,
    });
  }

  // H1
  for (const url of flagged("h1_missing").slice(0, maxPerKind)) {
    const p = byUrl.get(url);
    if (!p) continue;
    const s = cutAtWord((p.title ?? "").split(/\s[|–—-]\s/)[0] || humanizeSlug(url), 70);
    if (s)
      add({
        id: `h1:${url}`,
        kind: "h1",
        url,
        label: path(url),
        current: "(aucun)",
        suggested: s,
        format: "texte",
        note: "Proposé à partir du title. Le H1 doit annoncer le sujet précis de la page.",
      });
  }
  for (const url of flagged("h1_multiple").slice(0, maxPerKind)) {
    const p = byUrl.get(url);
    const h = p?.data?.h1 ?? [];
    if (h.length > 1)
      add({
        id: `h1m:${url}`,
        kind: "h1",
        url,
        label: path(url),
        current: h.map((x) => `H1 : ${x}`).join("\n"),
        suggested: `Gardez : ${h[0]}\nPassez en H2 : ${h.slice(1).join(" / ")}`,
        format: "texte",
      });
  }

  // Canonical, viewport, lang
  for (const url of flagged("canonical_missing").slice(0, maxPerKind))
    add({
      id: `canon:${url}`,
      kind: "canonical",
      url,
      label: path(url),
      suggested: `<link rel="canonical" href="${url}">`,
      format: "html",
    });
  for (const url of flagged("viewport_missing").slice(0, 1))
    add({
      id: "viewport",
      kind: "viewport",
      url,
      label: "Toutes les pages",
      suggested: `<meta name="viewport" content="width=device-width, initial-scale=1">`,
      format: "html",
    });
  for (const url of flagged("lang_missing").slice(0, 1))
    add({
      id: "lang",
      kind: "lang",
      url,
      label: "Toutes les pages",
      suggested: `<html lang="fr">`,
      format: "html",
      note: "Remplacez fr par la langue du site (en, es…).",
    });

  // Textes alternatifs
  let altCount = 0;
  for (const url of flagged("img_alt_missing")) {
    const imgs = byUrl.get(url)?.data?.imgsNoAlt ?? [];
    for (const src of imgs) {
      if (altCount >= maxPerKind) break;
      const alt = altFromSrc(src);
      if (!alt) continue;
      altCount++;
      add({
        id: `alt:${url}:${src}`,
        kind: "alt",
        url,
        label: `${path(url)} — ${src.split("/").pop()}`,
        current: "(aucun)",
        suggested: alt,
        format: "texte",
        note: "Déduit du nom du fichier : décrivez ce que l'image montre vraiment.",
      });
    }
  }

  // Données structurées
  for (const url of flagged("jsonld_missing").slice(0, 8)) {
    const p = byUrl.get(url);
    if (!p) continue;
    add({
      id: `schema:${url}`,
      kind: "schema",
      url,
      label: path(url),
      suggested: schemaFor(p, origin, brand),
      format: "html",
      note: "Balisage valide construit à partir de la page. Ajoutez Article, Produit ou FAQ si la page s'y prête (Outils gratuits).",
    });
  }

  // robots.txt et sitemap.xml
  if (!input.robotsFound)
    add({
      id: "robots",
      kind: "robots",
      url: `${origin}/robots.txt`,
      label: "/robots.txt",
      suggested: buildRobots(origin),
      format: "texte",
    });
  if (!input.sitemapFound) {
    const urls = pages
      .filter(
        (p) =>
          p.status_code === 200 &&
          !p.noindex &&
          (!p.canonical || p.canonical === p.url || p.canonical === p.url.replace(/\/$/, "")),
      )
      .map((p) => p.url)
      .sort();
    if (urls.length)
      add({
        id: "sitemap",
        kind: "sitemap",
        url: `${origin}/sitemap.xml`,
        label: `/sitemap.xml (${urls.length} pages)`,
        suggested: buildSitemap(urls),
        format: "xml",
        note: "Généré à partir des pages indexables trouvées par l'audit.",
      });
  }
  return out;
}

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

/** Export tableur : une ligne par correction (UTF-8 avec BOM pour Excel). */
export function fixesToCsv(fixes: Fix[]): string {
  const rows = fixes.map((f) =>
    [FIX_META[f.kind].title, f.label, f.current ?? "", f.suggested, FIX_META[f.kind].where]
      .map(csvCell)
      .join(","),
  );
  return (
    "\ufeff" +
    [
      ["Type", "Page", "Actuel", "Suggestion", "Où l'appliquer"].map(csvCell).join(","),
      ...rows,
    ].join("\n")
  );
}

/** Brief à transmettre à un développeur ou un prestataire, au format Markdown. */
export function fixesToMarkdown(fixes: Fix[], siteName: string): string {
  const out = [
    `# Corrections SEO — ${siteName}`,
    "",
    `${fixes.length} correction(s) à appliquer. Suggestions générées à partir du contenu des pages : à relire avant publication.`,
    "",
  ];
  for (const kind of Object.keys(FIX_META) as FixKind[]) {
    const list = fixes.filter((f) => f.kind === kind);
    if (!list.length) continue;
    out.push(
      `## ${FIX_META[kind].title} (${list.length})`,
      "",
      `Où l'appliquer : ${FIX_META[kind].where}`,
      "",
    );
    for (const f of list) {
      out.push(`### ${f.label}`);
      if (f.current) out.push(`- Actuel : ${f.current.replace(/\n/g, " / ")}`);
      out.push(
        f.format === "texte"
          ? `- À mettre : ${f.suggested.replace(/\n/g, " / ")}`
          : `- À mettre :\n\n\`\`\`${f.format === "xml" ? "xml" : "html"}\n${f.suggested.trim()}\n\`\`\``,
      );
      if (f.note) out.push(`- Note : ${f.note}`);
      out.push("");
    }
  }
  return out.join("\n");
}

export const fixesCountLabel = (n: number) =>
  `${n} correction${n > 1 ? "s" : ""} prête${n > 1 ? "s" : ""}`;
export { fold };
