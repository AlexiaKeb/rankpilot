import { z } from "zod";

// Formats de sortie attendus de l'IA, validés avant d'être affichés.
export const IdeaSchema = z.object({
  title: z.string().max(200),
  keyword: z.string().max(120),
  intent: z.string().max(40).default("informationnelle"),
  angle: z.string().max(400).default(""),
  why: z.string().max(400).default(""),
});
export const IdeasSchema = z.object({ ideas: z.array(IdeaSchema).min(1).max(12) });
export type Idea = z.infer<typeof IdeaSchema>;

export const BriefSchema = z.object({
  titles: z.array(z.string().max(200)).min(1).max(5),
  meta: z.string().max(300),
  slug: z.string().max(120).default(""),
  intent: z.string().max(200).default(""),
  audience: z.string().max(200).default(""),
  targetWords: z.number().int().min(300).max(5000).default(1200),
  outline: z
    .array(
      z.object({
        h2: z.string().max(200),
        points: z.array(z.string().max(300)).max(8).default([]),
        h3: z.array(z.string().max(200)).max(6).default([]),
      }),
    )
    .min(2)
    .max(12),
  faq: z
    .array(z.object({ q: z.string().max(250), a: z.string().max(500).default("") }))
    .max(8)
    .default([]),
  terms: z.array(z.string().max(80)).max(25).default([]),
  internalLinks: z
    .array(z.object({ url: z.string().max(500), anchor: z.string().max(120) }))
    .max(8)
    .default([]),
  schema: z.string().max(60).default("Article"),
  experience: z.array(z.string().max(300)).max(8).default([]),
});
export type Brief = z.infer<typeof BriefSchema>;

export const SnippetSchema = z.object({
  variants: z
    .array(
      z.object({
        title: z.string().max(120),
        meta: z.string().max(260),
        angle: z.string().max(120).default(""),
      }),
    )
    .min(1)
    .max(5),
});

export const SYSTEM_EDITOR = `Tu es un rédacteur-expert SEO francophone qui travaille pour des entrepreneurs.
Règles absolues :
- Tu n'inventes JAMAIS de statistiques, de prix, de sources, de citations ou de témoignages. Si une donnée précise est nécessaire, écris [À VÉRIFIER : …] ou [VOTRE DONNÉE : …].
- Tu écris pour des humains d'abord : phrases courtes, exemples concrets, ton direct, zéro remplissage, pas de répétition du mot-clé forcée.
- Tu réponds à l'intention de recherche dès les premières lignes.
- Tu laisses des emplacements [VOTRE EXPÉRIENCE : …] là où le vécu de l'auteur apporte de la valeur (preuve d'expertise).
- Tu n'inventes aucune URL : les liens internes ne viennent que de la liste fournie.`;

export const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

/** Extrait un objet/tableau JSON d'une réponse, même entourée de texte ou de ```json. */
export function extractJson(text: string): unknown {
  const clean = text.replace(/```(?:json)?/gi, "");
  const starts = [clean.indexOf("{"), clean.indexOf("[")].filter((i) => i >= 0);
  if (!starts.length) throw new Error("Réponse de l'IA illisible. Réessayez.");
  const start = Math.min(...starts);
  const end = Math.max(clean.lastIndexOf("}"), clean.lastIndexOf("]"));
  try {
    return JSON.parse(clean.slice(start, end + 1));
  } catch {
    throw new Error("Réponse de l'IA illisible. Réessayez.");
  }
}
