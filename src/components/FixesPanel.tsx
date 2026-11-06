import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Check, Copy, Download, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { improveSnippet } from "@/lib/seo/ai.functions";
import { FIX_META, fixesToCsv, fixesToMarkdown, type Fix, type FixKind } from "@/lib/seo/fixes";

const KIND_ORDER: FixKind[] = [
  "title",
  "meta",
  "h1",
  "alt",
  "schema",
  "canonical",
  "robots",
  "sitemap",
  "viewport",
  "lang",
];

function CopyButton({ text, label = "Copier" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard.writeText(text).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        })
      }
      className="flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs hover:bg-accent"
    >
      {ok ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{" "}
      {ok ? "Copié" : label}
    </button>
  );
}

function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  a.download = name;
  a.click();
}

function FixCard({ fix }: { fix: Fix }) {
  const ai = useMutation({
    mutationFn: () =>
      improveSnippet({
        data: {
          keyword: fix.seed || fix.label.replace(/[/-]+/g, " ").trim() || "page",
          title: fix.kind === "title" ? fix.suggested : "",
          meta: fix.kind === "meta" ? fix.suggested : "",
        },
      }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });
  const code = fix.format !== "texte";
  return (
    <div className="rounded-lg border bg-card p-4 text-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="font-data min-w-0 break-all text-xs text-muted-foreground">
          {fix.label}
        </span>
        <div className="flex shrink-0 gap-1.5">
          {fix.kind === "robots" && (
            <button
              onClick={() => download("robots.txt", fix.suggested, "text/plain")}
              className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs hover:bg-accent"
            >
              <Download className="h-3.5 w-3.5" /> .txt
            </button>
          )}
          {fix.kind === "sitemap" && (
            <button
              onClick={() => download("sitemap.xml", fix.suggested, "application/xml")}
              className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs hover:bg-accent"
            >
              <Download className="h-3.5 w-3.5" /> .xml
            </button>
          )}
          <CopyButton text={fix.suggested} />
        </div>
      </div>
      {fix.current && (
        <p className="mb-2 text-muted-foreground">
          <span className="font-data mr-1 text-[11px] uppercase">Actuel</span>
          <span className="whitespace-pre-line line-through decoration-muted-foreground/40">
            {fix.current}
          </span>
        </p>
      )}
      {code ? (
        <pre className="font-data max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
          {fix.suggested}
        </pre>
      ) : (
        <p className="whitespace-pre-line rounded-md bg-accent/60 p-3 font-medium">
          {fix.suggested}
        </p>
      )}
      {fix.note && <p className="mt-2 text-xs text-muted-foreground">{fix.note}</p>}
      {(fix.kind === "title" || fix.kind === "meta") && (
        <div className="mt-3">
          <button
            onClick={() => ai.mutate()}
            disabled={ai.isPending}
            className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
          >
            {ai.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}{" "}
            Variantes optimisées (IA)
          </button>
          <div className="mt-2 space-y-2">
            {ai.data?.map((v) => (
              <div key={v.title} className="flex items-start gap-2 rounded-md border p-2">
                <div className="min-w-0 flex-1 text-xs">
                  <div className="font-medium">{fix.kind === "title" ? v.title : v.meta}</div>
                  {v.angle && <div className="font-data mt-0.5 text-primary">{v.angle}</div>}
                </div>
                <CopyButton text={fix.kind === "title" ? v.title : v.meta} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function FixesPanel({
  fixes,
  missingData,
  siteName,
}: {
  fixes: Fix[];
  missingData: boolean;
  siteName: string;
}) {
  const [kind, setKind] = useState<FixKind | "all">("all");
  const counts = useMemo(() => {
    const m = new Map<FixKind, number>();
    for (const f of fixes) m.set(f.kind, (m.get(f.kind) ?? 0) + 1);
    return m;
  }, [fixes]);
  const kinds = KIND_ORDER.filter((k) => counts.has(k));
  const shown = fixes.filter((f) => kind === "all" || f.kind === kind);

  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">
        Corrections calculées à partir du contenu réel de vos pages : copiez-les dans votre site.
        Relisez-les avant de publier ; elles améliorent les bases techniques, mais aucune correction
        ne garantit un classement.
      </p>
      {missingData && (
        <p className="mb-3 rounded-lg border border-warning p-3 text-sm text-warning">
          Cet audit date d'avant cette fonction : relancez l'audit pour obtenir aussi les meta
          descriptions et textes alternatifs suggérés.
        </p>
      )}
      {fixes.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => download("corrections-seo.csv", fixesToCsv(fixes), "text/csv")}
            className="flex items-center gap-1 rounded-md border px-3 py-2 text-sm hover:bg-accent"
          >
            <Download className="h-4 w-4" /> Exporter en CSV
          </button>
          <button
            onClick={() =>
              download("corrections-seo.md", fixesToMarkdown(fixes, siteName), "text/markdown")
            }
            className="flex items-center gap-1 rounded-md border px-3 py-2 text-sm hover:bg-accent"
          >
            <Download className="h-4 w-4" /> Brief pour un développeur (.md)
          </button>
        </div>
      )}
      {fixes.length === 0 && (
        <p className="rounded-lg border bg-card p-6 text-success">
          Aucune correction à proposer : les bases techniques sont en place.
        </p>
      )}
      {kinds.length > 0 && (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {(["all", ...kinds] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs ${kind === k ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent"}`}
            >
              {k === "all" ? `Tout (${fixes.length})` : `${FIX_META[k].title} (${counts.get(k)})`}
            </button>
          ))}
        </div>
      )}
      {(kind === "all" ? kinds : [kind]).map((k) => (
        <section key={k} className="mb-8">
          <h3 className="font-display text-xl font-bold">{FIX_META[k].title}</h3>
          <p className="mb-3 text-xs text-muted-foreground">Où l'appliquer : {FIX_META[k].where}</p>
          <div className="space-y-3">
            {shown
              .filter((f) => f.kind === k)
              .map((f) => (
                <FixCard key={f.id} fix={f} />
              ))}
          </div>
        </section>
      ))}
    </>
  );
}
