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

export interface Hop {
  url: string;
  status: number;
  location?: string;
  ms: number;
}
export interface Trace {
  hops: Hop[];
  final: { url: string; status: number; headers: Record<string, string>; ms: number } | null;
  error?: string;
}

const HEADERS_OF_INTEREST = [
  "content-type",
  "cache-control",
  "x-robots-tag",
  "strict-transport-security",
  "content-encoding",
  "server",
  "x-frame-options",
  "content-security-policy",
  "link",
  "last-modified",
  "etag",
];

/** Suit les redirections une par une et relève les en-têtes utiles au SEO. */
export async function traceUrl(start: string): Promise<Trace> {
  const hops: Hop[] = [];
  let current = start;
  for (let i = 0; i < 10; i++) {
    const u = new URL(current);
    if (!isSafePublicHost(u.hostname))
      return { hops, final: null, error: "Adresse non autorisée." };
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: "manual",
        headers: { "user-agent": UA },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return { hops, final: null, error: "Site injoignable (délai dépassé ou connexion refusée)." };
    }
    res.body?.cancel().catch(() => {});
    const ms = Date.now() - t0;
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      const next = new URL(loc, current).toString();
      hops.push({ url: current, status: res.status, location: next, ms });
      current = next;
      continue;
    }
    const headers: Record<string, string> = {};
    for (const h of HEADERS_OF_INTEREST) {
      const v = res.headers.get(h);
      if (v) headers[h] = v.slice(0, 300);
    }
    return { hops, final: { url: current, status: res.status, headers, ms } };
  }
  return { hops, final: null, error: "Trop de redirections (boucle probable)." };
}
