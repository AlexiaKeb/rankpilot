import { gfm } from "@joplin/turndown-plugin-gfm";
import TurndownService from "turndown";

/** HTML de l'éditeur vers Markdown (export). Tableaux et barré inclus. */
export function htmlToMarkdown(html: string): string {
  const td = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  });
  td.use(gfm);
  return td.turndown(html).trim();
}
