import { describe, expect, it } from "vitest";
import { buildJsonLd } from "./jsonld";
import { buildQueries, classifyIntent, clusterKeywords, dedupeSuggestions } from "./keywords";
import { analyzeOnPage, countOccurrences, fold } from "./optimizer";

const html = (kw: string) => `<html><head><title>${kw} : le guide complet pour bien choisir</title>
<meta name="description" content="Tout savoir sur ${kw}, conseils et comparatif pour faire le bon choix rapidement et sereinement."></head>
<body><h1>${kw}</h1><p>Voici notre guide sur ${kw}. ${"Une phrase courte et claire. ".repeat(60)}</p>
<h2>Pourquoi ${kw} ?</h2><h2>Comment choisir</h2><h2>Prix</h2><ul><li>a</li></ul>
<a href="/a">a</a><a href="/b">b</a><a href="/c">c</a><a href="https://wikipedia.org">w</a>
<img src="x.jpg" alt="${kw} en situation"></body></html>`;

describe("optimizer", () => {
  it("fold et occurrences ignorent accents et casse", () => {
    expect(fold("Électricité  Éco!")).toBe("electricite eco");
    expect(
      countOccurrences("Le Chauffage électrique, le chauffage Électrique.", "chauffage electrique"),
    ).toBe(2);
    expect(countOccurrences("chauffages", "chauffage")).toBe(0);
  });
  it("page bien optimisée = score élevé", () => {
    const r = analyzeOnPage(
      html("chaudière à granulés"),
      "https://ex.com/chaudiere-a-granules",
      "chaudière à granulés",
    );
    expect(r.score).toBeGreaterThan(70);
    expect(r.checks.find((c) => c.id === "kw_title")?.status).toBe("pass");
    expect(r.checks.find((c) => c.id === "kw_url")?.status).toBe("pass");
    expect(r.stats.internalLinks).toBe(3);
  });
  it("mot-clé absent = échecs", () => {
    const r = analyzeOnPage(html("autre sujet"), "https://ex.com/x", "chaudière à granulés");
    expect(r.checks.find((c) => c.id === "kw_title")?.status).toBe("fail");
    expect(r.checks.find((c) => c.id === "kw_h1")?.status).toBe("fail");
    expect(r.score).toBeLessThan(60);
  });
});

describe("keywords", () => {
  it("intentions", () => {
    expect(classifyIntent("acheter chaudière pas cher")).toBe("transactionnelle");
    expect(classifyIntent("meilleure chaudière avis")).toBe("commerciale");
    expect(classifyIntent("comment installer une chaudière")).toBe("informationnelle");
  });
  it("requêtes, dédoublonnage et clusters", () => {
    expect(buildQueries("chaudière")).toContain("comment chaudière");
    const d = dedupeSuggestions([["Chaudière Gaz", "chaudière gaz"], ["chaudière"]], "chaudière");
    expect(d).toEqual(["Chaudière Gaz"]);
    const c = clusterKeywords(
      ["chaudière gaz prix", "chaudière gaz avis", "chaudière bois", "chaudière fioul"],
      "chaudière",
    );
    expect(c[0].head).toBe("gaz");
    expect(c[0].keywords).toHaveLength(2);
  });
});

describe("jsonld", () => {
  it("FAQ et produit", () => {
    const f = buildJsonLd("FAQPage", { qa: "Délai ? | 3 jours\nRetour ? | Oui | sous 14 j" }) as {
      mainEntity: { acceptedAnswer: { text: string } }[];
    };
    expect(f.mainEntity).toHaveLength(2);
    expect(f.mainEntity[1].acceptedAnswer.text).toBe("Oui | sous 14 j");
    const p = buildJsonLd("Product", { name: "X", price: "9.9" }) as {
      offers: { priceCurrency: string };
    };
    expect(p.offers.priceCurrency).toBe("EUR");
  });
});
