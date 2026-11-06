import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildWeeklyActions,
  decliningPages,
  findCannibalization,
  type Cannibalization,
  type DecliningPage,
  type QueryPageRow,
  type WeeklyAction,
} from "./actions";
import { findOpportunities, movers, periods, type QueryOpportunity } from "./gsc";

export interface WeeklyPlan {
  actions: WeeklyAction[];
  declining: DecliningPage[];
  cannibalization: Cannibalization[];
  opportunities: QueryOpportunity[];
  context: {
    hasAudit: boolean;
    auditScore: number | null;
    gscConnected: boolean;
    gscSite: string | null;
    gscError: string | null;
  };
}

export const weeklyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<WeeklyPlan> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { accessTokenFrom, query } = await import("./gsc.server");

    const { data: project } = await context.supabase
      .from("seo_projects")
      .select("id,gsc_site")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project) throw new Error("Projet introuvable.");

    // — Audit le plus récent
    const { data: audit } = await context.supabase
      .from("seo_audits")
      .select("id,health_score,issue_counts")
      .eq("project_id", project.id)
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    let auditInput: { counts: Record<string, number>; samples: Record<string, string[]> } | null =
      null;
    if (audit) {
      const { data: issues } = await context.supabase
        .from("seo_audit_issues")
        .select("code,url")
        .eq("audit_id", audit.id)
        .limit(3000);
      const samples: Record<string, string[]> = {};
      for (const i of issues ?? [])
        (samples[i.code] ??= []).length < 5 && samples[i.code].push(i.url);
      auditInput = { counts: audit.issue_counts as Record<string, number>, samples };
    }

    // — Mots-clés enregistrés
    const { count: savedKeywords } = await context.supabase
      .from("seo_keywords")
      .select("id", { count: "exact", head: true });

    // — Search Console (facultative)
    const { data: conn } = await supabaseAdmin
      .from("seo_google_connections")
      .select("refresh_token")
      .eq("user_id", context.userId)
      .maybeSingle();
    let gsc: {
      opportunities: QueryOpportunity[];
      declining: DecliningPage[];
      cannibalization: Cannibalization[];
    } | null = null;
    let gscError: string | null = null;
    if (conn && project.gsc_site) {
      try {
        const token = await accessTokenFrom(conn.refresh_token);
        const p = periods(28);
        const cur = { startDate: p.start, endDate: p.end };
        const prev = { startDate: p.prevStart, endDate: p.prevEnd };
        const [queries, pages, pagesPrev, qp] = await Promise.all([
          query(token, project.gsc_site, { ...cur, dimensions: ["query"], rowLimit: 500 }),
          query(token, project.gsc_site, { ...cur, dimensions: ["page"], rowLimit: 250 }),
          query(token, project.gsc_site, { ...prev, dimensions: ["page"], rowLimit: 250 }),
          query(token, project.gsc_site, { ...cur, dimensions: ["query", "page"], rowLimit: 2000 }),
        ]);
        const rows: QueryPageRow[] = qp.map((r) => ({
          query: r.keys[0],
          page: r.keys[1],
          clicks: r.clicks,
          impressions: r.impressions,
          position: r.position,
        }));
        gsc = {
          opportunities: findOpportunities(queries),
          declining: decliningPages(movers(pages, pagesPrev).losers, rows),
          cannibalization: findCannibalization(rows),
        };
      } catch (e) {
        gscError = e instanceof Error ? e.message : "Search Console indisponible.";
      }
    }

    return {
      actions: buildWeeklyActions({
        audit: auditInput,
        gsc,
        gscConnected: !!conn && !!project.gsc_site,
        savedKeywords: savedKeywords ?? 0,
      }),
      declining: gsc?.declining ?? [],
      cannibalization: gsc?.cannibalization ?? [],
      opportunities: gsc?.opportunities ?? [],
      context: {
        hasAudit: !!audit,
        auditScore: audit?.health_score ?? null,
        gscConnected: !!conn,
        gscSite: project.gsc_site,
        gscError,
      },
    };
  });
