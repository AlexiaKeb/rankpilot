import { Link } from "@tanstack/react-router";
import { FolderKanban, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="flex items-center justify-between border-b bg-surface px-5 py-4 md:sticky md:top-0 md:h-screen md:flex-col md:items-stretch md:justify-start md:gap-8 md:border-b-0 md:border-r md:py-6">
        <Link to="/projects">
          <Logo />
        </Link>
        <nav className="flex gap-1 md:flex-col">
          <Link
            to="/projects"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
            activeProps={{ className: "bg-accent text-foreground" }}
          >
            <FolderKanban className="h-4 w-4" /> Projets
          </Link>
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
