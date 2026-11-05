import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  analyzePage,
  analyzeSite,
  robotsBlocksAll,
  sitemapFromRobots,
  type PageAnalysis,
} from "./analyze";
import { RULES } from "./rules";
import { healthScore } from "./score";
import { isCrawlableHtmlUrl, normalizeDomain, normalizeUrl } from "./url";

const BATCH = 6; // pages crawlées par appel (limite de sous-requêtes des Workers)

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ name: z.string().trim().min(1).max(100), domain: z.string().trim().max(255) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const origin = normalizeDomain(data.domain);
    if (!origin)
      throw new Error("Domaine invalide (les adresses locales ou IP ne sont pas autorisées).");
    const host = new URL(origin).hostname;
    const { data: row, error } = await context.supabase
      .from("seo_projects")
      .insert({ name: data.name, domain: host, user_id: context.userId })
      .select()
      .single();
    if (error)
      throw new Error(
        error.code === "23505" ? "Ce domaine existe déjà dans vos projets." : error.message,
      );
    return row;
  });

export const startAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        maxPages: z.number().int().min(1).max(500).default(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchText } = await import("./fetch.server");
    // RLS : renvoie null si le projet n'appartient pas à l'utilisateur
    const { data: project } = await context.supabase
      .from("seo_projects")
      .select("*")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project) throw new Error("Projet introuvable.");
    const origin = normalizeDomain(project.domain)!;

    const robots = await fetchText(`${origin}/robots.txt`);
    const sitemapUrls = sitemapFromRobots(robots.text);
    const sitemapCandidates = sitemapUrls.length ? sitemapUrls : [`${origin}/sitemap.xml`];
    let sitemapOk = false;
    const sitemapPages: string[] = [];
    for (const sm of sitemapCandidates.slice(0, 2)) {
      const r = await fetchText(sm);
      if (r.status === 200 && /<(urlset|sitemapindex)/i.test(r.text)) {
        sitemapOk = true;
        for (const m of r.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
          const u = normalizeUrl(m[1], origin);
          if (u && u.startsWith(origin) && isCrawlableHtmlUrl(u)) sitemapPages.push(u);
        }
      }
    }

    const siteInfo = {
      origin,
      robots_found: robots.status === 200,
      robots_blocks_all: robots.status === 200 && robotsBlocksAll(robots.text),
      sitemap_found: sitemapOk,
      sitemap_urls: sitemapPages.length,
    };
    const { data: audit, error } = await supabaseAdmin
      .from("seo_audits")
      .insert({
        project_id: project.id,
        user_id: context.userId,
        max_pages: data.maxPages,
        site_info: siteInfo,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const seeds = [...new Set([normalizeUrl(origin, origin)!, ...sitemapPages])].slice(
      0,
      data.maxPages,
    );
    await supabaseAdmin
      .from("seo_audit_pages")
      .insert(seeds.map((url) => ({ audit_id: audit.id, user_id: context.userId, url, depth: 0 })));
    return { auditId: audit.id };
  });

export const crawlStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ auditId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchPage } = await import("./fetch.server");
    const { data: audit } = await context.supabase
      .from("seo_audits")
      .select("*")
      .eq("id", data.auditId)
      .maybeSingle();
    if (!audit) throw new Error("Audit introuvable.");
    if (audit.status !== "running")
      return {
        done: true,
        crawled: audit.pages_crawled,
        discovered: audit.pages_crawled,
        score: audit.health_score,
      };

    const { data: pending } = await supabaseAdmin
      .from("seo_audit_pages")
      .select("id,url")
      .eq("audit_id", audit.id)
      .eq("crawled", false)
      .limit(BATCH);

    // Marque les pages "prises" avant de crawler (évite le double traitement)
    if (pending?.length) {
      const results = await Promise.all(
        pending.map(async (row) => ({ row, a: analyzePage(await fetchPage(row.url)) })),
      );
      const { count: known } = await supabaseAdmin
        .from("seo_audit_pages")
        .select("id", { count: "exact", head: true })
        .eq("audit_id", audit.id);
      const room = Math.max(0, audit.max_pages - (known ?? 0));

      const discovered = new Map<string, number>();
      for (const { row, a } of results) {
        await supabaseAdmin
          .from("seo_audit_pages")
          .update({
            crawled: true,
            status_code: a.status,
            depth: a.depth,
            title: a.title,
            meta_description: a.metaDescription,
            h1_count: a.h1.length,
            word_count: a.wordCount,
            canonical: a.canonical,
            noindex: a.noindex,
            response_ms: a.responseMs,
            internal_links: a.internalLinks as never,
            data: { ...a, internalLinks: undefined } as never,
          })
          .eq("id", row.id);
        for (const l of a.internalLinks) if (!discovered.has(l)) discovered.set(l, a.depth + 1);
      }
      if (room > 0 && discovered.size) {
        const urls = [...discovered.keys()];
        const { data: existing } = await supabaseAdmin
          .from("seo_audit_pages")
          .select("url")
          .eq("audit_id", audit.id)
          .in("url", urls);
        const have = new Set((existing ?? []).map((e) => e.url));
        const fresh = urls.filter((u) => !have.has(u)).slice(0, room);
        if (fresh.length)
          await supabaseAdmin.from("seo_audit_pages").upsert(
            fresh.map((url) => ({
              audit_id: audit.id,
              user_id: audit.user_id,
              url,
              depth: discovered.get(url)!,
            })),
            { onConflict: "audit_id,url", ignoreDuplicates: true },
          );
      }
    }

    const { count: left } = await supabaseAdmin
      .from("seo_audit_pages")
      .select("id", { count: "exact", head: true })
      .eq("audit_id", audit.id)
      .eq("crawled", false);
    const { count: crawled } = await supabaseAdmin
      .from("seo_audit_pages")
      .select("id", { count: "exact", head: true })
      .eq("audit_id", audit.id)
      .eq("crawled", true);
    await supabaseAdmin
      .from("seo_audits")
      .update({ pages_crawled: crawled ?? 0 })
      .eq("id", audit.id);

    if ((left ?? 0) > 0)
      return {
        done: false,
        crawled: crawled ?? 0,
        discovered: (crawled ?? 0) + (left ?? 0),
        score: null,
      };
    const score = await finalize(
      audit.id,
      audit.user_id,
      audit.site_info as Record<string, unknown>,
    );
    return { done: true, crawled: crawled ?? 0, discovered: crawled ?? 0, score };
  });

async function finalize(
  auditId: string,
  userId: string,
  siteInfo: Record<string, unknown>,
): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await supabaseAdmin
    .from("seo_audit_pages")
    .select("url,data,internal_links,status_code,title,meta_description")
    .eq("audit_id", auditId);
  const pages: PageAnalysis[] = (rows ?? []).map((r) => ({
    ...(r.data as unknown as PageAnalysis),
    url: r.url,
    status: r.status_code ?? 0,
    title: r.title,
    metaDescription: r.meta_description,
    internalLinks: (r.internal_links as string[]) ?? [],
  }));
  const found: { code: string; url: string; detail?: string }[] = [];
  for (const p of pages) for (const code of p.issues ?? []) found.push({ code, url: p.url });
  const home = (siteInfo.origin as string) ?? pages[0]?.url ?? "";
  found.push(...analyzeSite(pages, home));
  if (!siteInfo.robots_found) found.push({ code: "robots_missing", url: `${home}/robots.txt` });
  if (siteInfo.robots_blocks_all)
    found.push({ code: "robots_blocks_all", url: `${home}/robots.txt` });
  if (!siteInfo.sitemap_found) found.push({ code: "sitemap_missing", url: `${home}/sitemap.xml` });

  const counts: Record<string, number> = {};
  const seen = new Set<string>();
  for (const f of found) {
    const k = `${f.code}|${f.url}`;
    if (seen.has(k) && !f.detail) continue;
    seen.add(k);
    counts[f.code] = (counts[f.code] ?? 0) + 1;
  }
  const rows2 = found
    .filter((f) => RULES[f.code])
    .map((f) => ({
      audit_id: auditId,
      user_id: userId,
      url: f.url,
      code: f.code,
      severity: RULES[f.code].severity,
      detail: f.detail ?? null,
    }));
  for (let i = 0; i < rows2.length; i += 500)
    await supabaseAdmin.from("seo_audit_issues").insert(rows2.slice(i, i + 500));

  const score = healthScore(counts, pages.length);
  await supabaseAdmin
    .from("seo_audits")
    .update({
      status: "completed",
      health_score: score,
      issue_counts: counts,
      finished_at: new Date().toISOString(),
    })
    .eq("id", auditId);
  return score;
}
