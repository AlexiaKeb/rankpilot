import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, ScanSearch, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ScoreRing } from "@/components/ScoreRing";
import { SerpPreview } from "@/components/SerpPreview";
import { analyzeUrl } from "@/lib/seo/tools.functions";
import type { CheckStatus } from "@/lib/seo/optimizer";

export const Route = createFileRoute("/_authenticated/optimizer")({
  head: () => ({ meta: [{ title: "Optimiseur de page — RankPilot" }] }),
  component: Optimizer,
});

const ICON: Record<CheckStatus, { Icon: typeof XCircle; cls: string }> = {
  pass: { Icon: CheckCircle2, cls: "text-success" },
  warn: { Icon: CircleAlert, cls: "text-warning" },
  fail: { Icon: XCircle, cls: "text-danger" },
};
const GROUPS = ["Mot-clé", "Structure", "Contenu", "Technique"] as const;

function Optimizer() {
  const [url, setUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const run = useMutation({
    mutationFn: () => analyzeUrl({ data: { url, keyword } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Analyse impossible"),
  });
  const r = run.data;
  const todo = r?.checks.filter((c) => c.status !== "pass") ?? [];

  return (
    <AppShell>
      <PageHeader eyebrow="On-page" title="Optimiseur de page">
        Comparez une page à son mot-clé cible : title, titres, contenu, liens, balisage. Chaque
        point à corriger est accompagné de l'action à mener.
      </PageHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run.mutate();
        }}
        className="mb-8 grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[1.4fr_1fr_auto]"
      >
        <input
          required
          className="rounded-md border bg-background px-3 py-2"
          placeholder="https://monsite.fr/ma-page"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <input
          required
          minLength={2}
          className="rounded-md border bg-background px-3 py-2"
          placeholder="Mot-clé cible"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <button
          disabled={run.isPending}
          className="flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2 font-semibold text-primary-foreground disabled:opacity-60"
        >
          {run.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ScanSearch className="h-4 w-4" />
          )}{" "}
          Analyser
        </button>
      </form>

      {r && (
        <>
          <div className="mb-8 grid gap-4 lg:grid-cols-[auto_1fr]">
            <div className="flex items-center justify-center rounded-lg border bg-card p-6">
              <ScoreRing score={r.score} />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[
                ["Mots", r.stats.wordCount],
                ["Occurrences", r.stats.keywordCount],
                ["Densité", `${r.stats.density} %`],
                ["Sous-titres H2", r.stats.h2Count],
                ["Liens internes", r.stats.internalLinks],
                ["Réponse serveur", `${r.responseMs} ms`],
              ].map(([l, v]) => (
                <div key={l as string} className="rounded-lg border bg-card p-4">
                  <div className="font-data text-[11px] uppercase tracking-widest text-muted-foreground">
                    {l}
                  </div>
                  <div className="mt-1 font-display text-2xl font-extrabold">{v}</div>
                </div>
              ))}
            </div>
          </div>

          <h2 className="mb-3 font-display text-2xl font-bold">Aperçu dans Google</h2>
          <div className="mb-8">
            <SerpPreview {...r.serp} />
          </div>

          {todo.length > 0 && (
            <>
              <h2 className="mb-3 font-display text-2xl font-bold">
                À corriger en priorité ({todo.length})
              </h2>
              <ul className="mb-8 space-y-2">
                {todo
                  .filter((c) => c.status === "fail")
                  .concat(todo.filter((c) => c.status === "warn"))
                  .slice(0, 6)
                  .map((c) => (
                    <li key={c.id} className="rounded-lg border bg-card p-4 text-sm">
                      <span className="font-medium">{c.label}.</span>{" "}
                      <span className="text-muted-foreground">{c.fix}</span>
                    </li>
                  ))}
              </ul>
            </>
          )}

          {GROUPS.map((g) => (
            <div key={g} className="mb-6">
              <h3 className="font-data mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                {g}
              </h3>
              <div className="divide-y overflow-hidden rounded-lg border bg-card">
                {r.checks
                  .filter((c) => c.group === g)
                  .map((c) => {
                    const { Icon, cls } = ICON[c.status];
                    return (
                      <div key={c.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${cls}`} />
                        <div className="flex-1">
                          <div className="font-medium">{c.label}</div>
                          <div className="text-muted-foreground">{c.detail}</div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}

          <h3 className="font-data mb-2 text-xs uppercase tracking-widest text-muted-foreground">
            Plan de la page
          </h3>
          <ul className="rounded-lg border bg-card p-4 text-sm">
            {r.headings.slice(0, 40).map((h, i) => (
              <li key={i} style={{ paddingLeft: (h.level - 1) * 16 }} className="py-0.5">
                <span className="font-data mr-2 text-xs text-muted-foreground">H{h.level}</span>
                {h.text}
              </li>
            ))}
          </ul>
        </>
      )}
    </AppShell>
  );
}
