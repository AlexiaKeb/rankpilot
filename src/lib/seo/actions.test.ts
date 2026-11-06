import { describe, expect, it } from "vitest";
import { buildWeeklyActions, decliningPages, findCannibalization } from "./actions";

const qp = (query: string, page: string, impressions: number, clicks = 0, position = 8) => ({
  query,
  page,
  clicks,
  impressions,
  position,
});

describe("cannibalisation", () => {
  it("détecte deux pages significatives sur une même requête", () => {
    const c = findCannibalization([
      qp("chaudière gaz", "https://x.fr/a", 600, 10),
      qp("chaudière gaz", "https://x.fr/b", 400, 4),
      qp("devis", "https://x.fr/a", 900),
      qp("devis", "https://x.fr/b", 10),
      qp("rare", "https://x.fr/a", 20),
      qp("rare", "https://x.fr/b", 20),
    ]);
    expect(c.map((x) => x.query)).toEqual(["chaudière gaz"]);
    expect(c[0].pages.map((p) => p.page)).toEqual(["https://x.fr/a", "https://x.fr/b"]);
  });
});

describe("pages en baisse", () => {
  it("associe les requêtes principales", () => {
    const d = decliningPages(
      [{ key: "https://x.fr/a", clicks: 5, previous: 40, delta: -35 }],
      [
        qp("q1", "https://x.fr/a", 100),
        qp("q2", "https://x.fr/a", 300),
        qp("q3", "https://x.fr/b", 999),
      ],
    );
    expect(d[0].topQueries.map((q) => q.query)).toEqual(["q2", "q1"]);
  });
});

describe("actions de la semaine", () => {
  const base = {
    audit: {
      counts: { meta_missing: 9, broken_link: 3, thin_content: 4 },
      samples: { broken_link: ["https://x.fr/a"] },
    },
    gsc: null,
    gscConnected: true,
    savedKeywords: 5,
  };
  it("urgences techniques d'abord, 5 max", () => {
    const a = buildWeeklyActions(base);
    expect(a[0].id).toBe("broken-links");
    expect(a.length).toBeLessThanOrEqual(5);
    expect(a.some((x) => x.id === "meta-missing")).toBe(true);
  });
  it("propose de connecter la Search Console quand absente", () => {
    expect(
      buildWeeklyActions({ ...base, gscConnected: false }).some((x) => x.id === "connect-gsc"),
    ).toBe(true);
  });
  it("intègre opportunités, baisse et cannibalisation", () => {
    const a = buildWeeklyActions({
      ...base,
      gsc: {
        opportunities: [
          {
            query: "prix",
            impressions: 900,
            clicks: 5,
            position: 9,
            ctr: 0.005,
            kind: "ctr",
            gain: 80,
            advice: "Réécrivez",
          },
        ],
        declining: [
          {
            page: "https://x.fr/guide",
            clicks: 3,
            previous: 30,
            delta: -27,
            topQueries: [{ query: "guide", clicks: 1, position: 12 }],
          },
        ],
        cannibalization: [
          {
            query: "gaz",
            totalImpressions: 500,
            pages: [
              { page: "https://x.fr/a", clicks: 1, impressions: 300, position: 8 },
              { page: "https://x.fr/b", clicks: 1, impressions: 200, position: 9 },
            ],
          },
        ],
      },
    });
    const ids = a.map((x) => x.id);
    expect(ids.some((i) => i.startsWith("opp:"))).toBe(true);
    expect(ids.some((i) => i.startsWith("decline:"))).toBe(true);
    expect(a.length).toBe(5);
  });
  it("vide si tout va bien", () => {
    expect(
      buildWeeklyActions({
        audit: { counts: {}, samples: {} },
        gsc: null,
        gscConnected: true,
        savedKeywords: 3,
      }),
    ).toEqual([]);
  });
});
