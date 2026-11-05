import { parse } from "node-html-parser";
import { RULES, THRESHOLDS } from "./rules";
import { isCrawlableHtmlUrl, normalizeUrl, sameSite, urlDepth } from "./url";

export interface FetchedPage {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  html: string;
  responseMs: number;
  redirected: boolean;
  xRobotsTag?: string;
}

export interface PageAnalysis {
  url: string;
  status: number;
  depth: number;
  title: string | null;
  metaDescription: string | null;
  h1: string[];
  canonical: string | null;
  noindex: boolean;
  wordCount: number;
  imagesTotal: number;
  imagesMissingAlt: number;
  internalLinks: string[];
  externalLinkCount: number;
  responseMs: number;
  htmlBytes: number;
  lang: string | null;
  hasViewport: boolean;
  jsonLdTypes: string[];
  jsonLdInvalid: number;
  mixedContent: boolean;
  issues: string[]; // codes de règles propres à la page
}

const txt = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim();

export function analyzePage(page: FetchedPage): PageAnalysis {
  const out: PageAnalysis = {
    url: page.url,
    status: page.status,
    depth: urlDepth(page.url),
    title: null,
    metaDescription: null,
    h1: [],
    canonical: null,
    noindex: false,
    wordCount: 0,
    imagesTotal: 0,
    imagesMissingAlt: 0,
    internalLinks: [],
    externalLinkCount: 0,
    responseMs: page.responseMs,
    htmlBytes: page.html.length,
    lang: null,
    hasViewport: false,
    jsonLdTypes: [],
    jsonLdInvalid: 0,
    mixedContent: false,
    issues: [],
  };
  const issues = new Set<string>();

  if (page.url.startsWith("http://")) issues.add("not_https");
  if (page.status >= 500) issues.add("http_5xx");
  else if (page.status >= 400) issues.add("http_4xx");
  else if (page.status === 0) issues.add("fetch_failed");
  if (page.redirected) issues.add("redirect_chain");
  if (page.responseMs > THRESHOLDS.slowResponseMs) issues.add("slow_response");
  if (out.depth > THRESHOLDS.maxDepth) issues.add("deep_page");
  if (page.url.length > THRESHOLDS.maxUrlLength) issues.add("url_too_long");

  const isHtml = page.status >= 200 && page.status < 300 && /html/i.test(page.contentType);
  if (!isHtml) {
    out.issues = [...issues];
    return out;
  }

  if (page.html.length > THRESHOLDS.maxHtmlBytes) issues.add("large_html");
  const root = parse(page.html);

  out.lang = root.querySelector("html")?.getAttribute("lang") ?? null;
  if (!out.lang) issues.add("lang_missing");

  out.title = txt(root.querySelector("title")?.text) || null;
  if (!out.title) issues.add("title_missing");
  else if (out.title.length < THRESHOLDS.titleMin) issues.add("title_short");
  else if (out.title.length > THRESHOLDS.titleMax) issues.add("title_long");

  const metaTag = (name: string) =>
    root.querySelectorAll("meta").find((m) => m.getAttribute("name")?.toLowerCase() === name);
  out.metaDescription = txt(metaTag("description")?.getAttribute("content")) || null;
  if (!out.metaDescription) issues.add("meta_missing");
  else if (out.metaDescription.length > THRESHOLDS.metaMax) issues.add("meta_long");

  out.hasViewport = !!metaTag("viewport");
  if (!out.hasViewport) issues.add("viewport_missing");

  const robots =
    `${metaTag("robots")?.getAttribute("content") ?? ""},${page.xRobotsTag ?? ""}`.toLowerCase();
  out.noindex = /noindex|none/.test(robots);
  if (out.noindex) issues.add("noindex");

  const canon = root
    .querySelectorAll("link")
    .find((l) => l.getAttribute("rel")?.toLowerCase() === "canonical");
  const canonHref = canon?.getAttribute("href");
  out.canonical = canonHref ? normalizeUrl(canonHref, page.finalUrl) : null;
  if (!out.canonical) issues.add("canonical_missing");
  else if (out.canonical !== normalizeUrl(page.finalUrl, page.finalUrl))
    issues.add("canonical_other");

  out.h1 = root
    .querySelectorAll("h1")
    .map((h) => txt(h.text))
    .filter(Boolean);
  if (out.h1.length === 0) issues.add("h1_missing");
  else if (out.h1.length > 1) issues.add("h1_multiple");

  const imgs = root.querySelectorAll("img");
  out.imagesTotal = imgs.length;
  out.imagesMissingAlt = imgs.filter((i) => i.getAttribute("alt") === undefined).length;
  if (out.imagesMissingAlt > 0) issues.add("img_alt_missing");

  // Texte visible approximatif (sans scripts/styles/nav/footer)
  const body = root.querySelector("body");
  if (body) {
    for (const el of body.querySelectorAll("script, style, noscript, nav, footer, header"))
      el.remove();
    out.wordCount = txt(body.text).split(" ").filter(Boolean).length;
  }
  if (out.wordCount < THRESHOLDS.thinContentWords) issues.add("thin_content");

  // JSON-LD
  const ld = root
    .querySelectorAll("script")
    .filter((s) => s.getAttribute("type") === "application/ld+json");
  for (const s of ld) {
    try {
      const data = JSON.parse(s.rawText);
      const collect = (n: unknown) => {
        if (Array.isArray(n)) return n.forEach(collect);
        if (n && typeof n === "object") {
          const o = n as Record<string, unknown>;
          const t = o["@type"];
          if (typeof t === "string") out.jsonLdTypes.push(t);
          else if (Array.isArray(t))
            out.jsonLdTypes.push(...t.filter((x): x is string => typeof x === "string"));
          if (o["@graph"]) collect(o["@graph"]);
        }
      };
      collect(data);
    } catch {
      out.jsonLdInvalid++;
    }
  }
  if (out.jsonLdInvalid > 0) issues.add("jsonld_invalid");
  else if (ld.length === 0) issues.add("jsonld_missing");

  // Liens
  const links = new Set<string>();
  let external = 0;
  for (const a of root.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") ?? "";
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    const abs = normalizeUrl(href, page.finalUrl);
    if (!abs) continue;
    if (sameSite(abs, page.finalUrl)) {
      if (isCrawlableHtmlUrl(abs) && !/\bnofollow\b/i.test(a.getAttribute("rel") ?? ""))
        links.add(abs);
    } else external++;
  }
  out.internalLinks = [...links];
  out.externalLinkCount = external;
  if (links.size + external > THRESHOLDS.maxLinksPerPage) issues.add("too_many_links");

  if (page.finalUrl.startsWith("https://")) {
    out.mixedContent = root
      .querySelectorAll("img[src], script[src], link[href][rel=stylesheet], iframe[src]")
      .some((e) => /^http:\/\//i.test(e.getAttribute("src") ?? e.getAttribute("href") ?? ""));
    if (out.mixedContent) issues.add("mixed_content");
  }

  out.issues = [...issues];
  return out;
}

export interface SiteIssue {
  code: string;
  url: string;
  detail?: string;
}

/** Règles qui nécessitent la vue d'ensemble du site (doublons, orphelines, liens cassés). */
export function analyzeSite(pages: PageAnalysis[], homepage: string): SiteIssue[] {
  const out: SiteIssue[] = [];
  const ok = pages.filter((p) => p.status >= 200 && p.status < 300);
  const group = (key: (p: PageAnalysis) => string | null, code: string) => {
    const map = new Map<string, PageAnalysis[]>();
    for (const p of ok) {
      const k = key(p);
      if (!k) continue;
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    for (const [k, list] of map)
      if (list.length > 1)
        for (const p of list) out.push({ code, url: p.url, detail: k.slice(0, 80) });
  };
  group((p) => p.title?.toLowerCase() ?? null, "title_duplicate");
  group((p) => p.metaDescription?.toLowerCase() ?? null, "meta_duplicate");

  const linked = new Set<string>();
  for (const p of pages) for (const l of p.internalLinks) if (l !== p.url) linked.add(l);
  const home = normalizeUrl(homepage, homepage);
  for (const p of ok)
    if (p.url !== home && !linked.has(p.url)) out.push({ code: "orphan_page", url: p.url });

  const broken = new Set(pages.filter((p) => p.status >= 400 || p.status === 0).map((p) => p.url));
  for (const p of pages) {
    for (const l of p.internalLinks) {
      if (broken.has(l)) out.push({ code: "broken_link", url: p.url, detail: l });
    }
  }
  return out;
}

export function robotsBlocksAll(robotsTxt: string): boolean {
  let applies = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [k, v] = [m[1].toLowerCase(), m[2].trim()];
    if (k === "user-agent") applies = v === "*";
    else if (applies && k === "disallow" && v === "/") return true;
  }
  return false;
}

export function sitemapFromRobots(robotsTxt: string): string[] {
  return [...robotsTxt.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]);
}

export function severityOf(code: string) {
  return RULES[code]?.severity ?? "notice";
}
