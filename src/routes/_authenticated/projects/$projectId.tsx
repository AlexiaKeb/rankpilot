import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { ScoreRing } from "@/components/ScoreRing";
import { supabase } from "@/integrations/supabase/client";
import { crawlStep, startAudit } from "@/lib/seo/audit.functions";
import { RULES, type Severity } from "@/lib/seo/rules";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({ meta: [{ title: "Audit SEO — RankPilot" }] }),
  component: ProjectPage,
});

const SEV: Record<Severity, { label: string; color: string }> = {
  critical: { label: "Critique", color: "var(--danger)" },
  warning: { label: "Alerte", color: "var(--warning)" },
  notice: { label: "Info", color: "var(--muted-foreground)" },
};

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="font-data text-[11px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 font-display text-4xl font-extrabold">{value}</div>
    </div>
  );
}

function ProjectPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const [progress, setProgress] = useState<{ crawled: number; discovered: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const project = useQuery({
    queryKey: ["seo_project", projectId],
    queryFn: async () =>
      (await supabase.from("seo_projects").select("*").eq("id", projectId).single()).data,
  });
  const audit = useQuery({
    queryKey: ["seo_audit_latest", projectId],
    queryFn: async () =>
      (
        await supabase
          .from("seo_audits")
          .select("*")
          .eq("project_id", projectId)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      ).data,
  });
  const issues = useQuery({
    enabled: audit.data?.status === "completed",
    queryKey: ["seo_issues", audit.data?.id],
    queryFn: async () =>
      (
        await supabase
          .from("seo_audit_issues")
          .select("*")
          .eq("audit_id", audit.data!.id)
          .limit(5000)
      ).data ?? [],
  });

  const run = useMutation({
    mutationFn: async () => {
      setProgress({ crawled: 0, discovered: 1 });
      const { auditId } = await startAudit({ data: { projectId, maxPages: 50 } });
      for (let i = 0; i < 200; i++) {
        const r = await crawlStep({ data: { auditId } });
        setProgress({ crawled: r.crawled, discovered: r.discovered });
        if (r.done) return;
      }
      throw new Error("Audit interrompu : trop d'itérations.");
    },
    onSuccess: () => {
      toast.success("Audit terminé");
      qc.invalidateQueries({ queryKey: ["seo_audit_latest", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur d'audit"),
    onSettled: () => setProgress(null),
  });

  const counts = (audit.data?.issue_counts ?? {}) as Record<string, number>;
  const rows = Object.entries(counts)
    .filter(([c]) => RULES[c])
    .sort(([a], [b]) => {
      const o = { critical: 0, warning: 1, notice: 2 };
      return o[RULES[a].severity] - o[RULES[b].severity] || counts[b] - counts[a];
    });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const bySeverity = (sev: Severity) =>
    rows.filter(([c]) => RULES[c].severity === sev).reduce((a, [, n]) => a + n, 0);

  return (
    <AppShell>
      <Link
        to="/projects"
        className="mb-5 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Projets
      </Link>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-data mb-2 text-xs uppercase tracking-[0.2em] text-primary">
            {project.data?.domain}
          </p>
          <h1 className="font-display text-4xl font-extrabold">{project.data?.name}</h1>
        </div>
        <button
          onClick={() => run.mutate()}
          disabled={run.isPending}
          className="flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
        >
          {run.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {run.isPending ? "Audit en cours…" : audit.data ? "Relancer l'audit" : "Lancer l'audit"}
        </button>
      </div>

      {progress && (
        <div className="mb-6 rounded-lg border bg-card p-4">
          <div className="font-data mb-2 text-xs text-muted-foreground">
            {progress.crawled} / {progress.discovered} pages
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: `${Math.min(100, (progress.crawled / Math.max(1, progress.discovered)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {audit.data?.status === "completed" && (
        <>
          <div className="mb-8 grid gap-4 lg:grid-cols-[auto_1fr]">
            <div className="flex items-center justify-center rounded-lg border bg-card p-6">
              <ScoreRing score={audit.data.health_score ?? 0} />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="Pages analysées" value={audit.data.pages_crawled} />
              <Stat label="Problèmes" value={total} />
              <Stat label="Critiques" value={bySeverity("critical")} />
            </div>
          </div>

          <h2 className="mb-3 font-display text-2xl font-bold">Plan d'action</h2>
          {rows.length === 0 && (
            <p className="rounded-lg border bg-card p-6 text-success">Aucun problème détecté.</p>
          )}
          <div className="divide-y overflow-hidden rounded-lg border bg-card">
            {rows.map(([code, n]) => {
              const rule = RULES[code];
              const sev = SEV[rule.severity];
              return (
                <div key={code}>
                  <button
                    className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition hover:bg-accent/50"
                    onClick={() => setOpen(open === code ? null : code)}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: sev.color }}
                    />
                    <span className="font-data w-14 shrink-0 text-[11px] uppercase text-muted-foreground">
                      {sev.label}
                    </span>
                    <span className="flex-1 font-medium">{rule.title}</span>
                    <span className="font-data rounded bg-secondary px-2 py-0.5 text-xs">{n}</span>
                  </button>
                  {open === code && (
                    <div className="space-y-3 bg-surface-2 px-4 py-4 text-sm">
                      <p>
                        <span className="font-data text-xs uppercase text-primary">Pourquoi</span>
                        <br />
                        {rule.why}
                      </p>
                      <p>
                        <span className="font-data text-xs uppercase text-primary">Correction</span>
                        <br />
                        {rule.fix}
                      </p>
                      <ul className="font-data max-h-48 space-y-1 overflow-auto text-xs text-muted-foreground">
                        {(issues.data ?? [])
                          .filter((i) => i.code === code)
                          .slice(0, 50)
                          .map((i) => (
                            <li key={i.id} className="break-all">
                              {i.url}
                              {i.detail ? ` → ${i.detail}` : ""}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {!audit.data && !run.isPending && (
        <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          Aucun audit pour l'instant. Lancez-en un pour obtenir votre score de santé.
        </p>
      )}
    </AppShell>
  );
}
