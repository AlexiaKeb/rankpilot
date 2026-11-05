import { createFileRoute, Link } from "@tanstack/react-router";
import { Gauge, Link2, ListChecks, SearchCheck } from "lucide-react";

export const Route = createFileRoute("/")({ component: Landing });

const features = [
  {
    icon: SearchCheck,
    t: "Audit technique",
    d: "Crawl de votre site : erreurs, redirections, doublons, pages orphelines, balisage.",
  },
  {
    icon: Gauge,
    t: "Score de santé",
    d: "Une note de 0 à 100 et la liste des problèmes classés par impact.",
  },
  {
    icon: ListChecks,
    t: "Corrections guidées",
    d: "Chaque problème est expliqué avec la marche à suivre pour le résoudre.",
  },
  {
    icon: Link2,
    t: "Bientôt",
    d: "Mots-clés, suivi de positions, éditeur de contenu IA, backlinks, visibilité dans les IA.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="font-display text-xl font-bold">
          Rank<span className="text-primary">Pilot</span>
        </span>
        <Link
          to="/auth"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Se connecter
        </Link>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h1 className="font-display text-4xl font-bold tracking-tight md:text-6xl">
          Trouvez ce qui freine votre référencement. Corrigez-le.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          RankPilot audite votre site comme Google le voit et vous donne un plan d'action priorisé
          pour gagner des positions.
        </p>
        <Link
          to="/auth"
          className="mt-8 inline-flex rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground"
        >
          Lancer mon premier audit
        </Link>
        <div className="mt-20 grid gap-4 text-left sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.t} className="rounded-xl border bg-card p-5">
              <f.icon className="h-5 w-5 text-primary" />
              <h2 className="mt-3 font-semibold">{f.t}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
