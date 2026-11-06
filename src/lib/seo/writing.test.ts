import { describe, expect, it } from "vitest";
import { BriefSchema, IdeasSchema, extractJson } from "./writing";

describe("extractJson", () => {
  it("lit du JSON entouré de texte ou de balises", () => {
    expect(extractJson('Voici :\n```json\n{"a":1}\n```\nFin')).toEqual({ a: 1 });
    expect(extractJson("[1,2]")).toEqual([1, 2]);
  });
  it("échoue proprement", () => {
    expect(() => extractJson("pas de json")).toThrow();
    expect(() => extractJson("{cassé")).toThrow();
  });
});

describe("schémas IA", () => {
  it("valide un brief minimal et applique les défauts", () => {
    const b = BriefSchema.parse({ titles: ["T"], meta: "m", outline: [{ h2: "a" }, { h2: "b" }] });
    expect(b.targetWords).toBe(1200);
    expect(b.faq).toEqual([]);
  });
  it("refuse un brief sans plan", () => {
    expect(BriefSchema.safeParse({ titles: ["T"], meta: "m", outline: [] }).success).toBe(false);
    expect(IdeasSchema.safeParse({ ideas: [] }).success).toBe(false);
  });
});
