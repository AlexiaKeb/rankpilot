import { describe, expect, it } from "vitest";
import { analyzePage, analyzeSite, robotsBlocksAll, type FetchedPage } from "./analyze";
import { healthScore } from "./score";
import { isSafePublicHost, normalizeDomain, normalizeUrl } from "./url";

const page = (html: string, over: Partial<FetchedPage> = {}): FetchedPage => ({
  url: "https://ex.com/a",
  finalUrl: "https://ex.com/a",
  status: 200,
  contentType: "text/html",
  html,
  responseMs: 200,
  redirected: false,
  ...over,
});

const good = `<html lang="fr"><head><title>Un titre de page vraiment bien optimisé SEO</title>
<meta name="description" content="${"d".repeat(100)}"><meta name="viewport" content="width=device-width">
<link rel="canonical" href="https://ex.com/a"><script type="application/ld+json">{"@type":"Article"}</script></head>
<body><h1>Sujet</h1><p>${"mot ".repeat(400)}</p><img src="x.jpg" alt="x"><a href="/b">b</a><a href="https://other.com">o</a></body></html>`;

describe("url", () => {
  it("bloque SSRF", () => {
    for (const h of [
      "localhost",
      "127.0.0.1",
      "10.0.0.5",
      "192.168.1.1",
      "169.254.169.254",
      "intranet",
      "a.internal",
      "[::1]",
    ])
      expect(isSafePublicHost(h)).toBe(false);
    expect(isSafePublicHost("example.com")).toBe(true);
  });
  it("normalise domaine et url", () => {
    expect(normalizeDomain("Example.com/path")).toBe("https://example.com");
    expect(normalizeDomain("http://127.0.0.1")).toBeNull();
    expect(normalizeUrl("/p/?utm_source=x&b=1#h", "https://ex.com")).toBe("https://ex.com/p?b=1");
  });
});

describe("analyzePage", () => {
  it("page saine = aucune issue", () => {
    const a = analyzePage(page(good));
    expect(a.issues).toEqual([]);
    expect(a.internalLinks).toEqual(["https://ex.com/b"]);
    expect(a.externalLinkCount).toBe(1);
    expect(a.jsonLdTypes).toEqual(["Article"]);
  });
  it("détecte les défauts on-page", () => {
    const a = analyzePage(
      page("<html><head></head><body><h1>a</h1><h1>b</h1><img src=x></body></html>"),
    );
    for (const c of [
      "title_missing",
      "meta_missing",
      "lang_missing",
      "viewport_missing",
      "canonical_missing",
      "h1_multiple",
      "img_alt_missing",
      "thin_content",
      "jsonld_missing",
    ])
      expect(a.issues).toContain(c);
  });
  it("noindex via meta et en-tête, 404, redirection, JSON-LD invalide", () => {
    expect(
      analyzePage(page(good.replace("<head>", '<head><meta name="robots" content="noindex">')))
        .issues,
    ).toContain("noindex");
    expect(analyzePage(page(good, { xRobotsTag: "noindex" })).issues).toContain("noindex");
    expect(analyzePage(page("", { status: 404, contentType: "text/html" })).issues).toEqual([
      "http_4xx",
    ]);
    expect(analyzePage(page(good, { redirected: true })).issues).toContain("redirect_chain");
    expect(analyzePage(page(good.replace('{"@type":"Article"}', "{oops"))).issues).toContain(
      "jsonld_invalid",
    );
  });
});

describe("analyzeSite", () => {
  it("doublons, orphelines, liens cassés", () => {
    const base = analyzePage(page(good));
    const mk = (url: string, links: string[], over = {}) => ({
      ...base,
      url,
      internalLinks: links,
      ...over,
    });
    const pages = [
      mk("https://ex.com", ["https://ex.com/a", "https://ex.com/dead"]),
      mk("https://ex.com/a", []),
      mk("https://ex.com/b", []),
      mk("https://ex.com/dead", [], { status: 404 }),
    ];
    const codes = analyzeSite(pages, "https://ex.com").map((i) => `${i.code}:${i.url}`);
    expect(codes).toContain("orphan_page:https://ex.com/b");
    expect(codes).not.toContain("orphan_page:https://ex.com/a");
    expect(codes).toContain("broken_link:https://ex.com");
    expect(codes.filter((c) => c.startsWith("title_duplicate")).length).toBe(3); // accueil, a, b (le 404 est exclu)
  });
});

describe("robots & score", () => {
  it("robots", () => {
    expect(robotsBlocksAll("User-agent: *\nDisallow: /")).toBe(true);
    expect(robotsBlocksAll("User-agent: *\nDisallow: /admin")).toBe(false);
    expect(robotsBlocksAll("User-agent: bot\nDisallow: /")).toBe(false);
  });
  it("score borné et monotone", () => {
    expect(healthScore({}, 10)).toBe(100);
    const mild = healthScore({ title_short: 3 }, 10);
    const bad = healthScore({ http_4xx: 5, title_missing: 10 }, 10);
    expect(mild).toBeGreaterThan(bad);
    expect(
      healthScore({ http_4xx: 10, title_missing: 10, http_5xx: 10, not_https: 10 }, 10),
    ).toBeLessThan(20);
  });
});
