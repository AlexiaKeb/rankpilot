import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SerpPreview } from "@/components/SerpPreview";
import { SCHEMA_FIELDS, jsonLdScript, type SchemaType } from "@/lib/seo/jsonld";

export const Route = createFileRoute("/outils")({
  head: () => ({
    meta: [
      { title: "Outils SEO gratuits — RankPilot" },
      {
        name: "description",
        content:
          "Aperçu de résultat Google et générateur de données structurées JSON-LD, gratuits.",
      },
    ],
  }),
  component: Tools,
});

function SerpTool() {
  const [v, setV] = useState({ title: "", url: "https://exemple.fr/ma-page", description: "" });
  const field = "w-full rounded-md border bg-background px-3 py-2";
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <label className="block text-sm">
          Title <span className="font-data text-xs text-muted-foreground">{v.title.length}/60</span>
          <input
            className={field}
            value={v.title}
            onChange={(e) => setV({ ...v, title: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          URL
          <input
            className={field}
            value={v.url}
            onChange={(e) => setV({ ...v, url: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          Meta description{" "}
          <span className="font-data text-xs text-muted-foreground">
            {v.description.length}/160
          </span>
          <textarea
            rows={4}
            className={field}
            value={v.description}
            onChange={(e) => setV({ ...v, description: e.target.value })}
          />
        </label>
      </div>
      <div>
        <p className="mb-2 text-sm text-muted-foreground">Aperçu</p>
        <SerpPreview {...v} />
      </div>
    </div>
  );
}

function JsonLdTool() {
  const [type, setType] = useState<SchemaType>("FAQPage");
  const [values, setValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const out = jsonLdScript(type, values);
  const field = "w-full rounded-md border bg-background px-3 py-2";
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <select
          className={field}
          value={type}
          onChange={(e) => {
            setType(e.target.value as SchemaType);
            setValues({});
          }}
        >
          {(Object.keys(SCHEMA_FIELDS) as SchemaType[]).map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        {SCHEMA_FIELDS[type].map((f) => (
          <label key={f.key} className="block text-sm">
            {f.label}
            {f.multiline ? (
              <textarea
                rows={4}
                className={field}
                placeholder={f.placeholder}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            ) : (
              <input
                className={field}
                placeholder={f.placeholder}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            )}
          </label>
        ))}
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
          Code à coller dans le &lt;head&gt;
          <button
            onClick={() => {
              navigator.clipboard.writeText(out);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} Copier
          </button>
        </div>
        <pre className="font-data max-h-[28rem] overflow-auto rounded-lg border bg-card p-4 text-xs">
          {out}
        </pre>
      </div>
    </div>
  );
}

function Tools() {
  const [tab, setTab] = useState<"serp" | "jsonld">("serp");
  return (
    <div className="bg-grid min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link to="/">
          <Logo />
        </Link>
        <Link
          to="/auth"
          className="rounded-md border border-border-strong px-4 py-2 text-sm font-medium hover:border-primary"
        >
          Se connecter
        </Link>
      </header>
      <main className="mx-auto max-w-5xl px-6 pb-16">
        <p className="font-data mb-2 text-xs uppercase tracking-[0.2em] text-primary">Gratuit</p>
        <h1 className="font-display text-4xl font-extrabold">Outils SEO</h1>
        <div className="my-6 flex gap-2">
          {(
            [
              ["serp", "Aperçu Google"],
              ["jsonld", "Générateur JSON-LD"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-md border px-4 py-2 text-sm ${tab === k ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="rounded-xl border bg-card p-6">
          {tab === "serp" ? <SerpTool /> : <JsonLdTool />}
        </div>
      </main>
    </div>
  );
}
