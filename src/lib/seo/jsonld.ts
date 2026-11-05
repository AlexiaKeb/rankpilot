export type SchemaType =
  "Article" | "FAQPage" | "Product" | "Organization" | "LocalBusiness" | "BreadcrumbList";

export const SCHEMA_FIELDS: Record<
  SchemaType,
  { key: string; label: string; multiline?: boolean; placeholder?: string }[]
> = {
  Article: [
    { key: "headline", label: "Titre de l'article" },
    { key: "description", label: "Description", multiline: true },
    { key: "image", label: "URL de l'image" },
    { key: "author", label: "Auteur" },
    { key: "datePublished", label: "Date de publication", placeholder: "2026-01-31" },
    { key: "publisher", label: "Éditeur / site" },
  ],
  FAQPage: [
    {
      key: "qa",
      label: "Questions / réponses (une ligne « Question | Réponse »)",
      multiline: true,
      placeholder: "Quel est le délai ? | 3 à 5 jours",
    },
  ],
  Product: [
    { key: "name", label: "Nom du produit" },
    { key: "description", label: "Description", multiline: true },
    { key: "image", label: "URL de l'image" },
    { key: "brand", label: "Marque" },
    { key: "price", label: "Prix", placeholder: "49.90" },
    { key: "currency", label: "Devise", placeholder: "EUR" },
    { key: "availability", label: "Disponibilité", placeholder: "InStock" },
  ],
  Organization: [
    { key: "name", label: "Nom" },
    { key: "url", label: "Site web" },
    { key: "logo", label: "URL du logo" },
    { key: "sameAs", label: "Profils sociaux (une URL par ligne)", multiline: true },
  ],
  LocalBusiness: [
    { key: "name", label: "Nom de l'établissement" },
    { key: "url", label: "Site web" },
    { key: "telephone", label: "Téléphone" },
    { key: "streetAddress", label: "Adresse" },
    { key: "postalCode", label: "Code postal" },
    { key: "addressLocality", label: "Ville" },
    { key: "openingHours", label: "Horaires", placeholder: "Mo-Fr 09:00-18:00" },
  ],
  BreadcrumbList: [
    {
      key: "items",
      label: "Fil d'Ariane (une ligne « Nom | URL »)",
      multiline: true,
      placeholder: "Accueil | https://exemple.com",
    },
  ],
};

const lines = (v = "") =>
  v
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
const clean = <T extends Record<string, unknown>>(o: T): T =>
  Object.fromEntries(
    Object.entries(o).filter(
      ([, v]) => v !== "" && v != null && !(Array.isArray(v) && v.length === 0),
    ),
  ) as T;

export function buildJsonLd(type: SchemaType, v: Record<string, string>): Record<string, unknown> {
  const ctx = { "@context": "https://schema.org", "@type": type };
  switch (type) {
    case "Article":
      return clean({
        ...ctx,
        headline: v.headline,
        description: v.description,
        image: v.image,
        datePublished: v.datePublished,
        author: v.author ? { "@type": "Person", name: v.author } : undefined,
        publisher: v.publisher ? { "@type": "Organization", name: v.publisher } : undefined,
      });
    case "FAQPage":
      return {
        ...ctx,
        mainEntity: lines(v.qa).map((l) => {
          const [q, ...a] = l.split("|");
          return {
            "@type": "Question",
            name: q.trim(),
            acceptedAnswer: { "@type": "Answer", text: a.join("|").trim() },
          };
        }),
      };
    case "Product":
      return clean({
        ...ctx,
        name: v.name,
        description: v.description,
        image: v.image,
        brand: v.brand ? { "@type": "Brand", name: v.brand } : undefined,
        offers: v.price
          ? {
              "@type": "Offer",
              price: v.price,
              priceCurrency: v.currency || "EUR",
              availability: `https://schema.org/${v.availability || "InStock"}`,
            }
          : undefined,
      });
    case "Organization":
      return clean({ ...ctx, name: v.name, url: v.url, logo: v.logo, sameAs: lines(v.sameAs) });
    case "LocalBusiness":
      return clean({
        ...ctx,
        name: v.name,
        url: v.url,
        telephone: v.telephone,
        openingHours: v.openingHours,
        address: clean({
          "@type": "PostalAddress",
          streetAddress: v.streetAddress,
          postalCode: v.postalCode,
          addressLocality: v.addressLocality,
        }),
      });
    case "BreadcrumbList":
      return {
        ...ctx,
        itemListElement: lines(v.items).map((l, i) => {
          const [name, ...url] = l.split("|");
          return {
            "@type": "ListItem",
            position: i + 1,
            name: name.trim(),
            item: url.join("|").trim() || undefined,
          };
        }),
      };
  }
}

export function jsonLdScript(type: SchemaType, v: Record<string, string>): string {
  return `<script type="application/ld+json">\n${JSON.stringify(buildJsonLd(type, v), null, 2)}\n</script>`;
}
