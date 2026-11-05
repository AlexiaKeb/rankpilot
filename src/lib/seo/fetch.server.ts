import type { FetchedPage } from "./analyze";
import { isSafePublicHost, sameSite } from "./url";

const UA = "RankPilotBot/1.0 (+https://rankpilot.app/bot)";
const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 5;

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.length;
  }
  reader.cancel().catch(() => {});
  const buf = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    buf.set(c, o);
    o += c.length;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

/** Récupère une URL en suivant les redirections à la main (même site uniquement, SSRF-safe). */
export async function fetchPage(url: string, timeoutMs = 10_000): Promise<FetchedPage> {
  const started = Date.now();
  let current = url;
  let redirected = false;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const u = new URL(current);
      if (!isSafePublicHost(u.hostname)) throw new Error("hôte non autorisé");
      const res = await fetch(current, {
        redirect: "manual",
        headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*;q=0.5" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        const next = new URL(res.headers.get("location")!, current).toString();
        redirected = true;
        if (!sameSite(next, url) || hop === MAX_REDIRECTS) {
          return {
            url,
            finalUrl: current,
            status: res.status,
            contentType: "",
            html: "",
            responseMs: Date.now() - started,
            redirected,
          };
        }
        current = next;
        continue;
      }
      const contentType = res.headers.get("content-type") ?? "";
      const html = /html|xml|text/i.test(contentType) ? await readCapped(res) : "";
      if (!html) res.body?.cancel().catch(() => {});
      return {
        url,
        finalUrl: current,
        status: res.status,
        contentType,
        html,
        responseMs: Date.now() - started,
        redirected,
        xRobotsTag: res.headers.get("x-robots-tag") ?? undefined,
      };
    }
  } catch {
    /* tombe sur fetch_failed */
  }
  return {
    url,
    finalUrl: url,
    status: 0,
    contentType: "",
    html: "",
    responseMs: Date.now() - started,
    redirected,
  };
}

export async function fetchText(url: string): Promise<{ status: number; text: string }> {
  try {
    if (!isSafePublicHost(new URL(url).hostname)) return { status: 0, text: "" };
    const res = await fetch(url, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(8_000),
      redirect: "follow",
    });
    return { status: res.status, text: res.ok ? await readCapped(res) : "" };
  } catch {
    return { status: 0, text: "" };
  }
}
