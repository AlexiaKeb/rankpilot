import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Bot, Check, Gauge, Loader2, Route as RouteIcon, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ScoreRing } from "@/components/ScoreRing";
import { aiReadiness, speedTest, traceHeaders } from "@/lib/seo/diagnostics.functions";

export const Route = createFileRoute("/_authenticated/diagnostics")({
  head: () => ({ meta: [{ title: "Diagnostics — RankPilot" }] }),
  component: Diagnostics,
});

type Tab = "speed" | "headers" | "ai";
const RATING_COLOR = {
  good: "var(--success)",
  ni: "var(--warning)",
  poor: "var(--danger)",
  na: "var(--muted-foreground)",
} as const;
const onErr = (e: unknown) => toast.error(e instanceof Error ? e.message : "Erreur");
const input = "min-w-0 flex-1 rounded-md border bg-background px-3 py-2";
const btn =
  "flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2 font-semibold text-primary-foreground disabled:opacity-60";

function Metric({
  label,
  value,
  rating,
}: {
  label: string;
  value: string;
  rating: keyof typeof RATING_COLOR;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="font-data text-[11px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 flex items-center gap-2 font-display text-2xl font-extrabold">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: RATING_COLOR[rating] }} />
        {value}
      </div>
    </div>
  );
}

function Speed() {
  const [url, setUrl] = useState("");
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const run = useMutation({
    mutationFn: () => speedTest({ data: { url, strategy } }),
    onError: onErr,
  });
  const r = run.data;
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run.mutate();
        }}
        className="mb-6 flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row"
      >
        <input
          required
          className={input}
          placeholder="https://monsite.fr"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <select
          className="rounded-md border bg-background px-3 py-2"
          value={strategy}
          onChange={(e) => setStrategy(e.target.value as "mobile" | "desktop")}
        >
          <option value="mobile">Mobile</option>
          <option value="desktop">Ordinateur</option>
        </select>
        <button disabled={run.isPending} className={btn}>
          {run.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Gauge className="h-4 w-4" />
          )}{" "}
          {run.isPending ? "Test en cours (30 s)…" : "Tester"}
        </button>
      </form>
      {r && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-4">
            {(
              [
                ["Performance", r.scores.performance],
                ["SEO", r.scores.seo],
                ["Accessibilité", r.scores.accessibility],
                ["Bonnes pratiques", r.scores.bestPractices],
              ] as const
            ).map(([l, s]) => (
              <div key={l} className="flex flex-col items-center rounded-lg border bg-card p-4">
                {s == null ? (
                  <span className="py-10 text-muted-foreground">—</span>
                ) : (
                  <ScoreRing score={s} size={96} />
                )}
                <div className="mt-2 text-sm">{l}</div>
              </div>
            ))}
          </div>
          <h2 className="mb-2 font-display text-xl font-bold">Mesures en laboratoire</h2>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {r.lab.map((m) => (
              <Metric key={m.label} {...m} />
            ))}
          </div>
          <h2 className="mb-2 font-display text-xl font-bold">
            Données réelles des visiteurs (Chrome UX)
          </h2>
          {r.field ? (
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {r.field.map((m) => (
                <Metric key={m.label} {...m} />
              ))}
            </div>
          ) : (
            <p className="mb-6 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Pas assez de trafic pour que Google publie des données réelles sur cette page.
            </p>
          )}
          {r.opportunities.length > 0 && (
            <>
              <h2 className="mb-2 font-display text-xl font-bold">Gains possibles</h2>
              <ul className="divide-y overflow-hidden rounded-lg border bg-card text-sm">
                {r.opportunities.map((o) => (
                  <li key={o.title} className="flex justify-between gap-4 px-4 py-3">
                    <span>{o.title}</span>
                    <span className="font-data text-muted-foreground">
                      −{(o.savingsMs / 1000).toFixed(1)} s
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </>
  );
}

function Headers() {
  const [url, setUrl] = useState("");
  const run = useMutation({ mutationFn: () => traceHeaders({ data: { url } }), onError: onErr });
  const r = run.data;
  const color = (s: number) =>
    s >= 400 ? "text-danger" : s >= 300 ? "text-warning" : "text-success";
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run.mutate();
        }}
        className="mb-6 flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row"
      >
        <input
          required
          className={input}
          placeholder="http://monsite.fr (testez aussi la version sans https)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button disabled={run.isPending} className={btn}>
          {run.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RouteIcon className="h-4 w-4" />
          )}{" "}
          Analyser
        </button>
      </form>
      {r && (
        <>
          {r.error && (
            <p className="mb-4 rounded-lg border border-danger p-4 text-sm text-danger">
              {r.error}
            </p>
          )}
          <h2 className="mb-2 font-display text-xl font-bold">Chaîne de redirections</h2>
          <ol className="mb-6 divide-y overflow-hidden rounded-lg border bg-card text-sm">
            {[
              ...r.hops,
              ...(r.final
                ? [
                    {
                      url: r.final.url,
                      status: r.final.status,
                      ms: r.final.ms,
                      location: undefined,
                    },
                  ]
                : []),
            ].map((h, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <span className={`font-data w-10 font-bold ${color(h.status)}`}>{h.status}</span>
                <span className="min-w-0 flex-1 break-all">{h.url}</span>
                <span className="font-data text-xs text-muted-foreground">{h.ms} ms</span>
              </li>
            ))}
          </ol>
          {r.hops.length > 1 && (
            <p className="mb-6 rounded-lg border border-warning bg-card p-4 text-sm">
              {r.hops.length} redirections successives : chaque saut ralentit le chargement et dilue
              le jus de lien. Visez une seule redirection (301) vers l'URL finale.
            </p>
          )}
          {r.hops.some((h) => h.status === 302 || h.status === 307) && (
            <p className="mb-6 rounded-lg border border-warning bg-card p-4 text-sm">
              Redirection temporaire (302/307) détectée : si elle est permanente, utilisez un 301 ou
              308.
            </p>
          )}
          {r.final && (
            <>
              <h2 className="mb-2 font-display text-xl font-bold">En-têtes utiles au SEO</h2>
              <div className="divide-y overflow-hidden rounded-lg border bg-card text-sm">
                {Object.entries(r.final.headers).map(([k, v]) => (
                  <div key={k} className="flex gap-4 px-4 py-2.5">
                    <span className="font-data w-48 shrink-0 text-muted-foreground">{k}</span>
                    <span className="min-w-0 break-all">{v}</span>
                  </div>
                ))}
                {!r.final.headers["strict-transport-security"] && (
                  <div className="px-4 py-2.5 text-warning">
                    HSTS absent : ajoutez Strict-Transport-Security pour forcer HTTPS.
                  </div>
                )}
                {!r.final.headers["content-encoding"] && (
                  <div className="px-4 py-2.5 text-warning">
                    Aucune compression (gzip/brotli) détectée.
                  </div>
                )}
                {r.final.headers["x-robots-tag"]?.includes("noindex") && (
                  <div className="px-4 py-2.5 text-danger">
                    En-tête noindex : la page est exclue de Google.
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

function AiTab() {
  const [domain, setDomain] = useState("");
  const run = useMutation({ mutationFn: () => aiReadiness({ data: { domain } }), onError: onErr });
  const r = run.data;
  const Flag = ({ ok }: { ok: boolean }) =>
    ok ? <Check className="h-4 w-4 text-success" /> : <X className="h-4 w-4 text-danger" />;
  const blockedSearch = r?.bots.filter((b) => !b.allowed && b.purpose !== "entraînement") ?? [];
  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Vérifiez si les robots des moteurs de réponse IA (ChatGPT, Claude, Perplexity, Gemini)
        peuvent lire votre site. Bloquer les robots de <em>recherche</em> vous rend invisible dans
        leurs réponses ; bloquer ceux d'<em>entraînement</em> est un choix éditorial.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run.mutate();
        }}
        className="mb-6 flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row"
      >
        <input
          required
          className={input}
          placeholder="monsite.fr"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        />
        <button disabled={run.isPending} className={btn}>
          {run.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Bot className="h-4 w-4" />
          )}{" "}
          Vérifier
        </button>
      </form>
      {r && (
        <>
          {blockedSearch.length > 0 && (
            <p className="mb-4 rounded-lg border border-danger bg-card p-4 text-sm text-danger">
              Ces robots de recherche IA sont bloqués : {blockedSearch.map((b) => b.ua).join(", ")}.
              Votre site ne peut pas être cité par eux.
            </p>
          )}
          <div className="mb-6 divide-y overflow-hidden rounded-lg border bg-card text-sm">
            {r.bots.map((b) => (
              <div key={b.ua} className="flex items-center gap-3 px-4 py-2.5">
                <Flag ok={b.allowed} />
                <span className="font-data w-44">{b.ua}</span>
                <span className="flex-1 text-muted-foreground">{b.vendor}</span>
                <span className="text-xs text-muted-foreground">{b.purpose}</span>
              </div>
            ))}
          </div>
          <div className="divide-y overflow-hidden rounded-lg border bg-card text-sm">
            <div className="flex items-center gap-3 px-4 py-2.5">
              <Flag ok={r.robotsFound} /> robots.txt{" "}
              {r.robotsFound ? "présent" : "introuvable (tout est autorisé par défaut)"}
            </div>
            <div className="flex items-center gap-3 px-4 py-2.5">
              <Flag ok={r.llmsTxt} /> llms.txt{" "}
              {r.llmsTxt
                ? "présent"
                : "absent : générez-le depuis l'onglet « llms.txt » d'un audit"}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Diagnostics() {
  const [tab, setTab] = useState<Tab>("speed");
  return (
    <AppShell>
      <PageHeader eyebrow="Diagnostics" title="Vitesse, redirections, moteurs IA">
        Trois contrôles rapides sur n'importe quelle URL de votre site.
      </PageHeader>
      <div className="mb-6 flex gap-1 border-b">
        {(
          [
            ["speed", "Vitesse & Core Web Vitals"],
            ["headers", "Redirections & en-têtes"],
            ["ai", "Visibilité IA"],
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
      {tab === "speed" && <Speed />}
      {tab === "headers" && <Headers />}
      {tab === "ai" && <AiTab />}
    </AppShell>
  );
}
