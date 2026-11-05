import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { crawlStep, startAudit } from "@/lib/seo/audit.functions";
import { RULES, type Severity } from "@/lib/seo/rules";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({ meta: [{ title: "Audit SEO — RankPilot" }] }),
  component: ProjectPage,
});

const SEV: Record<Severity, { label: string; cls: string }> = {
  critical: { label: "Critique", cls: "bg-red-100 text-red-700" },
  warning: { label: "Avertissement", cls: "bg-amber-100 text-amber-700" },
  notice: { label: "Info", cls: "bg-sky-100 text-sky-700" },
};

function scoreColor(s: number) {
  return s >= 80 ? "text-emerald-600" : s >= 50 ? "text-amber-600" : "text-red-600";
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

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <Link
        to="/projects"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Projets
      </Link>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">{project.data?.name}</h1>
          <p className="text-muted-foreground">{project.data?.domain}</p>
        </div>
        <button
          onClick={() => run.mutate()}
          disabled={run.isPending}
          className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground disabled:opacity-60"
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
        <div className="mb-6 rounded-xl border bg-card p-4">
          <div className="mb-2 text-sm">
            {progress.crawled} pages analysées sur {progress.discovered} découvertes
          </div>
          <div className="h-2 overflow-hidden rounded bg-secondary">
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
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border bg-card p-5">
              <div className="text-sm text-muted-foreground">Score de santé</div>
              <div className={`text-5xl font-bold ${scoreColor(audit.data.health_score ?? 0)}`}>
                {audit.data.health_score}
                <span className="text-xl text-muted-foreground">/100</span>
              </div>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <div className="text-sm text-muted-foreground">Pages analysées</div>
              <div className="text-4xl font-bold">{audit.data.pages_crawled}</div>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <div className="text-sm text-muted-foreground">Problèmes</div>
              <div className="text-4xl font-bold">
                {Object.values(counts).reduce((a, b) => a + b, 0)}
              </div>
            </div>
          </div>
          <h2 className="mb-3 font-display text-xl font-semibold">Plan d'action</h2>
          {rows.length === 0 && (
            <p className="rounded-xl border bg-card p-6 text-emerald-700">
              Aucun problème détecté. 🎉
            </p>
          )}
          <div className="space-y-2">
            {rows.map(([code, n]) => {
              const rule = RULES[code];
              const sev = SEV[rule.severity];
              return (
                <div key={code} className="rounded-xl border bg-card">
                  <button
                    className="flex w-full items-center gap-3 p-4 text-left"
                    onClick={() => setOpen(open === code ? null : code)}
                  >
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${sev.cls}`}>
                      {sev.label}
                    </span>
                    <span className="flex-1 font-medium">{rule.title}</span>
                    <span className="text-sm text-muted-foreground">{n}</span>
                  </button>
                  {open === code && (
                    <div className="space-y-3 border-t p-4 text-sm">
                      <p>
                        <strong>Pourquoi :</strong> {rule.why}
                      </p>
                      <p>
                        <strong>Comment corriger :</strong> {rule.fix}
                      </p>
                      <ul className="max-h-48 list-disc space-y-1 overflow-auto pl-5 text-muted-foreground">
                        {(issues.data ?? [])
                          .filter((i) => i.code === code)
                          .slice(0, 50)
                          .map((i) => (
                            <li key={i.id} className="break-all">
                              {i.url}
                              {i.detail ? ` — ${i.detail}` : ""}
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
        <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          Aucun audit pour l'instant. Lancez-en un pour voir votre score de santé.
        </p>
      )}
    </div>
  );
}
