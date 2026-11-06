import { describe, expect, it } from "vitest";
import { analyzeOnPage } from "./optimizer";
import { countTodos, htmlToPage, normalizeContent } from "./richtext";
import { htmlToMarkdown } from "./richtext-export";

describe("richtext", () => {
  it("normalise Markdown ancien et HTML récent", () => {
    expect(normalizeContent("# Titre\n\nTexte")).toContain("<h1>Titre</h1>");
    expect(normalizeContent("<h2>Déjà HTML</h2><p>x</p>")).toBe("<h2>Déjà HTML</h2><p>x</p>");
    expect(normalizeContent("  ")).toBe("");
  });
  it("note un contenu HTML avec l'optimiseur", () => {
    const html =
      "<h2>Pourquoi une chaudière à granulés ?</h2><p>La chaudière à granulés chauffe bien.</p><ul><li>a</li></ul>";
    const r = analyzeOnPage(
      htmlToPage({
        title: "Chaudière à granulés : le guide",
        meta: "Tout savoir sur la chaudière à granulés avant d'acheter, prix et entretien.",
        html,
      }),
      "https://x.fr/chaudiere",
      "chaudière à granulés",
    );
    expect(r.checks.find((c) => c.id === "kw_h2")?.status).toBe("pass");
    expect(r.checks.find((c) => c.id === "kw_title")?.status).toBe("pass");
  });
  it("compte les passages à compléter", () => {
    expect(countTodos("<p>[VOTRE EXPÉRIENCE : cas] et [À VÉRIFIER : prix] et [autre]</p>")).toBe(2);
  });
  it("exporte en Markdown avec tableau", () => {
    const md = htmlToMarkdown(
      "<h2>Titre</h2><p>Un <strong>mot</strong>.</p><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>",
    );
    expect(md).toContain("## Titre");
    expect(md).toContain("**mot**");
    expect(md).toMatch(/\|\s*A\s*\|\s*B\s*\|/);
  });
});
