import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { botAccess } from "./ai";
import { parseSpeed } from "./speed";
import { isSafePublicHost, normalizeDomain } from "./url";

const urlSchema = z.string().trim().min(3).max(500);
function toUrl(input: string): URL {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    throw new Error("URL invalide.");
  }
  if (!isSafePublicHost(u.hostname)) throw new Error("Cette adresse n'est pas autorisée.");
  return u;
}

export const speedTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ url: urlSchema, strategy: z.enum(["mobile", "desktop"]).default("mobile") })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const u = toUrl(data.url);
    const params = new URLSearchParams({ url: u.toString(), strategy: data.strategy });
    for (const c of ["performance", "seo", "accessibility", "best-practices"])
      params.append("category", c);
    if (process.env.PAGESPEED_API_KEY) params.set("key", process.env.PAGESPEED_API_KEY);
    let res: Response;
    try {
      res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, {
        signal: AbortSignal.timeout(80_000),
      });
    } catch {
      throw new Error("Le test de vitesse a dépassé le délai. Réessayez.");
    }
    if (res.status === 429)
      throw new Error(
        "Limite de requêtes Google atteinte. Réessayez dans une minute (ou ajoutez une clé PAGESPEED_API_KEY).",
      );
    if (!res.ok)
      throw new Error(
        `Le test de vitesse a échoué (code ${res.status}). Vérifiez que le site est accessible publiquement.`,
      );
    return parseSpeed(await res.json(), data.strategy);
  });

export const traceHeaders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ url: urlSchema }).parse(d))
  .handler(async ({ data }) => {
    const { traceUrl } = await import("./fetch.server");
    return traceUrl(toUrl(data.url).toString());
  });

export const aiReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ domain: urlSchema }).parse(d))
  .handler(async ({ data }) => {
    const { fetchText } = await import("./fetch.server");
    const origin = normalizeDomain(data.domain);
    if (!origin) throw new Error("Domaine invalide.");
    const [robots, llms, llmsFull] = await Promise.all([
      fetchText(`${origin}/robots.txt`),
      fetchText(`${origin}/llms.txt`),
      fetchText(`${origin}/llms-full.txt`),
    ]);
    return {
      origin,
      robotsFound: robots.status === 200,
      bots: botAccess(robots.status === 200 ? robots.text : null),
      llmsTxt: llms.status === 200 && llms.text.trim().length > 0,
      llmsFullTxt: llmsFull.status === 200 && llmsFull.text.trim().length > 0,
    };
  });
