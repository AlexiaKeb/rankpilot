import { describe, expect, it } from "vitest";
import { analyzeOnPage } from "./optimizer";
import { articleToPage, mdToHtml } from "./markdown";

describe("markdown", () => {
  it("convertit titres, listes, gras et liens", () => {
    const h = mdToHtml(
      "# Titre\n\nUn **mot** et [lien](https://x.fr).\n\n## Sous-titre\n- a\n- b\n\n1. un\n2. deux",
    );
    expect(h).toContain("<h1>Titre</h1>");
    expect(h).toContain("<strong>mot</strong>");
    expect(h).toContain('<a href="https://x.fr">lien</a>');
    expect(h).toContain("<ul>\n<li>a</li>\n<li>b</li>\n</ul>");
    expect(h).toContain("<ol>");
  });
  it("échappe le HTML", () => {
    expect(mdToHtml("<script>alert(1)</script>")).not.toContain("<script>");
  });
  it("le brouillon est noté par l'optimiseur", () => {
    const html = articleToPage({
      title: "Chaudière à granulés : guide complet",
      meta: "Tout savoir sur la chaudière à granulés avant d'acheter, prix et entretien.",
      markdown:
        "## Pourquoi une chaudière à granulés ?\n\nLa chaudière à granulés chauffe bien.\n\n## Prix\n\n- a\n- b",
    });
    const r = analyzeOnPage(html, "https://x.fr/chaudiere-a-granules", "chaudière à granulés");
    expect(r.checks.find((c) => c.id === "kw_title")?.status).toBe("pass");
    expect(r.checks.find((c) => c.id === "kw_h2")?.status).toBe("pass");
    expect(r.stats.h2Count).toBe(2);
  });
});
