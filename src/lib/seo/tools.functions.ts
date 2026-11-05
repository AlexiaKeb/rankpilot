import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { analyzeOnPage } from "./optimizer";
import { buildQueries, classifyIntent, clusterKeywords, dedupeSuggestions } from "./keywords";
import { isSafePublicHost } from "./url";

export const analyzeUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ url: z.string().trim().max(500), keyword: z.string().trim().min(2).max(120) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { fetchPage } = await import("./fetch.server");
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(data.url) ? data.url : `https://${data.url}`);
    } catch {
      throw new Error("URL invalide.");
    }
    if (!isSafePublicHost(url.hostname)) throw new Error("Cette adresse n'est pas autorisée.");
    const page = await fetchPage(url.toString());
    if (page.status === 0) throw new Error("Page injoignable (délai dépassé ou site bloqué).");
    if (page.status >= 400) throw new Error(`La page renvoie une erreur ${page.status}.`);
    if (!page.html) throw new Error("La page ne renvoie pas de HTML analysable.");
    return {
      ...analyzeOnPage(page.html, page.finalUrl, data.keyword),
      responseMs: page.responseMs,
      status: page.status,
    };
  });

async function suggest(q: string, lang: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://suggestqueries.google.com/complete/search?client=firefox&hl=${lang}&q=${encodeURIComponent(q)}`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as unknown;
    const list = Array.isArray(json) ? json[1] : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export const suggestKeywords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ seed: z.string().trim().min(2).max(80), lang: z.enum(["fr", "en"]).default("fr") })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const lists = await Promise.all(buildQueries(data.seed).map((q) => suggest(q, data.lang)));
    const keywords = dedupeSuggestions(lists, data.seed).slice(0, 150);
    return {
      total: keywords.length,
      items: keywords.map((k) => ({ keyword: k, intent: classifyIntent(k) })),
      clusters: clusterKeywords(keywords, data.seed),
    };
  });
