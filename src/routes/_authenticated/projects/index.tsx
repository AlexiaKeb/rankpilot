import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Globe, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { createProject } from "@/lib/seo/audit.functions";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({ meta: [{ title: "Mes projets — RankPilot" }] }),
  component: Projects,
});

function Projects() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const projects = useQuery({
    queryKey: ["seo_projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seo_projects")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const add = useMutation({
    mutationFn: () => createProject({ data: { name: name || domain, domain } }),
    onSuccess: () => {
      setName("");
      setDomain("");
      qc.invalidateQueries({ queryKey: ["seo_projects"] });
      toast.success("Projet créé");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  return (
    <AppShell>
      <div className="mb-8">
        <p className="font-data mb-2 text-xs uppercase tracking-[0.2em] text-primary">
          Espace de travail
        </p>
        <h1 className="font-display text-4xl font-extrabold">Mes projets</h1>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
        className="mb-8 flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row"
      >
        <input
          className="flex-1 rounded-md border bg-background px-3 py-2"
          placeholder="Nom (optionnel)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          required
          className="flex-1 rounded-md border bg-background px-3 py-2"
          placeholder="exemple.com"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        />
        <button
          disabled={add.isPending}
          className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60"
        >
          {add.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}{" "}
          Ajouter
        </button>
      </form>
      {projects.isLoading && <p className="text-muted-foreground">Chargement…</p>}
      {projects.data?.length === 0 && (
        <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          Ajoutez votre premier site pour lancer un audit.
        </p>
      )}
      <div className="grid gap-3">
        {projects.data?.map((p) => (
          <Link
            key={p.id}
            to="/projects/$projectId"
            params={{ projectId: p.id }}
            className="flex items-center gap-3 rounded-lg border bg-card p-4 transition hover:border-primary"
          >
            <Globe className="h-5 w-5 text-primary" />
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="text-sm text-muted-foreground">{p.domain}</div>
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
