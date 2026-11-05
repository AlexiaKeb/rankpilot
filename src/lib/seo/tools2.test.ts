import { describe, expect, it } from "vitest";
import { botAccess, buildLlmsTxt, isAllowed, parseRobots } from "./ai";
import { suggestInternalLinks } from "./linking";
import { parseSpeed } from "./speed";

describe("robots IA", () => {
  const robots = `User-agent: *\nDisallow: /admin\n\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nUser-agent: CCBot\nDisallow: /\nAllow: /blog`;
  const g = parseRobots(robots);
  it("règle spécifique prioritaire sur *", () => {
    expect(isAllowed(g, "GPTBot")).toBe(false);
    expect(isAllowed(g, "PerplexityBot")).toBe(true);
    expect(isAllowed(g, "PerplexityBot", "/admin/x")).toBe(false);
  });
  it("groupes à plusieurs agents et allow le plus long", () => {
    expect(isAllowed(g, "ClaudeBot")).toBe(false);
    expect(isAllowed(g, "CCBot", "/blog/article")).toBe(true);
  });
  it("sans robots.txt tout est autorisé", () => {
    expect(botAccess(null).every((b) => b.allowed)).toBe(true);
    expect(botAccess(robots).find((b) => b.ua === "GPTBot")?.allowed).toBe(false);
  });
});

describe("llms.txt", () => {
  it("génère le format attendu", () => {
    const t = buildLlmsTxt({ name: "Ma Boutique", summary: "Vente de plantes." }, [
      { url: "https://x.fr/a", title: "Plantes [rares]", description: "Notre sélection" },
      { url: "https://x.fr/b", title: null, description: null },
    ]);
    expect(t).toContain("# Ma Boutique");
    expect(t).toContain("> Vente de plantes.");
    expect(t).toContain("- [Plantes rares](https://x.fr/a): Notre sélection");
    expect(t).not.toContain("x.fr/b");
  });
});

describe("maillage interne", () => {
  const P = (url: string, title: string, links: string[] = []) => ({
    url,
    title,
    internalLinks: links,
    status: 200,
  });
  it("propose des sources proches pour une page peu liée", () => {
    const pages = [
      P("https://x.fr", "Accueil", ["https://x.fr/a", "https://x.fr/b"]),
      P("https://x.fr/a", "Guide chaudière gaz", []),
      P("https://x.fr/b", "Prix chaudière gaz 2026", []),
      P("https://x.fr/c", "Entretien chaudière gaz", []),
    ];
    const s = suggestInternalLinks(pages, "https://x.fr");
    const forC = s.find((x) => x.target.url === "https://x.fr/c");
    expect(forC?.inbound).toBe(0);
    expect(forC?.from.map((f) => f.url).sort()).toEqual(["https://x.fr/a", "https://x.fr/b"]);
    expect(s.find((x) => x.target.url === "https://x.fr")).toBeUndefined();
  });
});

describe("PageSpeed", () => {
  it("extrait scores, métriques et opportunités", () => {
    const r = parseSpeed(
      {
        lighthouseResult: {
          categories: { performance: { score: 0.82 }, seo: { score: 1 } },
          audits: {
            "largest-contentful-paint": { numericValue: 3200, score: 0.4 },
            "cumulative-layout-shift": { numericValue: 0.05, score: 0.98 },
            "unused-css-rules": {
              title: "Réduisez le CSS inutilisé",
              details: { type: "opportunity", overallSavingsMs: 450 },
            },
          },
        },
        loadingExperience: {
          metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2100, category: "FAST" } },
        },
      },
      "mobile",
    );
    expect(r.scores.performance).toBe(82);
    expect(r.lab[0]).toMatchObject({ value: "3.2 s", rating: "poor" });
    expect(r.field?.[0]).toMatchObject({ value: "2.1 s", rating: "good" });
    expect(r.opportunities[0].savingsMs).toBe(450);
  });
});
