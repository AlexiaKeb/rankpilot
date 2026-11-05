import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Loader2, Search, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { suggestKeywords } from "@/lib/seo/tools.functions";
import type { Intent } from "@/lib/seo/keywords";

export const Route = createFileRoute("/_authenticated/keywords")({
  head: () => ({ meta: [{ title: "Mots-clés — RankPilot" }] }),
  component: Keywords,
});

const INTENT_STYLE: Record<Intent, string> = {
  informationnelle: "bg-sky-100 text-sky-800",
  commerciale: "bg-amber-100 text-amber-800",
  transactionnelle: "bg-emerald-100 text-emerald-800",
  navigationnelle: "bg-zinc-200 text-zinc-700",
};

function toCsv(rows: { keyword: string; intent: string; cluster: string | null }[]) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return [
    "mot-clé,intention,groupe",
    ...rows.map((r) => [esc(r.keyword), r.intent, esc(r.cluster ?? "")].join(",")),
  ].join("\n");
}
function download(name: string, content: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
}

function Keywords() {
  const qc = useQueryClient();
  const [seed, setSeed] = useState("");
  const [lang, setLang] = useState<"fr" | "en">("fr");
  const [filter, setFilter] = useState<Intent | "all">("all");

  const ideas = useMutation({
    mutationFn: () => suggestKeywords({ data: { seed, lang } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Recherche impossible"),
  });
  const saved = useQuery({
    queryKey: ["seo_keywords"],
    queryFn: async () =>
      (
        await supabase
          .from("seo_keywords")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1000)
      ).data ?? [],
  });
  const savedSet = new Set((saved.data ?? []).map((k) => k.keyword.toLowerCase()));

  const save = useMutation({
    mutationFn: async (rows: { keyword: string; intent: string; cluster: string | null }[]) => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user!.id;
      const { error } = await supabase.from("seo_keywords").upsert(
        rows.map((r) => ({ ...r, user_id: uid })),
        { onConflict: "user_id,keyword", ignoreDuplicates: true },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seo_keywords"] });
      toast.success("Ajouté à vos mots-clés");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Enregistrement impossible"),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("seo_keywords").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seo_keywords"] }),
  });

  const clusterOf = new Map<string, string>();
  ideas.data?.clusters.forEach((c) => c.keywords.forEach((k) => clusterOf.set(k, c.head)));
  const items = (ideas.data?.items ?? []).filter((i) => filter === "all" || i.intent === filter);

  return (
    <AppShell>
      <PageHeader eyebrow="Recherche" title="Mots-clés">
        Trouvez des idées à partir d'un sujet : suggestions réelles de recherche, classées par
        intention et regroupées par thème. Les volumes de recherche arriveront avec une source de
        données dédiée.
      </PageHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ideas.mutate();
        }}
        className="mb-6 flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row"
      >
        <input
          required
          minLength={2}
          className="flex-1 rounded-md border bg-background px-3 py-2"
          placeholder="Votre sujet : « agent immobilier », « chaudière »…"
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
        />
        <select
          className="rounded-md border bg-background px-3 py-2"
          value={lang}
          onChange={(e) => setLang(e.target.value as "fr" | "en")}
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
        <button
          disabled={ideas.isPending}
          className="flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2 font-semibold text-primary-foreground disabled:opacity-60"
        >
          {ideas.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}{" "}
          Chercher
        </button>
      </form>

      {ideas.data && (
        <section className="mb-10">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="mr-auto font-display text-2xl font-bold">{ideas.data.total} idées</h2>
            {(
              [
                "all",
                "informationnelle",
                "commerciale",
                "transactionnelle",
                "navigationnelle",
              ] as const
            ).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-3 py-1 text-xs ${filter === f ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
              >
                {f === "all" ? "Toutes" : f}
              </button>
            ))}
            <button
              onClick={() =>
                save.mutate(
                  items.map((i) => ({
                    keyword: i.keyword,
                    intent: i.intent,
                    cluster: clusterOf.get(i.keyword) ?? null,
                  })),
                )
              }
              className="flex items-center gap-1 rounded-md border px-3 py-1 text-xs hover:bg-accent"
            >
              <Star className="h-3 w-3" /> Tout enregistrer
            </button>
          </div>
          {ideas.data.total === 0 && (
            <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              Aucune suggestion trouvée. Essayez un sujet plus courant.
            </p>
          )}
          <div className="divide-y overflow-hidden rounded-lg border bg-card">
            {items.map((i) => (
              <div key={i.keyword} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="flex-1">{i.keyword}</span>
                <span className="font-data hidden text-xs text-muted-foreground sm:inline">
                  {clusterOf.get(i.keyword)}
                </span>
                <span className={`rounded px-2 py-0.5 text-xs ${INTENT_STYLE[i.intent]}`}>
                  {i.intent}
                </span>
                <button
                  disabled={savedSet.has(i.keyword.toLowerCase())}
                  onClick={() =>
                    save.mutate([
                      {
                        keyword: i.keyword,
                        intent: i.intent,
                        cluster: clusterOf.get(i.keyword) ?? null,
                      },
                    ])
                  }
                  title="Enregistrer"
                  className="text-muted-foreground hover:text-primary disabled:text-primary"
                >
                  <Star
                    className={`h-4 w-4 ${savedSet.has(i.keyword.toLowerCase()) ? "fill-current" : ""}`}
                  />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">
            Mes mots-clés ({saved.data?.length ?? 0})
          </h2>
          {!!saved.data?.length && (
            <button
              onClick={() => download("mots-cles.csv", toCsv(saved.data!))}
              className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
            >
              <Download className="h-4 w-4" /> Export CSV
            </button>
          )}
        </div>
        {saved.data?.length === 0 && (
          <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            Étoilez des idées pour constituer votre liste de travail.
          </p>
        )}
        <div className="divide-y overflow-hidden rounded-lg border bg-card">
          {saved.data?.map((k) => (
            <div key={k.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="flex-1">{k.keyword}</span>
              <span className="font-data hidden text-xs text-muted-foreground sm:inline">
                {k.cluster}
              </span>
              <span
                className={`rounded px-2 py-0.5 text-xs ${INTENT_STYLE[k.intent as Intent] ?? INTENT_STYLE.informationnelle}`}
              >
                {k.intent}
              </span>
              <button
                onClick={() => remove.mutate(k.id)}
                className="text-muted-foreground hover:text-danger"
                title="Supprimer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
