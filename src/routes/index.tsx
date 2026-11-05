import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Gauge, Link2, ListChecks, SearchCheck } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ScoreRing } from "@/components/ScoreRing";

export const Route = createFileRoute("/")({ component: Landing });

const features = [
  {
    icon: SearchCheck,
    t: "Audit technique",
    d: "Crawl complet : erreurs, redirections, doublons, pages orphelines, balisage.",
  },
  {
    icon: Gauge,
    t: "Score de santé",
    d: "Une note de 0 à 100 et les problèmes classés par impact réel.",
  },
  {
    icon: ListChecks,
    t: "Corrections guidées",
    d: "Chaque anomalie expliquée avec la marche à suivre pour la résoudre.",
  },
  {
    icon: Link2,
    t: "En route",
    d: "Mots-clés, positions, éditeur de contenu IA, backlinks, visibilité dans les IA.",
  },
];

const sample = [
  ["Critique", "var(--danger)", "Lien interne cassé", "5"],
  ["Alerte", "var(--warning)", "Meta description manquante", "9"],
  ["Info", "var(--muted-foreground)", "Images sans attribut alt", "14"],
];

function Landing() {
  return (
    <div className="bg-grid min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo />
        <Link
          to="/auth"
          className="rounded-md border border-border-strong px-4 py-2 text-sm font-medium transition hover:border-primary hover:text-primary"
        >
          Se connecter
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="grid items-center gap-12 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
          <div>
            <p className="font-data mb-5 text-xs uppercase tracking-[0.2em] text-primary">
              Audit SEO · Plan d'action
            </p>
            <h1 className="font-display text-5xl font-extrabold leading-[1.02] md:text-7xl">
              Voyez ce que Google voit.
              <span className="relative isolate mt-1 inline-block text-primary">
                <span className="absolute inset-x-0 bottom-1 -z-10 h-4 bg-highlight/70" />
                Corrigez ce qui bloque.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              RankPilot explore votre site comme un moteur de recherche et transforme chaque défaut
              en tâche priorisée, avec la correction à appliquer.
            </p>
            <Link
              to="/auth"
              className="mt-8 inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:brightness-110"
            >
              Lancer mon premier audit <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="rounded-xl border bg-card p-6 shadow-[0_20px_50px_-24px_rgb(22_35_27/0.25)]">
            <div className="flex items-center gap-6">
              <ScoreRing score={74} size={140} />
              <div>
                <div className="font-data text-xs uppercase tracking-widest text-muted-foreground">
                  boutique-demo.fr
                </div>
                <div className="mt-1 font-display text-2xl font-bold">47 pages analysées</div>
              </div>
            </div>
            <ul className="mt-6 divide-y divide-border">
              {sample.map(([label, color, title, n]) => (
                <li key={title} className="flex items-center gap-3 py-3 text-sm">
                  <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                  <span className="font-data w-16 text-xs uppercase text-muted-foreground">
                    {label}
                  </span>
                  <span className="flex-1">{title}</span>
                  <span className="font-data text-muted-foreground">{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="grid gap-px overflow-hidden rounded-xl border bg-border pb-0 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.t} className="bg-card p-6">
              <f.icon className="h-5 w-5 text-primary" />
              <h2 className="mt-4 font-semibold">{f.t}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </section>
        <footer className="font-data py-12 text-center text-xs text-muted-foreground">
          © RankPilot
        </footer>
      </main>
    </div>
  );
}
