import { describe, expect, it } from "vitest";
import {
  altFromSrc,
  brandFromHost,
  buildFixes,
  buildSitemap,
  cutAtWord,
  fixesToCsv,
  fixesToMarkdown,
  humanizeSlug,
  suggestMeta,
  suggestTitle,
  type PageLite,
} from "./fixes";

const page = (over: Partial<PageLite> & { url: string }): PageLite => ({
  status_code: 200,
  title: null,
  meta_description: null,
  word_count: 500,
  depth: 1,
  noindex: false,
  canonical: null,
  data: null,
  ...over,
});

describe("outils de texte", () => {
  it("coupe à la limite d'un mot", () => {
    expect(cutAtWord("Une phrase assez longue pour être coupée proprement", 20)).toBe(
      "Une phrase assez",
    );
    expect(cutAtWord("court", 20)).toBe("court");
  });
  it("slug lisible et marque", () => {
    expect(humanizeSlug("https://x.fr/chaudiere-gaz-prix/")).toBe("Chaudiere gaz prix");
    expect(brandFromHost("www.agent-estimation.fr")).toBe("Agent Estimation");
  });
  it("title de 30 à 60 caractères avec la marque", () => {
    const t = suggestTitle("Estimation immobilière gratuite en ligne", "Agent Estimation");
    expect(t.length).toBeLessThanOrEqual(60);
    expect(t.endsWith("| Agent Estimation")).toBe(true);
    expect(suggestTitle("A".repeat(90), "Marque").length).toBeLessThanOrEqual(60);
    expect(
      suggestTitle(
        "Un sujet très long qui dépasse largement la limite autorisée par Google",
        "Agent Estimation",
      ).length,
    ).toBeLessThanOrEqual(60);
  });
  it("meta tirée du texte, ni trop courte ni trop longue", () => {
    const m = suggestMeta(
      "Estimez votre bien immobilier en quelques minutes grâce à notre outil gratuit : renseignez l'adresse, la surface et recevez une fourchette de prix fiable pour votre maison ou appartement.",
      "Agent Estimation",
    )!;
    expect(m.length).toBeGreaterThanOrEqual(70);
    expect(m.length).toBeLessThanOrEqual(156);
    expect(suggestMeta("trop court", "X")).toBeNull();
  });
  it("alt depuis le nom de fichier", () => {
    expect(
      altFromSrc("https://x.fr/wp-content/uploads/2024/maison-bois-terrasse-300x200.jpg"),
    ).toBe("Maison bois terrasse");
    expect(altFromSrc("https://x.fr/IMG_20240101.jpg")).toBeNull();
  });
  it("sitemap XML valide et échappé", () => {
    const x = buildSitemap(["https://x.fr/", "https://x.fr/a?b=1&c=2"]);
    expect(x).toContain("<loc>https://x.fr/a?b=1&amp;c=2</loc>");
    expect(x.startsWith("<?xml")).toBe(true);
  });
});

describe("buildFixes", () => {
  const pages = [
    page({
      url: "https://agent-estimation.fr/",
      title: "Accueil",
      data: {
        h1: ["Estimation immobilière"],
        excerpt:
          "Estimez votre bien immobilier en quelques minutes grâce à notre outil gratuit et fiable, sans engagement.",
        imgsNoAlt: [],
      },
    }),
    page({
      url: "https://agent-estimation.fr/prix-m2-paris",
      title: null,
      data: {
        h1: ["Prix du m² à Paris"],
        excerpt:
          "Découvrez le prix moyen du mètre carré à Paris, arrondissement par arrondissement, avec l'évolution sur cinq ans.",
        imgsNoAlt: ["/uploads/appartement-haussmannien-1200x800.jpg"],
      },
    }),
  ];
  const issues = [
    { code: "title_missing", url: "https://agent-estimation.fr/prix-m2-paris" },
    { code: "meta_missing", url: "https://agent-estimation.fr/prix-m2-paris" },
    { code: "img_alt_missing", url: "https://agent-estimation.fr/prix-m2-paris" },
    { code: "canonical_missing", url: "https://agent-estimation.fr/" },
    { code: "jsonld_missing", url: "https://agent-estimation.fr/" },
    { code: "jsonld_missing", url: "https://agent-estimation.fr/prix-m2-paris" },
  ];
  const fixes = buildFixes({
    issues,
    pages,
    siteName: "Agent Estimation",
    origin: "https://agent-estimation.fr",
    sitemapFound: false,
    robotsFound: false,
  });
  const kinds = fixes.map((f) => f.kind);
  it("génère title, meta, alt, canonical, schema, robots et sitemap", () => {
    for (const k of ["title", "meta", "alt", "canonical", "schema", "robots", "sitemap"])
      expect(kinds).toContain(k);
  });
  it("title issu du H1 et de la marque", () => {
    expect(fixes.find((f) => f.kind === "title")?.suggested).toBe(
      "Prix du m² à Paris | Agent Estimation",
    );
  });
  it("JSON-LD valide : Organization pour l'accueil, WebPage + fil d'Ariane ailleurs", () => {
    const s = fixes.filter((f) => f.kind === "schema");
    const parse = (f: string) => JSON.parse(f.replace(/<\/?script[^>]*>/g, ""));
    expect(parse(s[0].suggested)["@type"]).toBe("Organization");
    expect(parse(s[1].suggested)["@graph"][1]["@type"]).toBe("BreadcrumbList");
  });
  it("sitemap contient les pages indexables", () => {
    const sm = fixes.find((f) => f.kind === "sitemap")!;
    expect(sm.suggested).toContain("https://agent-estimation.fr/prix-m2-paris");
  });
  it("rien à proposer si tout est présent", () => {
    expect(
      buildFixes({
        issues: [],
        pages,
        siteName: "A",
        origin: "https://agent-estimation.fr",
        sitemapFound: true,
        robotsFound: true,
      }),
    ).toEqual([]);
  });
});

describe("exports", () => {
  const fixes = [
    {
      id: "a",
      kind: "title" as const,
      url: "https://x.fr/a",
      label: "/a",
      current: 'Ancien "titre"',
      suggested: "Nouveau titre | X",
      format: "texte" as const,
    },
    {
      id: "b",
      kind: "canonical" as const,
      url: "https://x.fr/a",
      label: "/a",
      suggested: '<link rel="canonical" href="https://x.fr/a">',
      format: "html" as const,
    },
  ];
  it("CSV échappe les guillemets et commence par un BOM", () => {
    const c = fixesToCsv(fixes);
    expect(c.charCodeAt(0)).toBe(0xfeff);
    expect(c).toContain('"Ancien ""titre"""');
    expect(c.split("\n")).toHaveLength(3);
  });
  it("brief Markdown regroupé par type", () => {
    const m = fixesToMarkdown(fixes, "Mon site");
    expect(m).toContain("# Corrections SEO — Mon site");
    expect(m).toContain("## Titles à réécrire (1)");
    expect(m).toContain("```html");
  });
});
