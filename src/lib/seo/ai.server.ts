import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY;
const DAILY_LIMIT = () => Number(process.env.AI_DAILY_LIMIT) || 40;

/** Réserve un appel IA pour l'utilisateur (limite quotidienne). Lève une erreur claire si dépassée. */
export async function reserveAiCall(userId: string) {
  if (!aiConfigured())
    throw new Error(
      "L'IA n'est pas encore activée sur ce serveur (clé ANTHROPIC_API_KEY manquante).",
    );
  const { data, error } = await supabaseAdmin.rpc("consume_ai_call", {
    _user: userId,
    _limit: DAILY_LIMIT(),
  });
  if (error) throw new Error("Vérification du quota impossible. Réessayez.");
  if (!data)
    throw new Error(
      `Limite quotidienne atteinte (${DAILY_LIMIT()} générations par jour). Revenez demain.`,
    );
}

export async function claude(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: opts.maxTokens ?? 2000,
      temperature: opts.temperature ?? 0.7,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }),
    signal: AbortSignal.timeout(100_000),
  }).catch(() => null);
  if (!res) throw new Error("L'IA n'a pas répondu à temps. Réessayez.");
  if (res.status === 401)
    throw new Error("Clé ANTHROPIC_API_KEY refusée : vérifiez-la dans les secrets du Worker.");
  if (res.status === 429 || res.status === 529)
    throw new Error("L'IA est saturée. Réessayez dans une minute.");
  if (!res.ok) throw new Error(`La génération a échoué (code ${res.status}).`);
  const json = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text =
    json.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("") ?? "";
  if (!text.trim()) throw new Error("L'IA a renvoyé une réponse vide. Réessayez.");
  return text;
}

export { extractJson } from "./writing";
