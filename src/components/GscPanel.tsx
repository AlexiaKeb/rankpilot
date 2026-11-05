import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Loader2, Unplug } from "lucide-react";
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
import {
  disconnectGoogle,
  gscOverview,
  gscStatus,
  listGscSites,
  setProjectGscSite,
  startGoogleConnect,
} from "@/lib/seo/gsc.functions";

const onErr = (e: unknown) => toast.error(e instanceof Error ? e.message : "Erreur");
const nf = new Intl.NumberFormat("fr-FR");
const path = (u: string) => u.replace(/^https?:\/\/[^/]+/, "") || "/";

function Kpi({
  label,
  value,
  change,
  invert,
}: {
  label: string;
  value: string;
  change: number | null;
  invert?: boolean;
}) {
  const good = change == null ? null : invert ? change < 0 : change > 0;
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="font-data text-[11px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-display text-3xl font-extrabold">{value}</div>
      {change != null && change !== 0 && (
        <div
          className={`mt-1 flex items-center gap-1 text-xs ${good ? "text-success" : "text-danger"}`}
        >
          {change > 0 ? (
            <ArrowUpRight className="h-3 w-3" />
          ) : (
            <ArrowDownRight className="h-3 w-3" />
          )}
          {Math.abs(change)}
          {invert ? " pos." : " %"} vs période précédente
        </div>
      )}
    </div>
  );
}

export function GscPanel({ projectId, gscSite }: { projectId: string; gscSite: string | null }) {
  const qc = useQueryClient();
  const [days, setDays] = useState<7 | 28 | 90>(28);
  const [section, setSection] = useState<"queries" | "pages">("queries");

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("gsc");
    if (!s) return;
    if (s === "connected") toast.success("Search Console connectée");
    else
      toast.error(
        s === "denied"
          ? "Autorisation refusée."
          : s === "expired"
            ? "Session expirée, réessayez."
            : "La connexion Google a échoué.",
      );
    window.history.replaceState(null, "", window.location.pathname);
    qc.invalidateQueries({ queryKey: ["gsc_status"] });
  }, [qc]);

  const status = useQuery({ queryKey: ["gsc_status"], queryFn: () => gscStatus() });
  const connect = useMutation({
    mutationFn: () => startGoogleConnect({ data: { projectId } }),
    onSuccess: (r) => (window.location.href = r.url),
    onError: onErr,
  });
  const sites = useQuery({
    enabled: !!status.data?.connected && !gscSite,
    queryKey: ["gsc_sites"],
    queryFn: () => listGscSites(),
  });
  const pick = useMutation({
    mutationFn: (siteUrl: string) => setProjectGscSite({ data: { projectId, siteUrl } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seo_project", projectId] });
      toast.success("Propriété liée au projet");
    },
    onError: onErr,
  });
  const disconnect = useMutation({
    mutationFn: () => disconnectGoogle(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gsc_status"] });
      qc.invalidateQueries({ queryKey: ["seo_project", projectId] });
    },
  });
  const data = useQuery({
    enabled: !!status.data?.connected && !!gscSite,
    queryKey: ["gsc_overview", projectId, days, gscSite],
    queryFn: () => gscOverview({ data: { projectId, days } }),
    retry: false,
  });

  if (status.isLoading) return <p className="text-muted-foreground">Chargement…</p>;

  if (!status.data?.connected)
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <h2 className="font-display text-2xl font-bold">Connectez la Search Console</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          Accédez à vos vraies données Google : clics, impressions, position moyenne, requêtes et
          pages. RankPilot en tire les opportunités les plus rentables. Accès en lecture seule,
          déconnectable à tout moment.
        </p>
        {!status.data?.configured && (
          <p className="mx-auto mt-4 max-w-lg rounded-md border border-warning p-3 text-sm text-warning">
            Configuration serveur manquante : ajoutez GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans
            les variables du Worker.
          </p>
        )}
        <button
          disabled={connect.isPending || !status.data?.configured}
          onClick={() => connect.mutate()}
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 font-semibold text-primary-foreground disabled:opacity-50"
        >
          {connect.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Connecter avec Google
        </button>
      </div>
    );

  if (!gscSite)
    return (
      <div className="rounded-xl border bg-card p-6">
        <h2 className="mb-1 font-display text-xl font-bold">
          Choisissez la propriété de ce projet
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Sites vérifiés dans votre Search Console.
        </p>
        {sites.isLoading && <p className="text-muted-foreground">Chargement…</p>}
        {sites.error && <p className="text-danger">{(sites.error as Error).message}</p>}
        {sites.data?.length === 0 && (
          <p className="text-sm">
            Aucune propriété trouvée sur ce compte Google. Ajoutez et vérifiez votre site sur
            search.google.com/search-console.
          </p>
        )}
        <div className="divide-y overflow-hidden rounded-lg border">
          {sites.data?.map((s) => (
            <button
              key={s.siteUrl}
              onClick={() => pick.mutate(s.siteUrl)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-accent"
            >
              <span className="break-all">{s.siteUrl}</span>
              <span className="font-data text-xs text-muted-foreground">{s.permissionLevel}</span>
            </button>
          ))}
        </div>
      </div>
    );

  const d = data.data;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-data text-xs text-muted-foreground">{gscSite}</span>
        <div className="flex items-center gap-2">
          {([7, 28, 90] as const).map((n) => (
            <button
              key={n}
              onClick={() => setDays(n)}
              className={`rounded-md border px-3 py-1 ${days === n ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent"}`}
            >
              {n} j
            </button>
          ))}
          <button
            onClick={() => confirm("Déconnecter la Search Console ?") && disconnect.mutate()}
            title="Déconnecter"
            className="text-muted-foreground hover:text-danger"
          >
            <Unplug className="h-4 w-4" />
          </button>
        </div>
      </div>
      {data.isLoading && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Lecture de la Search Console…
        </p>
      )}
      {data.error && (
        <p className="rounded-lg border border-danger p-4 text-sm text-danger">
          {(data.error as Error).message}
        </p>
      )}
      {d && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label="Clics"
              value={nf.format(d.totals.clicks.value)}
              change={d.totals.clicks.change}
            />
            <Kpi
              label="Impressions"
              value={nf.format(d.totals.impressions.value)}
              change={d.totals.impressions.change}
            />
            <Kpi
              label="CTR"
              value={`${(d.totals.ctr.value * 100).toFixed(1)} %`}
              change={d.totals.ctr.change}
            />
            <Kpi
              label="Position moy."
              value={d.totals.position.value.toFixed(1)}
              change={d.totals.position.change}
              invert
            />
          </div>
          <div className="mb-8 h-64 rounded-lg border bg-card p-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={d.series}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis yAxisId="l" stroke="var(--muted-foreground)" fontSize={11} width={40} />
                <YAxis
                  yAxisId="r"
                  orientation="right"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  width={40}
                />
                <Tooltip />
                <Line
                  yAxisId="l"
                  isAnimationActive={false}
                  dataKey="clicks"
                  name="Clics"
                  stroke="var(--primary)"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  yAxisId="r"
                  isAnimationActive={false}
                  dataKey="impressions"
                  name="Impressions"
                  stroke="var(--warning)"
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <h2 className="mb-1 font-display text-2xl font-bold">Opportunités</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Gain estimé = clics supplémentaires possibles avec un CTR moyen pour la position visée.
            Ordre de grandeur, pas une promesse.
          </p>
          {d.opportunities.length === 0 && (
            <p className="mb-8 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Pas assez de données pour détecter des opportunités sur cette période.
            </p>
          )}
          <div className="mb-8 divide-y overflow-hidden rounded-lg border bg-card">
            {d.opportunities.map((o) => (
              <div key={o.query} className="px-4 py-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="flex-1 font-medium">{o.query}</span>
                  <span className="font-data text-xs text-muted-foreground">
                    pos. {o.position.toFixed(1)} · {nf.format(o.impressions)} impr.
                  </span>
                  <span className="font-data rounded bg-accent px-2 py-0.5 text-xs">
                    +{nf.format(o.gain)} clics
                  </span>
                </div>
                <div className="mt-1 text-muted-foreground">{o.advice}</div>
              </div>
            ))}
          </div>

          {(d.pageMovers.losers.length > 0 || d.pageMovers.gainers.length > 0) && (
            <div className="mb-8 grid gap-4 md:grid-cols-2">
              {(
                [
                  ["En baisse", d.pageMovers.losers],
                  ["En hausse", d.pageMovers.gainers],
                ] as const
              ).map(([title, list]) => (
                <div key={title}>
                  <h3 className="font-data mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                    Pages {title.toLowerCase()}
                  </h3>
                  <div className="divide-y overflow-hidden rounded-lg border bg-card text-sm">
                    {list.length === 0 && <div className="p-3 text-muted-foreground">—</div>}
                    {list.slice(0, 6).map((m) => (
                      <div key={m.key} className="flex items-center gap-3 px-3 py-2">
                        <span className="min-w-0 flex-1 truncate" title={m.key}>
                          {path(m.key)}
                        </span>
                        <span
                          className={`font-data text-xs ${m.delta < 0 ? "text-danger" : "text-success"}`}
                        >
                          {m.delta > 0 ? "+" : ""}
                          {m.delta}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mb-3 flex gap-1 border-b">
            {(
              [
                ["queries", "Requêtes"],
                ["pages", "Pages"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setSection(k)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${section === k ? "border-primary" : "border-transparent text-muted-foreground"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="font-data border-b text-[11px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="p-3">{section === "queries" ? "Requête" : "Page"}</th>
                  <th className="p-3 text-right">Clics</th>
                  <th className="p-3 text-right">Impr.</th>
                  <th className="p-3 text-right">CTR</th>
                  <th className="p-3 text-right">Pos.</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(section === "queries" ? d.topQueries : d.topPages).map((r) => (
                  <tr key={r.keys[0]}>
                    <td className="max-w-[22rem] truncate p-3" title={r.keys[0]}>
                      {section === "pages" ? path(r.keys[0]) : r.keys[0]}
                    </td>
                    <td className="font-data p-3 text-right">{nf.format(r.clicks)}</td>
                    <td className="font-data p-3 text-right">{nf.format(r.impressions)}</td>
                    <td className="font-data p-3 text-right">{(r.ctr * 100).toFixed(1)} %</td>
                    <td className="font-data p-3 text-right">{r.position.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
