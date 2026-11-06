import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Download,
  FilePlus2,
  Lightbulb,
  ListChecks,
  Loader2,
  PenLine,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ScoreRing } from "@/components/ScoreRing";
import { SerpPreview } from "@/components/SerpPreview";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  aiStatus,
  buildBrief,
  improveSnippet,
  suggestIdeas,
  writeDraft,
} from "@/lib/seo/ai.functions";
import { RichEditor } from "@/components/RichEditor";
import { mdToHtml } from "@/lib/seo/markdown";
import { countTodos, htmlToPage, normalizeContent } from "@/lib/seo/richtext";
import { htmlToMarkdown } from "@/lib/seo/richtext-export";
import { analyzeOnPage } from "@/lib/seo/optimizer";
import { BriefSchema, type Brief, type Idea } from "@/lib/seo/writing";

export const Route = createFileRoute("/_authenticated/writer")({
  head: () => ({ meta: [{ title: "Rédaction — RankPilot" }] }),
  component: Writer,
});

type Tab = "ideas" | "brief" | "draft" | "articles";
const onErr = (e: unknown) => toast.error(e instanceof Error ? e.message : "Erreur");
const input = "w-full rounded-md border bg-background px-3 py-2";
const btn =
  "flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-60";
const ghost =
  "flex items-center justify-center gap-1 rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50";

function Writer() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("ideas");
  const [projectId, setProjectId] = useState("");
  const [topic, setTopic] = useState("");
  const [keyword, setKeyword] = useState("");
  const [audience, setAudience] = useState("");
  const [brief, setBrief] = useState<Brief | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [articleId, setArticleId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [meta, setMeta] = useState("");
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState("");

  const status = useQuery({ queryKey: ["ai_status"], queryFn: () => aiStatus() });
  const projects = useQuery({
    queryKey: ["seo_projects"],
    queryFn: async () =>
      (
        await supabase
          .from("seo_projects")
          .select("id,name,domain")
          .order("created_at", { ascending: false })
      ).data ?? [],
  });
  useEffect(() => {
    if (!projectId && projects.data?.[0]) setProjectId(projects.data[0].id);
  }, [projects.data, projectId]);
  const project = projects.data?.find((p) => p.id === projectId);
  const aiOff = status.data && !status.data.configured;

  const articles = useQuery({
    queryKey: ["seo_articles"],
    queryFn: async () =>
      (
        await supabase
          .from("seo_articles")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(100)
      ).data ?? [],
  });

  const ideasM = useMutation({
    mutationFn: () => suggestIdeas({ data: { projectId, topic: topic || undefined } }),
    onSuccess: setIdeas,
    onError: onErr,
  });
  const briefM = useMutation({
    mutationFn: (kw: string) =>
      buildBrief({
        data: { keyword: kw, projectId: projectId || undefined, audience: audience || undefined },
      }),
    onSuccess: (b) => {
      setBrief(b);
      setTitle(b.titles[0] ?? "");
      setMeta(b.meta);
    },
    onError: onErr,
  });
  const draftM = useMutation({
    mutationFn: () => writeDraft({ data: { keyword, brief: brief!, notes: undefined } }),
    onSuccess: (r) => {
      setContent(mdToHtml(r.markdown));
      setArticleId(null);
      setTab("draft");
      toast.success("Brouillon prêt : complétez les passages entre crochets.");
    },
    onError: onErr,
  });
  const snippetM = useMutation({
    mutationFn: () => improveSnippet({ data: { keyword, title, meta } }),
    onError: onErr,
  });

  const save = useMutation({
    mutationFn: async (status: "idee" | "brouillon" | "publie" = "brouillon") => {
      const { data: u } = await supabase.auth.getUser();
      const row = {
        user_id: u.user!.id,
        project_id: projectId || null,
        title,
        keyword,
        meta_description: meta,
        brief: (brief as unknown as Json) ?? null,
        content,
        status,
        updated_at: new Date().toISOString(),
      };
      if (articleId) {
        const { error } = await supabase.from("seo_articles").update(row).eq("id", articleId);
        if (error) throw error;
        return articleId;
      }
      const { data, error } = await supabase.from("seo_articles").insert(row).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      setArticleId(id);
      qc.invalidateQueries({ queryKey: ["seo_articles"] });
      toast.success("Enregistré");
    },
    onError: onErr,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("seo_articles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seo_articles"] }),
  });

  // Note en direct du brouillon avec le même moteur que l'optimiseur de page
  const result = useMemo(() => {
    if (!content || !keyword) return null;
    const slug = (brief?.slug || keyword)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return analyzeOnPage(
      htmlToPage({ title, meta, html: content }),
      `https://${project?.domain ?? "exemple.fr"}/${slug}`,
      keyword,
    );
  }, [content, title, meta, keyword, brief, project]);
  const todo = result?.checks.filter((c) => c.status !== "pass").slice(0, 6) ?? [];
  const placeholders = countTodos(content);

  const copy = (what: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(""), 1500);
    });
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([htmlToMarkdown(content)], { type: "text/markdown;charset=utf-8" }),
    );
    a.download = `${(brief?.slug || keyword || "article").replace(/\s+/g, "-")}.md`;
    a.click();
  };
  const openBriefFor = (kw: string) => {
    setKeyword(kw);
    setTab("brief");
    briefM.mutate(kw);
  };
  const openArticle = (a: NonNullable<typeof articles.data>[number]) => {
    setArticleId(a.id);
    setTitle(a.title);
    setKeyword(a.keyword);
    setMeta(a.meta_description);
    setContent(normalizeContent(a.content));
    const b = BriefSchema.safeParse(a.brief);
    setBrief(b.success ? b.data : null);
    if (a.project_id) setProjectId(a.project_id);
    setTab("draft");
  };
  const newArticle = () => {
    setArticleId(null);
    setTitle("");
    setMeta("");
    setContent("");
    setBrief(null);
    setKeyword("");
    setTab("ideas");
  };

  return (
    <AppShell>
      <PageHeader eyebrow="Contenu" title="Rédaction">
        Des idées au brouillon : l'IA prépare, vous apportez votre expérience. Les passages entre
        crochets sont à compléter avec vos données réelles.
      </PageHeader>

      {aiOff && (
        <p className="mb-5 rounded-lg border border-warning p-3 text-sm text-warning">
          L'IA n'est pas encore activée sur ce serveur : ajoutez le secret{" "}
          <code>ANTHROPIC_API_KEY</code> dans les paramètres du Worker.
        </p>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <select
          className="rounded-md border bg-card px-3 py-2 text-sm"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          {projects.data?.length === 0 && <option value="">Aucun projet</option>}
          {projects.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.domain}
            </option>
          ))}
        </select>
        <button onClick={newArticle} className={ghost}>
          <FilePlus2 className="h-4 w-4" /> Nouvel article
        </button>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b">
        {(
          [
            ["ideas", "Idées", Lightbulb],
            ["brief", "Brief", ListChecks],
            ["draft", "Brouillon", PenLine],
            ["articles", `Mes articles (${articles.data?.length ?? 0})`, Save],
          ] as const
        ).map(([k, l, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? "border-primary" : "border-transparent text-muted-foreground"}`}
          >
            <Icon className="h-4 w-4" /> {l}
          </button>
        ))}
      </div>

      {tab === "ideas" && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ideasM.mutate();
            }}
            className="mb-6 flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row"
          >
            <input
              className={input}
              placeholder="Sujet ou activité (facultatif) : « chaudières à granulés »"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <button disabled={ideasM.isPending || !projectId || !!aiOff} className={btn}>
              {ideasM.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}{" "}
              Trouver des idées
            </button>
          </form>
          {ideas.length === 0 && !ideasM.isPending && (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Les idées tiennent compte des pages déjà présentes sur votre site (après un audit) et
              de vos mots-clés enregistrés.
            </p>
          )}
          <div className="space-y-3">
            {ideas.map((i) => (
              <div key={i.title} className="rounded-lg border bg-card p-4">
                <div className="font-medium">{i.title}</div>
                <div className="font-data mt-1 text-xs text-muted-foreground">
                  {i.keyword} · {i.intent}
                </div>
                {i.angle && (
                  <p className="mt-2 text-sm">
                    <span className="font-data text-xs uppercase text-primary">Angle </span>
                    {i.angle}
                  </p>
                )}
                {i.why && <p className="mt-1 text-sm text-muted-foreground">{i.why}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => openBriefFor(i.keyword)}
                    disabled={!!aiOff}
                    className={btn}
                  >
                    Créer le brief
                  </button>
                  <button
                    className={ghost}
                    onClick={async () => {
                      const { data: u } = await supabase.auth.getUser();
                      const { error } = await supabase.from("seo_articles").insert({
                        user_id: u.user!.id,
                        project_id: projectId || null,
                        title: i.title,
                        keyword: i.keyword,
                        status: "idee",
                      });
                      if (error) return onErr(error);
                      qc.invalidateQueries({ queryKey: ["seo_articles"] });
                      toast.success("Idée enregistrée");
                    }}
                  >
                    <Save className="h-4 w-4" /> Garder
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "brief" && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              keyword && briefM.mutate(keyword);
            }}
            className="mb-6 grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[1.2fr_1fr_auto]"
          >
            <input
              required
              className={input}
              placeholder="Mot-clé principal"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <input
              className={input}
              placeholder="Public visé (facultatif)"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            />
            <button disabled={briefM.isPending || !!aiOff} className={btn}>
              {briefM.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ListChecks className="h-4 w-4" />
              )}{" "}
              Générer
            </button>
          </form>
          {briefM.isPending && (
            <p className="text-muted-foreground">
              Analyse du sujet et des questions des internautes…
            </p>
          )}
          {brief && (
            <div className="space-y-6">
              <section className="rounded-lg border bg-card p-4">
                <h3 className="font-data mb-2 text-xs uppercase tracking-widest text-primary">
                  Titres proposés
                </h3>
                <ul className="space-y-1 text-sm">
                  {brief.titles.map((t) => (
                    <li key={t}>
                      <button className="text-left hover:text-primary" onClick={() => setTitle(t)}>
                        {t}{" "}
                        <span className="font-data text-xs text-muted-foreground">
                          ({t.length})
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <h3 className="font-data mb-1 mt-4 text-xs uppercase tracking-widest text-primary">
                  Meta description
                </h3>
                <p className="text-sm">
                  {brief.meta}{" "}
                  <span className="font-data text-xs text-muted-foreground">
                    ({brief.meta.length})
                  </span>
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  Intention : {brief.intent} · Lecteur : {brief.audience} · ~{brief.targetWords}{" "}
                  mots · schema : {brief.schema}
                </p>
              </section>
              <section>
                <h3 className="mb-2 font-display text-xl font-bold">Plan</h3>
                <div className="space-y-2">
                  {brief.outline.map((o) => (
                    <div key={o.h2} className="rounded-lg border bg-card p-4 text-sm">
                      <div className="font-medium">H2 · {o.h2}</div>
                      {o.points.length > 0 && (
                        <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                          {o.points.map((p) => (
                            <li key={p}>{p}</li>
                          ))}
                        </ul>
                      )}
                      {o.h3.length > 0 && (
                        <div className="font-data mt-2 text-xs text-muted-foreground">
                          H3 : {o.h3.join(" · ")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
              {brief.faq.length > 0 && (
                <section className="rounded-lg border bg-card p-4 text-sm">
                  <h3 className="mb-2 font-display text-xl font-bold">FAQ</h3>
                  <ul className="space-y-2">
                    {brief.faq.map((f) => (
                      <li key={f.q}>
                        <span className="font-medium">{f.q}</span>
                        {f.a && <span className="text-muted-foreground"> — {f.a}</span>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {brief.terms.length > 0 && (
                <section>
                  <h3 className="mb-2 font-display text-xl font-bold">Termes à couvrir</h3>
                  <div className="flex flex-wrap gap-2">
                    {brief.terms.map((t) => (
                      <span key={t} className="rounded-full border bg-card px-3 py-1 text-xs">
                        {t}
                      </span>
                    ))}
                  </div>
                </section>
              )}
              {brief.internalLinks.length > 0 && (
                <section className="rounded-lg border bg-card p-4 text-sm">
                  <h3 className="mb-2 font-display text-xl font-bold">Liens internes à placer</h3>
                  <ul className="space-y-1">
                    {brief.internalLinks.map((l) => (
                      <li key={l.url} className="break-all">
                        « {l.anchor} » →{" "}
                        <span className="font-data text-xs text-muted-foreground">{l.url}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {brief.experience.length > 0 && (
                <section className="rounded-lg border border-primary bg-card p-4 text-sm">
                  <h3 className="mb-2 font-display text-xl font-bold">
                    À apporter de votre expérience
                  </h3>
                  <p className="mb-2 text-muted-foreground">
                    C'est ce qui distingue votre article d'un texte générique, et ce que Google
                    cherche à valoriser.
                  </p>
                  <ul className="list-disc space-y-1 pl-5">
                    {brief.experience.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </section>
              )}
              <button
                onClick={() => draftM.mutate()}
                disabled={draftM.isPending || !!aiOff}
                className={btn}
              >
                {draftM.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PenLine className="h-4 w-4" />
                )}{" "}
                {draftM.isPending ? "Rédaction en cours (30 à 60 s)…" : "Rédiger le brouillon"}
              </button>
            </div>
          )}
        </>
      )}

      {tab === "draft" && (
        <>
          {!content && (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Aucun brouillon. Créez un brief puis cliquez sur « Rédiger le brouillon », ou ouvrez
              un article enregistré. Vous pouvez aussi coller votre propre texte ci-dessous pour le
              noter.
            </p>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="space-y-3">
              <input
                className={input}
                placeholder="Mot-clé principal"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
              <label className="block text-sm">
                Title{" "}
                <span className="font-data text-xs text-muted-foreground">{title.length}/60</span>
                <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="block text-sm">
                Meta description{" "}
                <span className="font-data text-xs text-muted-foreground">{meta.length}/160</span>
                <textarea
                  rows={2}
                  className={input}
                  value={meta}
                  onChange={(e) => setMeta(e.target.value)}
                />
              </label>
              <RichEditor
                value={content}
                onChange={setContent}
                placeholder="Écrivez votre article ici, ou générez un brouillon depuis un brief…"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => save.mutate("brouillon")}
                  disabled={save.isPending || !content}
                  className={btn}
                >
                  <Save className="h-4 w-4" /> Enregistrer
                </button>
                <button onClick={() => copy("md", htmlToMarkdown(content))} className={ghost}>
                  {copied === "md" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{" "}
                  Markdown
                </button>
                <button onClick={() => copy("html", content)} className={ghost}>
                  {copied === "html" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{" "}
                  HTML
                </button>
                <button onClick={download} disabled={!content} className={ghost}>
                  <Download className="h-4 w-4" /> .md
                </button>
              </div>
            </div>

            <aside className="space-y-5">
              {result ? (
                <>
                  <div className="flex items-center gap-4 rounded-lg border bg-card p-4">
                    <ScoreRing score={result.score} size={104} />
                    <div className="text-sm">
                      <div className="font-display text-lg font-bold">Score SEO du brouillon</div>
                      <div className="font-data text-xs text-muted-foreground">
                        {result.stats.wordCount} mots · densité {result.stats.density} %
                      </div>
                      {placeholders > 0 && (
                        <div className="mt-1 text-xs text-warning">
                          {placeholders} passage(s) à compléter
                        </div>
                      )}
                    </div>
                  </div>
                  {todo.length > 0 && (
                    <div className="rounded-lg border bg-card p-4 text-sm">
                      <h3 className="font-data mb-2 text-xs uppercase tracking-widest text-primary">
                        À améliorer
                      </h3>
                      <ul className="space-y-2">
                        {todo.map((c) => (
                          <li key={c.id}>
                            <span className="font-medium">{c.label}.</span>{" "}
                            <span className="text-muted-foreground">{c.fix}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div>
                    <h3 className="font-data mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                      Aperçu Google
                    </h3>
                    <SerpPreview {...result.serp} />
                  </div>
                </>
              ) : (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Saisissez un mot-clé et du texte pour voir la note en direct.
                </p>
              )}
              <div className="rounded-lg border bg-card p-4">
                <button
                  onClick={() => snippetM.mutate()}
                  disabled={snippetM.isPending || !keyword || !!aiOff}
                  className={ghost}
                >
                  {snippetM.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}{" "}
                  Variantes de title et meta (IA)
                </button>
                <div className="mt-3 space-y-2">
                  {snippetM.data?.map((v) => (
                    <button
                      key={v.title}
                      onClick={() => {
                        setTitle(v.title);
                        setMeta(v.meta);
                      }}
                      className="block w-full rounded-md border p-3 text-left text-sm hover:bg-accent"
                    >
                      <div className="font-medium">{v.title}</div>
                      <div className="text-muted-foreground">{v.meta}</div>
                      {v.angle && (
                        <div className="font-data mt-1 text-xs text-primary">{v.angle}</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </>
      )}

      {tab === "articles" && (
        <div className="divide-y overflow-hidden rounded-lg border bg-card text-sm">
          {articles.data?.length === 0 && (
            <p className="p-8 text-center text-muted-foreground">Aucun article enregistré.</p>
          )}
          {articles.data?.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3">
              <button
                className="min-w-0 flex-1 text-left hover:text-primary"
                onClick={() =>
                  a.content
                    ? openArticle(a)
                    : (setKeyword(a.keyword),
                      setProjectId(a.project_id ?? projectId),
                      openBriefFor(a.keyword))
                }
              >
                <div className="truncate font-medium">{a.title || a.keyword || "Sans titre"}</div>
                <div className="font-data text-xs text-muted-foreground">
                  {a.keyword} · {new Date(a.updated_at).toLocaleDateString("fr-FR")}
                </div>
              </button>
              <span className="font-data rounded bg-secondary px-2 py-0.5 text-xs">{a.status}</span>
              <button
                onClick={() => confirm("Supprimer cet article ?") && remove.mutate(a.id)}
                className="text-muted-foreground hover:text-danger"
                title="Supprimer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
