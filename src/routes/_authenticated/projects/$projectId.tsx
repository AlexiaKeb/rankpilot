import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Download, Loader2, Play, Trash2 } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { ScoreRing } from "@/components/ScoreRing";
import { supabase } from "@/integrations/supabase/client";
import { crawlStep, startAudit } from "@/lib/seo/audit.functions";
import { RULES, type Severity } from "@/lib/seo/rules";
import { buildLlmsTxt } from "@/lib/seo/ai";
import { suggestInternalLinks } from "@/lib/seo/linking";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({ meta: [{ title: "Audit SEO — RankPilot" }] }),
  component: ProjectPage,
});

const SEV: Record<Severity, { label: string; color: string }> = {
  critical: { label: "Critique", color: "var(--danger)" },
  warning: { label: "Alerte", color: "var(--warning)" },
  notice: { label: "Info", color: "var(--muted-foreground)" },
};

const csvEsc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
function downloadCsv(name: string, header: string[], rows: unknown[][]) {
  const content = [header.join(","), ...rows.map((r) => r.map(csvEsc).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="font-data text-[11px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 font-display text-4xl font-extrabold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

type Tab = "plan" | "pages" | "links" | "llms" | "history";

function ProjectPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [progress, setProgress] = useState<{ crawled: number; discovered: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("plan");
  const [maxPages, setMaxPages] = useState(50);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [summary, setSummary] = useState("");

  const project = useQuery({
    queryKey: ["seo_project", projectId],
    queryFn: async () =>
      (await supabase.from("seo_projects").select("*").eq("id", projectId).single()).data,
  });
  const audits = useQuery({
    queryKey: ["seo_audits", projectId],
    queryFn: async () =>
      (
        await supabase
          .from("seo_audits")
          .select("*")
          .eq("project_id", projectId)
          .order("started_at", { ascending: false })
          .limit(30)
      ).data ?? [],
  });
  const list = audits.data ?? [];
  const audit = list.find((a) => a.id === selectedId) ?? list[0];
  const previous = audit
    ? list.find((a) => a.status === "completed" && a.started_at < audit.started_at)
    : undefined;
  const done = audit?.status === "completed";

  const issues = useQuery({
    enabled: done,
    queryKey: ["seo_issues", audit?.id],
    queryFn: async () =>
      (await supabase.from("seo_audit_issues").select("*").eq("audit_id", audit!.id).limit(5000))
        .data ?? [],
  });
  const prevIssues = useQuery({
    enabled: !!previous && done,
    queryKey: ["seo_issues", previous?.id],
    queryFn: async () =>
      (
        await supabase
          .from("seo_audit_issues")
          .select("code,url")
          .eq("audit_id", previous!.id)
          .limit(5000)
      ).data ?? [],
  });
  const pages = useQuery({
    enabled: done && (tab === "pages" || tab === "links" || tab === "llms"),
    queryKey: ["seo_pages", audit?.id],
    queryFn: async () =>
      (
        await supabase
          .from("seo_audit_pages")
          .select(
            "id,url,status_code,title,meta_description,word_count,depth,response_ms,noindex,internal_links,data",
          )
          .eq("audit_id", audit!.id)
          .eq("crawled", true)
          .order("url")
          .limit(1000)
      ).data ?? [],
  });

  const origin = project.data ? `https://${project.data.domain}` : "";
  const linkIdeas = useMemo(
    () =>
      suggestInternalLinks(
        (pages.data ?? []).map((p) => ({
          url: p.url,
          title: p.title,
          h1: ((p.data as { h1?: string[] })?.h1 ?? [])[0],
          internalLinks: (p.internal_links as string[]) ?? [],
          status: p.status_code ?? 0,
          noindex: p.noindex,
        })),
        origin,
      ),
    [pages.data, origin],
  );
  const llmsText = useMemo(
    () =>
      buildLlmsTxt(
        { name: project.data?.name ?? "", summary },
        (pages.data ?? [])
          .filter((p) => p.status_code === 200 && !p.noindex)
          .sort((a, b) => a.depth - b.depth)
          .map((p) => ({ url: p.url, title: p.title, description: p.meta_description })),
      ),
    [pages.data, project.data, summary],
  );

  const diff = useMemo(() => {
    if (!issues.data || !prevIssues.data) return null;
    const key = (i: { code: string; url: string }) => `${i.code}|${i.url}`;
    const now = new Set(issues.data.map(key));
    const before = new Set(prevIssues.data.map(key));
    return {
      added: [...now].filter((k) => !before.has(k)).length,
      fixed: [...before].filter((k) => !now.has(k)).length,
    };
  }, [issues.data, prevIssues.data]);

  const run = useMutation({
    mutationFn: async () => {
      setProgress({ crawled: 0, discovered: 1 });
      const { auditId } = await startAudit({ data: { projectId, maxPages } });
      for (let i = 0; i < Math.ceil(maxPages / 3) + 20; i++) {
        const r = await crawlStep({ data: { auditId } });
        setProgress({ crawled: r.crawled, discovered: r.discovered });
        if (r.done) return auditId;
      }
      throw new Error("Audit interrompu : trop d'itérations.");
    },
    onSuccess: (id) => {
      toast.success("Audit terminé");
      setSelectedId(id);
      setTab("plan");
      qc.invalidateQueries({ queryKey: ["seo_audits", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur d'audit"),
    onSettled: () => setProgress(null),
  });

  const removeAudit = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("seo_audits").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["seo_audits", projectId] });
      toast.success("Audit supprimé");
    },
  });
  const removeProject = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("seo_projects").delete().eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => navigate({ to: "/projects" }),
  });

  const counts = (audit?.issue_counts ?? {}) as Record<string, number>;
  const rows = Object.entries(counts)
    .filter(([c]) => RULES[c])
    .sort(([a], [b]) => {
      const o = { critical: 0, warning: 1, notice: 2 };
      return o[RULES[a].severity] - o[RULES[b].severity] || counts[b] - counts[a];
    });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const bySeverity = (sev: Severity) =>
    rows.filter(([c]) => RULES[c].severity === sev).reduce((a, [, n]) => a + n, 0);
  const trend = [...list]
    .reverse()
    .filter((a) => a.status === "completed")
    .map((a) => ({
      date: new Date(a.started_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
      score: a.health_score ?? 0,
    }));
  const shownPages = (pages.data ?? []).filter(
    (p) =>
      !q ||
      p.url.toLowerCase().includes(q.toLowerCase()) ||
      (p.title ?? "").toLowerCase().includes(q.toLowerCase()),
  );

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
        <div className="flex items-center gap-2">
          <select
            value={maxPages}
            onChange={(e) => setMaxPages(Number(e.target.value))}
            disabled={run.isPending}
            className="rounded-md border bg-card px-3 py-2.5 text-sm"
          >
            {[25, 50, 100, 200, 500].map((n) => (
              <option key={n} value={n}>
                {n} pages max
              </option>
            ))}
          </select>
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
            {run.isPending ? "Audit en cours…" : audit ? "Relancer l'audit" : "Lancer l'audit"}
          </button>
        </div>
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

      {done && audit && (
        <>
          <div className="mb-6 grid gap-4 lg:grid-cols-[auto_1fr]">
            <div className="flex items-center justify-center rounded-lg border bg-card p-6">
              <ScoreRing score={audit.health_score ?? 0} />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="Pages analysées" value={audit.pages_crawled} />
              <Stat
                label="Problèmes"
                value={total}
                hint={
                  diff
                    ? `${diff.added} nouveaux · ${diff.fixed} corrigés depuis le dernier audit`
                    : undefined
                }
              />
              <Stat label="Critiques" value={bySeverity("critical")} />
            </div>
          </div>

          <div className="mb-5 flex gap-1 border-b">
            {(
              [
                ["plan", "Plan d'action"],
                ["pages", "Pages"],
                ["links", "Maillage"],
                ["llms", "llms.txt"],
                ["history", "Historique"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {l}
              </button>
            ))}
          </div>

          {tab === "plan" && (
            <>
              <div className="mb-3 flex justify-end">
                <button
                  onClick={() =>
                    downloadCsv(
                      `audit-${project.data?.domain}.csv`,
                      ["gravité", "problème", "url", "détail"],
                      (issues.data ?? []).map((i) => [
                        SEV[i.severity].label,
                        RULES[i.code]?.title ?? i.code,
                        i.url,
                        i.detail,
                      ]),
                    )
                  }
                  className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
                >
                  <Download className="h-4 w-4" /> Export CSV
                </button>
              </div>
              {rows.length === 0 && (
                <p className="rounded-lg border bg-card p-6 text-success">
                  Aucun problème détecté.
                </p>
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
                        <span className="font-data rounded bg-secondary px-2 py-0.5 text-xs">
                          {n}
                        </span>
                      </button>
                      {open === code && (
                        <div className="space-y-3 bg-surface-2 px-4 py-4 text-sm">
                          <p>
                            <span className="font-data text-xs uppercase text-primary">
                              Pourquoi
                            </span>
                            <br />
                            {rule.why}
                          </p>
                          <p>
                            <span className="font-data text-xs uppercase text-primary">
                              Correction
                            </span>
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

          {tab === "pages" && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Filtrer par URL ou title…"
                  className="min-w-0 flex-1 rounded-md border bg-card px-3 py-2 text-sm"
                />
                <button
                  onClick={() =>
                    downloadCsv(
                      `pages-${project.data?.domain}.csv`,
                      ["url", "statut", "title", "mots", "profondeur", "temps ms", "noindex"],
                      shownPages.map((p) => [
                        p.url,
                        p.status_code,
                        p.title,
                        p.word_count,
                        p.depth,
                        p.response_ms,
                        p.noindex ? "oui" : "non",
                      ]),
                    )
                  }
                  className="flex items-center gap-1 rounded-md border px-3 py-2 text-sm hover:bg-accent"
                >
                  <Download className="h-4 w-4" /> CSV
                </button>
              </div>
              <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full text-left text-sm">
                  <thead className="font-data border-b text-[11px] uppercase tracking-widest text-muted-foreground">
                    <tr>
                      <th className="p-3">URL</th>
                      <th className="p-3">Statut</th>
                      <th className="p-3">Title</th>
                      <th className="p-3 text-right">Mots</th>
                      <th className="p-3 text-right">ms</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {shownPages.map((p) => (
                      <tr key={p.id}>
                        <td className="max-w-[16rem] truncate p-3" title={p.url}>
                          {p.url.replace(/^https?:\/\/[^/]+/, "") || "/"}
                        </td>
                        <td
                          className={`font-data p-3 ${(p.status_code ?? 0) >= 400 || p.status_code === 0 ? "text-danger" : ""}`}
                        >
                          {p.status_code}
                        </td>
                        <td
                          className="max-w-[18rem] truncate p-3 text-muted-foreground"
                          title={p.title ?? ""}
                        >
                          {p.title ?? "—"}
                        </td>
                        <td className="font-data p-3 text-right">{p.word_count ?? "—"}</td>
                        <td className="font-data p-3 text-right">{p.response_ms ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === "links" && (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                Pages peu liées de votre site, avec les pages proches par le sujet qui devraient
                pointer vers elles. Ajoutez le lien dans le texte, avec une ancre descriptive.
              </p>
              {pages.isLoading && <p className="text-muted-foreground">Analyse…</p>}
              {pages.isSuccess && linkIdeas.length === 0 && (
                <p className="rounded-lg border bg-card p-6 text-success">
                  Aucune page n'est sous-liée.
                </p>
              )}
              <div className="space-y-3">
                {linkIdeas.slice(0, 30).map((s) => (
                  <div key={s.target.url} className="rounded-lg border bg-card p-4 text-sm">
                    <div className="mb-2">
                      <span className="font-data mr-2 rounded bg-secondary px-2 py-0.5 text-xs">
                        {s.inbound} lien(s) entrant(s)
                      </span>
                      <span className="font-medium">{s.target.title}</span>
                    </div>
                    <div className="font-data mb-2 break-all text-xs text-muted-foreground">
                      {s.target.url}
                    </div>
                    <ul className="space-y-1">
                      {s.from.map((f) => (
                        <li key={f.url} className="flex gap-2">
                          <span className="text-primary">←</span>
                          <span className="min-w-0 break-all">
                            {f.title}{" "}
                            <span className="font-data text-xs text-muted-foreground">
                              ({f.url.replace(/^https?:\/\/[^/]+/, "") || "/"})
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === "llms" && (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                Le fichier <code>llms.txt</code>, placé à la racine de votre site, résume vos pages
                clés pour les moteurs de réponse IA. Générez-le depuis l'audit, relisez-le, puis
                publiez-le sur <code>/llms.txt</code>. Son impact sur les classements n'est pas
                garanti : c'est une bonne pratique en cours d'adoption.
              </p>
              <input
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Résumé du site en une ou deux phrases"
                className="mb-3 w-full rounded-md border bg-card px-3 py-2 text-sm"
              />
              <pre className="font-data mb-3 max-h-96 overflow-auto rounded-lg border bg-card p-4 text-xs">
                {llmsText}
              </pre>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(llmsText);
                    toast.success("Copié");
                  }}
                  className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
                >
                  Copier
                </button>
                <button
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(
                      new Blob([llmsText], { type: "text/plain;charset=utf-8" }),
                    );
                    a.download = "llms.txt";
                    a.click();
                  }}
                  className="flex items-center gap-1 rounded-md border px-3 py-2 text-sm hover:bg-accent"
                >
                  <Download className="h-4 w-4" /> Télécharger
                </button>
              </div>
            </>
          )}

          {tab === "history" && (
            <>
              {trend.length > 1 && (
                <div className="mb-6 h-56 rounded-lg border bg-card p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trend}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={12} />
                      <YAxis
                        domain={[0, 100]}
                        stroke="var(--muted-foreground)"
                        fontSize={12}
                        width={30}
                      />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="var(--primary)"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: "var(--primary)" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="divide-y overflow-hidden rounded-lg border bg-card">
                {list.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <button
                      onClick={() => {
                        setSelectedId(a.id);
                        setTab("plan");
                      }}
                      className="flex flex-1 items-center gap-4 text-left hover:text-primary"
                    >
                      <span className="font-data w-40">
                        {new Date(a.started_at).toLocaleString("fr-FR", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                      <span className="font-data text-xs text-muted-foreground">
                        {a.pages_crawled} pages
                      </span>
                      <span className="ml-auto font-display text-lg font-bold">
                        {a.status === "completed"
                          ? a.health_score
                          : a.status === "running"
                            ? "en cours"
                            : "échec"}
                      </span>
                    </button>
                    <button
                      onClick={() => confirm("Supprimer cet audit ?") && removeAudit.mutate(a.id)}
                      className="text-muted-foreground hover:text-danger"
                      title="Supprimer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {audit && audit.status !== "completed" && !run.isPending && (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Le dernier audit n'a pas abouti. Relancez-le.
        </p>
      )}
      {!audit && !run.isPending && audits.isSuccess && (
        <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          Aucun audit pour l'instant. Lancez-en un pour obtenir votre score de santé.
        </p>
      )}

      <div className="mt-16 border-t pt-6 text-right">
        <button
          onClick={() =>
            confirm("Supprimer ce projet et tous ses audits ?") && removeProject.mutate()
          }
          className="text-sm text-muted-foreground hover:text-danger"
        >
          Supprimer ce projet
        </button>
      </div>
    </AppShell>
  );
}
