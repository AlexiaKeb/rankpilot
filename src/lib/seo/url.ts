// Utilitaires d'URL pour le crawler : normalisation + protection SSRF.

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i;

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

/** Refuse les hôtes locaux / privés / IP littérales pour éviter le SSRF. */
export function isSafePublicHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h.includes(".") && !h.includes(":")) return false; // "localhost", "intranet"
  if (PRIVATE_HOST.test(h)) return false;
  if (h.includes(":")) return false; // IPv6 littérale
  if (isPrivateIPv4(h)) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return false; // toute IP littérale
  return true;
}

/** Normalise un domaine saisi par l'utilisateur en origine https://host. */
export function normalizeDomain(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!isSafePublicHost(u.hostname)) return null;
    return `${u.protocol}//${u.hostname.toLowerCase()}`;
  } catch {
    return null;
  }
}

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|msclkid|mc_|_hs)/i;

/** URL canonique de crawl : sans hash, sans tracking, sans slash final (hors racine). */
export function normalizeUrl(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k);
    }
    u.searchParams.sort();
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return null;
  }
}

export function sameSite(a: string, b: string): boolean {
  const strip = (h: string) => h.replace(/^www\./, "");
  try {
    return strip(new URL(a).hostname) === strip(new URL(b).hostname);
  } catch {
    return false;
  }
}

const SKIP_EXT =
  /\.(jpe?g|png|gif|webp|avif|svg|ico|pdf|zip|gz|rar|mp[34]|mov|avi|css|js|json|xml|woff2?|ttf|eot|docx?|xlsx?|pptx?)$/i;

export function isCrawlableHtmlUrl(url: string): boolean {
  try {
    return !SKIP_EXT.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

export function urlDepth(url: string): number {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).length;
  } catch {
    return 0;
  }
}
