import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  BriefSchema,
  IdeasSchema,
  SnippetSchema,
  SYSTEM_EDITOR,
  clip,
  type Brief,
} from "./writing";

const uuid = z.string().uuid();
const lang = z.enum(["fr", "en"]).default("fr");

type Supa = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Contexte du site (pages existantes, mots-clés enregistrés) pour ancrer l'IA dans la réalité du projet. */
async function siteContext(supabase: Supa, projectId?: string) {
  if (!projectId)
    return {
      name: "",
      domain: "",
      pages: [] as { url: string; title: string }[],
      keywords: [] as string[],
    };
  const { data: project } = await supabase
    .from("seo_projects")
    .select("name,domain")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) throw new Error("Projet introuvable.");
  const { data: audit } = await supabase
    .from("seo_audits")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let pages: { url: string; title: string }[] = [];
  if (audit) {
    const { data } = await supabase
      .from("seo_audit_pages")
      .select("url,title,depth")
      .eq("audit_id", audit.id)
      .eq("status_code", 200)
      .not("title", "is", null)
      .order("depth")
      .limit(40);
    pages = (data ?? []).map((p: { url: string; title: string }) => ({
      url: p.url,
      title: p.title,
    }));
  }
  const { data: kws } = await supabase
    .from("seo_keywords")
    .select("keyword")
    .order("created_at", { ascending: false })
    .limit(30);
  return {
    name: project.name as string,
    domain: project.domain as string,
    pages,
    keywords: (kws ?? []).map((k: { keyword: string }) => k.keyword),
  };
}

export const aiStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { aiConfigured } = await import("./ai.server");
    return { configured: aiConfigured() };
  });

export const suggestIdeas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: uuid, topic: z.string().trim().max(200).optional(), lang }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { reserveAiCall, claude, extractJson } = await import("./ai.server");
    const site = await siteContext(context.supabase as Supa, data.projectId);
    await reserveAiCall(context.userId);
    const user = `Site : ${site.name} (${site.domain})
Sujet ou activité à privilégier : ${data.topic || "déduis-le des pages du site"}
Pages existantes du site (à ne pas dupliquer) :
${site.pages.map((p) => `- ${clip(p.title, 90)}`).join("\n") || "(aucune)"}
Mots-clés déjà retenus : ${site.keywords.join(", ") || "(aucun)"}

Propose 8 idées d'articles de blog qui peuvent réellement attirer des clients pour ce site. Varie les intentions (informationnelle, comparaison, achat) et privilégie les requêtes précises et peu concurrentielles (longue traîne). Évite les sujets déjà couverts par les pages existantes.
Langue : ${data.lang === "fr" ? "français" : "anglais"}.
Réponds UNIQUEMENT en JSON : {"ideas":[{"title":"titre accrocheur","keyword":"mot-clé principal exact","intent":"informationnelle|commerciale|transactionnelle","angle":"angle original en une phrase","why":"pourquoi cet article rapportera des visiteurs qualifiés"}]}`;
    const text = await claude({ system: SYSTEM_EDITOR, user, maxTokens: 2500 });
    const parsed = IdeasSchema.safeParse(extractJson(text));
    if (!parsed.success) throw new Error("Réponse de l'IA inexploitable. Réessayez.");
    return parsed.data.ideas;
  });

export const buildBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        keyword: z.string().trim().min(2).max(120),
        projectId: uuid.optional(),
        audience: z.string().trim().max(200).optional(),
        lang,
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<Brief> => {
    const { reserveAiCall, claude, extractJson } = await import("./ai.server");
    const site = await siteContext(context.supabase as Supa, data.projectId);
    // Questions réellement tapées par les internautes (autocomplétion), pour la FAQ et les sous-titres.
    const qs = await Promise.all(
      ["comment", "pourquoi", "quel", "combien"].map(async (p) => {
        try {
          const r = await fetch(
            `https://suggestqueries.google.com/complete/search?client=firefox&hl=${data.lang}&q=${encodeURIComponent(`${p} ${data.keyword}`)}`,
            { signal: AbortSignal.timeout(5000) },
          );
          const j = (await r.json()) as unknown[];
          return Array.isArray(j[1]) ? (j[1] as string[]) : [];
        } catch {
          return [];
        }
      }),
    );
    const questions = [...new Set(qs.flat())].slice(0, 14);
    await reserveAiCall(context.userId);
    const user = `Mot-clé principal : ${data.keyword}
Site : ${site.name || "(non précisé)"} ${site.domain ? `(${site.domain})` : ""}
Public visé : ${data.audience || "déduis-le du sujet"}
Questions réellement recherchées : ${questions.join(" | ") || "(aucune)"}
Pages du site utilisables pour le maillage interne (n'utilise QUE ces URL) :
${site.pages.map((p) => `- ${p.url} — ${clip(p.title, 80)}`).join("\n") || "(aucune)"}

Crée un brief SEO complet pour un article. Le plan doit répondre à l'intention de recherche, couvrir les sous-sujets attendus et se différencier par un angle utile.
Réponds UNIQUEMENT en JSON avec cette structure :
{"titles":["3 titres de 30 à 60 caractères, mot-clé en début"],"meta":"meta description de 120 à 155 caractères avec bénéfice et appel à l'action","slug":"url-courte","intent":"intention de recherche en une phrase","audience":"lecteur visé","targetWords":nombre,"outline":[{"h2":"…","points":["éléments à traiter"],"h3":["sous-parties éventuelles"]}],"faq":[{"q":"question","a":"réponse courte à développer"}],"terms":["termes et entités à couvrir naturellement"],"internalLinks":[{"url":"URL de la liste","anchor":"ancre descriptive"}],"schema":"Article ou FAQPage ou HowTo","experience":["éléments que l'auteur doit apporter depuis son vécu : cas, chiffres, photos, erreurs"]}
Langue : ${data.lang === "fr" ? "français" : "anglais"}.`;
    const text = await claude({ system: SYSTEM_EDITOR, user, maxTokens: 3000 });
    const parsed = BriefSchema.safeParse(extractJson(text));
    if (!parsed.success) throw new Error("Brief inexploitable. Réessayez.");
    const allowed = new Set(site.pages.map((p) => p.url));
    return {
      ...parsed.data,
      internalLinks: parsed.data.internalLinks.filter((l) => allowed.has(l.url)),
    };
  });

export const writeDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        keyword: z.string().trim().min(2).max(120),
        brief: BriefSchema,
        tone: z.string().trim().max(200).optional(),
        notes: z.string().trim().max(1500).optional(),
        lang,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { reserveAiCall, claude } = await import("./ai.server");
    await reserveAiCall(context.userId);
    const b = data.brief;
    const user = `Rédige l'article complet en Markdown à partir de ce brief.
Mot-clé principal : ${data.keyword}
Titre (H1) : ${b.titles[0]}
Intention : ${b.intent}
Lecteur : ${b.audience}
Longueur visée : environ ${b.targetWords} mots
Ton : ${data.tone || "clair, direct, chaleureux, professionnel"}
Notes de l'auteur (à intégrer) : ${data.notes || "(aucune)"}

Plan à suivre :
${b.outline.map((o) => `## ${o.h2}\n${o.points.map((p) => `- ${p}`).join("\n")}${o.h3.length ? `\n(sous-titres : ${o.h3.join(" ; ")})` : ""}`).join("\n\n")}

Termes à couvrir naturellement : ${b.terms.join(", ") || "(libre)"}
FAQ à inclure en fin d'article (section « Questions fréquentes ») : ${b.faq.map((f) => f.q).join(" | ") || "(aucune)"}
Liens internes à placer dans le texte avec une ancre naturelle : ${b.internalLinks.map((l) => `[${l.anchor}](${l.url})`).join(" ; ") || "(aucun)"}
Éléments d'expérience à demander à l'auteur : ${b.experience.join(" ; ") || "(aucun)"}

Consignes : commence par le titre en H1 (#), réponds à la question dès l'introduction, utilise des H2/H3, des listes quand c'est utile, et termine par un court paragraphe d'action. Marque [VOTRE EXPÉRIENCE : …] et [À VÉRIFIER : …] là où c'est nécessaire. Réponds uniquement avec le Markdown de l'article.
Langue : ${data.lang === "fr" ? "français" : "anglais"}.`;
    const text = await claude({ system: SYSTEM_EDITOR, user, maxTokens: 6000, temperature: 0.6 });
    return { markdown: text.trim() };
  });

export const improveSnippet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        keyword: z.string().trim().min(2).max(120),
        title: z.string().max(200).default(""),
        meta: z.string().max(400).default(""),
        lang,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { reserveAiCall, claude, extractJson } = await import("./ai.server");
    await reserveAiCall(context.userId);
    const user = `Mot-clé cible : ${data.keyword}
Title actuel : ${data.title || "(vide)"}
Meta description actuelle : ${data.meta || "(vide)"}

Propose 3 variantes différentes (angles : bénéfice, curiosité/question, preuve ou chiffre sans en inventer). Title de 30 à 60 caractères avec le mot-clé en début, meta de 120 à 155 caractères avec appel à l'action. Pas de majuscules criardes, pas de promesses mensongères.
Réponds UNIQUEMENT en JSON : {"variants":[{"title":"…","meta":"…","angle":"…"}]}
Langue : ${data.lang === "fr" ? "français" : "anglais"}.`;
    const text = await claude({ system: SYSTEM_EDITOR, user, maxTokens: 1200 });
    const parsed = SnippetSchema.safeParse(extractJson(text));
    if (!parsed.success) throw new Error("Réponse de l'IA inexploitable. Réessayez.");
    return parsed.data.variants;
  });
