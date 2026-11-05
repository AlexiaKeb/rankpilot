// Aperçu d'un résultat Google (bureau + mobile), avec troncature approximative.
export function SerpPreview({
  title,
  url,
  description,
}: {
  title: string;
  url: string;
  description: string;
}) {
  let host = url;
  let path = "";
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    host = u.hostname;
    path = u.pathname.replace(/\/$/, "").split("/").filter(Boolean).join(" › ");
  } catch {
    /* garde la valeur brute */
  }
  const t = title.length > 60 ? `${title.slice(0, 58)}…` : title;
  const d = description.length > 160 ? `${description.slice(0, 158)}…` : description;
  return (
    <div className="rounded-lg border bg-white p-4 font-sans" style={{ color: "#202124" }}>
      <div className="text-sm" style={{ color: "#4d5156" }}>
        {host}
        {path && ` › ${path}`}
      </div>
      <div className="mt-1 text-xl leading-snug" style={{ color: "#1a0dab" }}>
        {t || "Titre de la page"}
      </div>
      <div className="mt-1 text-sm" style={{ color: "#4d5156" }}>
        {d || "La meta description apparaîtra ici."}
      </div>
    </div>
  );
}
