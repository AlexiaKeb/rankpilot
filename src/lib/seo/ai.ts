// Préparation aux moteurs de réponse IA : accès des robots (robots.txt) et fichier llms.txt.

export interface AiBot {
  ua: string;
  vendor: string;
  purpose: "recherche" | "entraînement" | "requête utilisateur";
}

// Agents officiels publiés par les éditeurs (à revérifier périodiquement : ils évoluent).
export const AI_BOTS: AiBot[] = [
  { ua: "OAI-SearchBot", vendor: "OpenAI (ChatGPT Search)", purpose: "recherche" },
  { ua: "ChatGPT-User", vendor: "OpenAI (ChatGPT)", purpose: "requête utilisateur" },
  { ua: "GPTBot", vendor: "OpenAI", purpose: "entraînement" },
  { ua: "Claude-SearchBot", vendor: "Anthropic (Claude)", purpose: "recherche" },
  { ua: "Claude-User", vendor: "Anthropic (Claude)", purpose: "requête utilisateur" },
  { ua: "ClaudeBot", vendor: "Anthropic", purpose: "entraînement" },
  { ua: "PerplexityBot", vendor: "Perplexity", purpose: "recherche" },
  { ua: "Perplexity-User", vendor: "Perplexity", purpose: "requête utilisateur" },
  { ua: "Google-Extended", vendor: "Google (Gemini)", purpose: "entraînement" },
  { ua: "Applebot-Extended", vendor: "Apple", purpose: "entraînement" },
  { ua: "CCBot", vendor: "Common Crawl", purpose: "entraînement" },
];

interface Group {
  agents: string[];
  rules: { allow: boolean; path: string }[];
}

export function parseRobots(txt: string): Group[] {
  const groups: Group[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && cur) {
      cur.rules.push({ allow: key === "allow", path: val });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function matches(pattern: string, path: string): boolean {
  if (!pattern) return false;
  const re = new RegExp(
    "^" +
      pattern
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\\\$$/, "$"),
  );
  return re.test(path);
}

/** Un robot peut-il accéder à `path` ? Le groupe le plus spécifique gagne, puis la règle la plus longue. */
export function isAllowed(groups: Group[], ua: string, path = "/"): boolean {
  const name = ua.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && name.includes(a)));
  const pool = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  if (!pool.length) return true;
  let best: { allow: boolean; len: number } | null = null;
  for (const g of pool)
    for (const r of g.rules) {
      if (!r.path && !r.allow) continue; // "Disallow:" vide = tout autorisé
      if (
        matches(r.path, path) &&
        (!best || r.path.length > best.len || (r.path.length === best.len && r.allow))
      )
        best = { allow: r.allow, len: r.path.length };
    }
  return best ? best.allow : true;
}

export function botAccess(robotsTxt: string | null) {
  const groups = robotsTxt ? parseRobots(robotsTxt) : [];
  return AI_BOTS.map((b) => ({ ...b, allowed: isAllowed(groups, b.ua) }));
}

export interface LlmsPage {
  url: string;
  title: string | null;
  description: string | null;
}

/** Génère un llms.txt (format proposé par llmstxt.org) à partir des pages indexables d'un audit. */
export function buildLlmsTxt(
  site: { name: string; summary: string },
  pages: LlmsPage[],
  limit = 40,
): string {
  const items = pages
    .filter((p) => p.title)
    .slice(0, limit)
    .map(
      (p) =>
        `- [${p.title!.replace(/[[\]]/g, "")}](${p.url})${p.description ? `: ${p.description.replace(/\s+/g, " ").slice(0, 160)}` : ""}`,
    );
  return [
    `# ${site.name}`,
    "",
    `> ${site.summary || "Décrivez ici votre site en une ou deux phrases."}`,
    "",
    "## Pages principales",
    "",
    ...items,
    "",
  ].join("\n");
}
