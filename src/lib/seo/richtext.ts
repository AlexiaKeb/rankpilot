import { mdToHtml } from "./markdown";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Les anciens articles sont en Markdown, les nouveaux en HTML : l'éditeur travaille toujours en HTML. */
export function normalizeContent(content: string): string {
  const t = content.trim();
  if (!t) return "";
  return /^<(h[1-6]|p|ul|ol|div|table|blockquote|figure|img)[\s>]/i.test(t) ? t : mdToHtml(t);
}

/** Page HTML complète pour l'analyse SEO : title et meta viennent des champs dédiés. */
export function htmlToPage(opts: { title: string; meta: string; html: string }): string {
  const hasH1 = /<h1[\s>]/i.test(opts.html);
  return `<html lang="fr"><head><title>${esc(opts.title)}</title><meta name="description" content="${esc(opts.meta).replace(/"/g, "&quot;")}"><meta name="viewport" content="width=device-width"></head><body>${hasH1 ? "" : `<h1>${esc(opts.title)}</h1>`}${opts.html}</body></html>`;
}

/** Nombre de passages [VOTRE EXPÉRIENCE : …] / [À VÉRIFIER : …] encore à compléter. */
export function countTodos(html: string): number {
  return (html.match(/\[(VOTRE EXPÉRIENCE|VOTRE DONNÉE|À VÉRIFIER)[^\]]*\]/g) ?? []).length;
}
