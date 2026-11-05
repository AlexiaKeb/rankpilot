import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { findOpportunities, movers, periods, pctChange } from "./gsc";

const uuid = z.string().uuid();

async function tokenFor(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { accessTokenFrom } = await import("./gsc.server");
  const { data } = await supabaseAdmin
    .from("seo_google_connections")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Search Console non connectée.");
  return accessTokenFrom(data.refresh_token);
}

export const gscStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { googleEnv } = await import("./gsc.server");
    const { data } = await supabaseAdmin
      .from("seo_google_connections")
      .select("user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { configured: !!googleEnv(), connected: !!data };
  });

export const startGoogleConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { googleEnv } = await import("./gsc.server");
    const env = googleEnv();
    if (!env)
      throw new Error(
        "La connexion Google n'est pas encore configurée sur ce serveur (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).",
      );
    const { data: project } = await context.supabase
      .from("seo_projects")
      .select("id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project) throw new Error("Projet introuvable.");
    const nonce = crypto.randomUUID() + crypto.randomUUID();
    await supabaseAdmin
      .from("seo_oauth_states")
      .delete()
      .lt("created_at", new Date(Date.now() - 3600_000).toISOString());
    await supabaseAdmin
      .from("seo_oauth_states")
      .insert({ nonce, user_id: context.userId, project_id: project.id });
    const origin = new URL(getRequest().url).origin;
    const params = new URLSearchParams({
      client_id: env.id,
      redirect_uri: `${origin}/api/gsc/callback`,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      access_type: "offline",
      prompt: "consent",
      state: nonce,
    });
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
  });

export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("seo_google_connections").delete().eq("user_id", context.userId);
    await context.supabase
      .from("seo_projects")
      .update({ gsc_site: null })
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const listGscSites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listSites } = await import("./gsc.server");
    return listSites(await tokenFor(context.userId));
  });

export const setProjectGscSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: uuid, siteUrl: z.string().min(3).max(300) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { listSites } = await import("./gsc.server");
    const sites = await listSites(await tokenFor(context.userId));
    if (!sites.some((s) => s.siteUrl === data.siteUrl))
      throw new Error("Cette propriété n'appartient pas à votre compte Google.");
    const { error } = await context.supabase
      .from("seo_projects")
      .update({ gsc_site: data.siteUrl })
      .eq("id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const gscOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: uuid,
        days: z.union([z.literal(7), z.literal(28), z.literal(90)]).default(28),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { query } = await import("./gsc.server");
    const { data: project } = await context.supabase
      .from("seo_projects")
      .select("gsc_site")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project?.gsc_site)
      throw new Error("Aucune propriété Search Console choisie pour ce projet.");
    const token = await tokenFor(context.userId);
    const site = project.gsc_site;
    const p = periods(data.days);
    const cur = { startDate: p.start, endDate: p.end };
    const prev = { startDate: p.prevStart, endDate: p.prevEnd };
    const [totalNow, totalPrev, byDate, queries, pages, pagesPrev, queriesPrev] = await Promise.all(
      [
        query(token, site, cur),
        query(token, site, prev),
        query(token, site, { ...cur, dimensions: ["date"], rowLimit: 100 }),
        query(token, site, { ...cur, dimensions: ["query"], rowLimit: 500 }),
        query(token, site, { ...cur, dimensions: ["page"], rowLimit: 250 }),
        query(token, site, { ...prev, dimensions: ["page"], rowLimit: 250 }),
        query(token, site, { ...prev, dimensions: ["query"], rowLimit: 500 }),
      ],
    );
    const t = totalNow[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    const tp = totalPrev[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    return {
      site,
      period: p,
      totals: {
        clicks: { value: t.clicks, change: pctChange(t.clicks, tp.clicks) },
        impressions: { value: t.impressions, change: pctChange(t.impressions, tp.impressions) },
        ctr: { value: t.ctr, change: pctChange(t.ctr, tp.ctr) },
        position: {
          value: t.position,
          change: tp.position ? Math.round((t.position - tp.position) * 10) / 10 : null,
        },
      },
      series: byDate.map((r) => ({
        date: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
      })),
      topQueries: queries.slice(0, 100),
      topPages: pages.slice(0, 50),
      opportunities: findOpportunities(queries),
      pageMovers: movers(pages, pagesPrev),
      queryMovers: movers(queries, queriesPrev),
    };
  });
