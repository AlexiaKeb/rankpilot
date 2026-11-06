import { Link } from "@tanstack/react-router";
import { Activity, FolderKanban, LogOut, ScanSearch, TextSearch, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";

const NAV = [
  { to: "/projects", label: "Projets", icon: FolderKanban },
  { to: "/optimizer", label: "Optimiseur de page", icon: ScanSearch },
  { to: "/keywords", label: "Mots-clés", icon: TextSearch },
  { to: "/diagnostics", label: "Diagnostics", icon: Activity },
  { to: "/outils", label: "Outils gratuits", icon: Wrench },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[230px_1fr]">
      <aside className="flex flex-wrap items-center justify-between gap-2 border-b bg-surface px-5 py-4 md:sticky md:top-0 md:h-screen md:flex-col md:flex-nowrap md:items-stretch md:justify-start md:gap-8 md:border-b-0 md:border-r md:py-6">
        <Link to="/projects">
          <Logo />
        </Link>
        <nav className="order-3 flex w-full gap-1 overflow-x-auto whitespace-nowrap md:order-none md:w-auto md:flex-col md:overflow-visible">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
              activeProps={{ className: "bg-accent text-foreground" }}
            >
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          ))}
        </nav>
        <button
          onClick={() => supabase.auth.signOut().then(() => (window.location.href = "/"))}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground md:mt-auto"
        >
          <LogOut className="h-4 w-4" /> Déconnexion
        </button>
      </aside>
      <main className="min-w-0 px-5 py-8 md:px-10 md:py-10">
        <div className="mx-auto max-w-4xl">{children}</div>
      </main>
    </div>
  );
}
