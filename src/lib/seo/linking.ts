import { significantTokens } from "./keywords";

export interface LinkPage {
  url: string;
  title: string | null;
  h1?: string | null;
  internalLinks: string[];
  status: number;
  noindex?: boolean | null;
}

export interface LinkSuggestion {
  target: { url: string; title: string };
  inbound: number;
  from: { url: string; title: string; score: number }[];
}

const textOf = (p: LinkPage) => `${p.title ?? ""} ${p.h1 ?? ""}`;

function overlap(a: string[], b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

/**
 * Pour chaque page peu liée (≤ maxInbound liens entrants), propose les pages les plus proches
 * thématiquement (mots communs du title/H1) comme sources de liens internes.
 */
export function suggestInternalLinks(
  pages: LinkPage[],
  home: string,
  maxInbound = 1,
  perTarget = 3,
): LinkSuggestion[] {
  const ok = pages.filter((p) => p.status >= 200 && p.status < 300 && !p.noindex && p.title);
  const inbound = new Map<string, number>();
  for (const p of pages)
    for (const l of new Set(p.internalLinks))
      if (l !== p.url) inbound.set(l, (inbound.get(l) ?? 0) + 1);
  const linkSet = new Map(pages.map((p) => [p.url, new Set(p.internalLinks)]));
  const tokens = new Map(ok.map((p) => [p.url, significantTokens(textOf(p))]));

  const out: LinkSuggestion[] = [];
  for (const target of ok) {
    if (target.url === home) continue;
    const count = inbound.get(target.url) ?? 0;
    if (count > maxInbound) continue;
    const tt = new Set(tokens.get(target.url) ?? []);
    if (!tt.size) continue;
    const from = ok
      .filter((s) => s.url !== target.url && !linkSet.get(s.url)?.has(target.url))
      .map((s) => ({ url: s.url, title: s.title!, score: overlap(tokens.get(s.url) ?? [], tt) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, perTarget);
    if (from.length)
      out.push({ target: { url: target.url, title: target.title! }, inbound: count, from });
  }
  return out.sort((a, b) => a.inbound - b.inbound || b.from[0].score - a.from[0].score);
}
