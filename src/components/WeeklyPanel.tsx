import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2, Sparkles } from "lucide-react";
import { weeklyPlan } from "@/lib/seo/plan.functions";

const IMPACT_COLOR = {
  élevé: "var(--danger)",
  moyen: "var(--warning)",
  faible: "var(--muted-foreground)",
} as const;
const path = (u: string) => u.replace(/^https?:\/\/[^/]+/, "") || "/";

function useDone(projectId: string) {
  const key = `rankpilot:done:${projectId}`;
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => {
    try {
      setDone(JSON.parse(localStorage.getItem(key) ?? "[]"));
    } catch {
      /* stockage indisponible */
    }
  }, [key]);
  const toggle = (id: string) =>
    setDone((d) => {
      const next = d.includes(id) ? d.filter((x) => x !== id) : [...d, id];
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  return { done, toggle };
}

export function WeeklyPanel({
  projectId,
  goTo,
}: {
  projectId: string;
  goTo: (v: "audit" | "gsc") => void;
}) {
  const plan = useQuery({
    queryKey: ["weekly_plan", projectId],
    queryFn: () => weeklyPlan({ data: { projectId } }),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const { done, toggle } = useDone(projectId);

  if (plan.isLoading)
    return (
      <p className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Préparation de votre plan…
      </p>
    );
  if (plan.error)
    return (
      <p className="rounded-lg border border-danger p-4 text-sm text-danger">
        {(plan.error as Error).message}
      </p>
    );
  const p = plan.data!;

  return (
    <>
      <div className="mb-6">
        <h2 className="flex items-center gap-2 font-display text-2xl font-bold">
          <Sparkles className="h-5 w-5 text-primary" /> À faire cette semaine
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Les actions les plus rentables d'après votre audit
          {p.context.gscConnected ? " et vos données Google" : ""}. Cochez celles que vous avez
          faites.
        </p>
      </div>

      {p.context.gscError && (
        <p className="mb-4 rounded-lg border border-warning p-3 text-sm text-warning">
          Search Console : {p.context.gscError}
        </p>
      )}
      {!p.context.hasAudit && (
        <p className="mb-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Aucun audit terminé pour ce projet.{" "}
          <button className="underline" onClick={() => goTo("audit")}>
            Lancez-en un
          </button>{" "}
          pour obtenir des actions précises.
        </p>
      )}

      {p.actions.length === 0 && p.context.hasAudit && (
        <p className="rounded-lg border bg-card p-6 text-success">
          Rien d'urgent cette semaine. Continuez à publier du contenu utile.
        </p>
      )}

      <ol className="space-y-3">
        {p.actions.map((a, i) => {
          const isDone = done.includes(a.id);
          return (
            <li
              key={a.id}
              className={`rounded-lg border bg-card p-4 ${isDone ? "opacity-60" : ""}`}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={() => toggle(a.id)}
                  aria-label={isDone ? "Marquer à faire" : "Marquer comme fait"}
                  className="mt-0.5 shrink-0 text-primary"
                >
                  {isDone ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-data text-muted-foreground">{i + 1}.</span>
                    <span
                      className="rounded px-2 py-0.5 font-medium text-white"
                      style={{ background: IMPACT_COLOR[a.impact] }}
                    >
                      Impact {a.impact}
                    </span>
                    <span className="font-data text-muted-foreground">{a.source}</span>
                  </div>
                  <div className={`font-medium ${isDone ? "line-through" : ""}`}>{a.title}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{a.why}</p>
                  <p className="mt-2 text-sm">
                    <span className="font-data text-xs uppercase text-primary">À faire </span>
                    {a.how}
                  </p>
                  {a.urls && a.urls.length > 0 && (
                    <ul className="font-data mt-2 space-y-0.5 text-xs text-muted-foreground">
                      {a.urls.map((u) => (
                        <li key={u} className="break-all">
                          {path(u)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {a.id === "connect-gsc" && (
                    <button
                      onClick={() => goTo("gsc")}
                      className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                    >
                      Ouvrir la Search Console
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {p.declining.length > 0 && (
        <section className="mt-10">
          <h3 className="mb-1 font-display text-xl font-bold">Pages qui perdent des clics</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            28 derniers jours comparés aux 28 précédents. Mettez à jour d'abord celles qui avaient
            le plus de trafic.
          </p>
          <div className="divide-y overflow-hidden rounded-lg border bg-card text-sm">
            {p.declining.map((d) => (
              <div key={d.page} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 break-all font-medium">{path(d.page)}</span>
                  <span className="font-data text-danger">{d.delta}</span>
                </div>
                {d.topQueries.length > 0 && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Requêtes :{" "}
                    {d.topQueries
                      .map((q) => `${q.query} (pos. ${q.position.toFixed(0)})`)
                      .join(" · ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {p.cannibalization.length > 0 && (
        <section className="mt-10">
          <h3 className="mb-1 font-display text-xl font-bold">Cannibalisation de requêtes</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Plusieurs de vos pages se disputent la même requête. Désignez une page principale.
          </p>
          <div className="divide-y overflow-hidden rounded-lg border bg-card text-sm">
            {p.cannibalization.map((c) => (
              <div key={c.query} className="px-4 py-3">
                <div className="font-medium">
                  « {c.query} »{" "}
                  <span className="font-data text-xs text-muted-foreground">
                    {c.totalImpressions} impr.
                  </span>
                </div>
                <ul className="font-data mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {c.pages.map((pg) => (
                    <li key={pg.page} className="break-all">
                      {path(pg.page)} — pos. {pg.position.toFixed(1)}, {pg.clicks} clics
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
