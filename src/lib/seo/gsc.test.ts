import { describe, expect, it } from "vitest";
import { expectedCtr, findOpportunities, movers, pctChange, periods, type GscRow } from "./gsc";

const row = (q: string, clicks: number, impressions: number, position: number): GscRow => ({
  keys: [q],
  clicks,
  impressions,
  ctr: impressions ? clicks / impressions : 0,
  position,
});

describe("gsc", () => {
  it("ctr attendu décroît avec la position", () => {
    expect(expectedCtr(1)).toBeGreaterThan(expectedCtr(5));
    expect(expectedCtr(5)).toBeGreaterThan(expectedCtr(15));
  });
  it("détecte page 2 et CTR faible, ignore le faible volume", () => {
    const rows = [
      row("chaudière gaz prix", 10, 2000, 8),
      row("avis chaudière", 3, 1000, 2),
      row("entretien chaudière", 40, 1000, 12),
      row("rare", 0, 10, 9),
      row("déjà top", 300, 1000, 1),
    ];
    const o = findOpportunities(rows);
    expect(o.map((x) => x.query)).toEqual([
      "chaudière gaz prix",
      "avis chaudière",
      "entretien chaudière",
    ]); // trié par gain estimé
    expect(o.find((x) => x.query === "avis chaudière")?.kind).toBe("ctr");
    expect(o.find((x) => x.query === "entretien chaudière")?.kind).toBe("page1");
    expect(o.some((x) => x.query === "rare" || x.query === "déjà top")).toBe(false);
    expect(o[0].gain).toBeGreaterThanOrEqual(o[o.length - 1].gain);
  });
  it("gagnants et perdants", () => {
    const m = movers(
      [row("a", 100, 0, 0), row("b", 10, 0, 0), row("c", 50, 0, 0)],
      [row("a", 40, 0, 0), row("b", 60, 0, 0), row("c", 52, 0, 0)],
    );
    expect(m.gainers[0]).toMatchObject({ key: "a", delta: 60 });
    expect(m.losers[0]).toMatchObject({ key: "b", delta: -50 });
    expect(m.gainers.concat(m.losers).some((x) => x.key === "c")).toBe(false);
  });
  it("périodes contiguës avec retard de 2 jours", () => {
    const p = periods(28, new Date("2026-11-05T12:00:00Z"));
    expect(p.end).toBe("2026-11-03");
    expect(p.start).toBe("2026-10-07");
    expect(p.prevEnd).toBe("2026-10-06");
    expect(p.prevStart).toBe("2026-09-09");
  });
  it("variation en %", () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(5, 0)).toBeNull();
  });
});
