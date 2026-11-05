// Catalogue des règles d'audit : sévérité, catégorie, explication et correction guidée.
export type Severity = "critical" | "warning" | "notice";
export type Category =
  | "indexability"
  | "on-page"
  | "content"
  | "links"
  | "performance"
  | "structured-data"
  | "international"
  | "security";

export interface Rule {
  code: string;
  severity: Severity;
  category: Category;
  title: string;
  why: string;
  fix: string;
}

// Seuils configurables (les valeurs usuelles du secteur ; à confronter à la doc Google).
export const THRESHOLDS = {
  titleMin: 30,
  titleMax: 60,
  metaMin: 70,
  metaMax: 160,
  thinContentWords: 300,
  slowResponseMs: 1500,
  maxDepth: 4,
  maxUrlLength: 115,
  maxLinksPerPage: 300,
  maxHtmlBytes: 1_500_000,
} as const;

const r = (rule: Rule) => rule;

export const RULES: Record<string, Rule> = Object.fromEntries(
  [
    r({
      code: "http_5xx",
      severity: "critical",
      category: "indexability",
      title: "Erreur serveur (5xx)",
      why: "Googlebot ne peut pas lire la page : elle sort de l'index si l'erreur persiste.",
      fix: "Corrigez l'erreur serveur ou la config de l'hébergement ; surveillez les logs.",
    }),
    r({
      code: "http_4xx",
      severity: "critical",
      category: "indexability",
      title: "Page introuvable (4xx)",
      why: "Des liens pointent vers une page cassée : budget de crawl gaspillé et mauvaise expérience.",
      fix: "Restaurez la page, redirigez-la en 301 vers l'équivalent, ou supprimez les liens entrants.",
    }),
    r({
      code: "fetch_failed",
      severity: "critical",
      category: "indexability",
      title: "Page injoignable",
      why: "Timeout ou erreur réseau lors du crawl.",
      fix: "Vérifiez la disponibilité et les temps de réponse du serveur.",
    }),
    r({
      code: "redirect_chain",
      severity: "warning",
      category: "indexability",
      title: "Redirection (3xx) suivie",
      why: "Chaque redirection ajoute de la latence et dilue le jus de lien.",
      fix: "Mettez à jour les liens internes pour pointer directement vers l'URL finale.",
    }),
    r({
      code: "noindex",
      severity: "warning",
      category: "indexability",
      title: "Page en noindex",
      why: "La page est exclue de Google. Normal pour du contenu privé, grave si involontaire.",
      fix: "Retirez la balise/en-tête noindex si la page doit se positionner.",
    }),
    r({
      code: "canonical_missing",
      severity: "notice",
      category: "indexability",
      title: "Balise canonical absente",
      why: "Sans canonical, Google choisit seul l'URL à indexer en cas de doublons.",
      fix: 'Ajoutez <link rel="canonical"> auto-référente sur chaque page indexable.',
    }),
    r({
      code: "canonical_other",
      severity: "warning",
      category: "indexability",
      title: "Canonical vers une autre URL",
      why: "La page cède son référencement à une autre URL.",
      fix: "Vérifiez que c'est voulu ; sinon rendez la canonical auto-référente.",
    }),
    r({
      code: "title_missing",
      severity: "critical",
      category: "on-page",
      title: "Title manquant",
      why: "Le title est le signal on-page n°1 et le titre affiché dans les résultats.",
      fix: "Rédigez un title unique avec le mot-clé principal en début de phrase.",
    }),
    r({
      code: "title_short",
      severity: "notice",
      category: "on-page",
      title: "Title trop court",
      why: "Une opportunité manquée d'inclure mot-clé et argument de clic.",
      fix: "Visez 30 à 60 caractères.",
    }),
    r({
      code: "title_long",
      severity: "warning",
      category: "on-page",
      title: "Title trop long",
      why: "Il sera tronqué dans les résultats de recherche.",
      fix: "Visez 30 à 60 caractères, l'essentiel au début.",
    }),
    r({
      code: "title_duplicate",
      severity: "warning",
      category: "on-page",
      title: "Title dupliqué",
      why: "Google ne distingue pas les pages ; risque de cannibalisation.",
      fix: "Donnez à chaque page un title unique reflétant son intention de recherche.",
    }),
    r({
      code: "meta_missing",
      severity: "warning",
      category: "on-page",
      title: "Meta description manquante",
      why: "Google en génère une automatiquement, souvent peu incitative : CTR en baisse.",
      fix: "Rédigez 70 à 160 caractères avec bénéfice et appel à l'action.",
    }),
    r({
      code: "meta_long",
      severity: "notice",
      category: "on-page",
      title: "Meta description trop longue",
      why: "Elle sera tronquée dans les résultats.",
      fix: "Restez sous 160 caractères.",
    }),
    r({
      code: "meta_duplicate",
      severity: "notice",
      category: "on-page",
      title: "Meta description dupliquée",
      why: "Réduit la différenciation dans les résultats.",
      fix: "Écrivez une description unique par page.",
    }),
    r({
      code: "h1_missing",
      severity: "warning",
      category: "on-page",
      title: "H1 manquant",
      why: "Le H1 clarifie le sujet de la page pour les moteurs et les utilisateurs.",
      fix: "Ajoutez un unique H1 contenant le sujet principal.",
    }),
    r({
      code: "h1_multiple",
      severity: "notice",
      category: "on-page",
      title: "Plusieurs H1",
      why: "Structure ambiguë ; un seul H1 reste la bonne pratique.",
      fix: "Conservez un H1 et passez les autres en H2.",
    }),
    r({
      code: "img_alt_missing",
      severity: "notice",
      category: "on-page",
      title: "Images sans attribut alt",
      why: "Accessibilité et référencement Google Images pénalisés.",
      fix: "Décrivez chaque image porteuse de sens ; alt vide pour les images décoratives.",
    }),
    r({
      code: "thin_content",
      severity: "warning",
      category: "content",
      title: "Contenu léger",
      why: "Peu de texte : difficile de répondre à l'intention de recherche.",
      fix: "Enrichissez la page (réponses, exemples, FAQ) ou fusionnez-la avec une page proche.",
    }),
    r({
      code: "url_too_long",
      severity: "notice",
      category: "on-page",
      title: "URL trop longue",
      why: "URL difficiles à lire, partager et mémoriser.",
      fix: "Raccourcissez le slug autour du mot-clé principal.",
    }),
    r({
      code: "deep_page",
      severity: "notice",
      category: "links",
      title: "Page trop profonde",
      why: "Les pages enfouies reçoivent moins de crawl et d'autorité.",
      fix: "Rapprochez-la de l'accueil via le maillage interne.",
    }),
    r({
      code: "orphan_page",
      severity: "warning",
      category: "links",
      title: "Page orpheline",
      why: "Aucun lien interne n'y mène : Google la découvre mal et la juge peu importante.",
      fix: "Ajoutez des liens internes depuis des pages pertinentes.",
    }),
    r({
      code: "too_many_links",
      severity: "notice",
      category: "links",
      title: "Trop de liens sur la page",
      why: "L'autorité se dilue et la page devient difficile à analyser.",
      fix: "Réduisez aux liens utiles.",
    }),
    r({
      code: "broken_link",
      severity: "critical",
      category: "links",
      title: "Lien interne cassé",
      why: "Mène à une erreur 4xx/5xx.",
      fix: "Corrigez ou supprimez ce lien.",
    }),
    r({
      code: "slow_response",
      severity: "warning",
      category: "performance",
      title: "Temps de réponse lent",
      why: "Un TTFB élevé dégrade l'expérience et le crawl.",
      fix: "Activez le cache, un CDN, optimisez le backend.",
    }),
    r({
      code: "large_html",
      severity: "notice",
      category: "performance",
      title: "HTML très lourd",
      why: "Ralentit le chargement et le rendu.",
      fix: "Allégez le markup et le JSON embarqué.",
    }),
    r({
      code: "viewport_missing",
      severity: "warning",
      category: "on-page",
      title: "Meta viewport absente",
      why: "Google indexe en mobile-first : sans viewport, l'affichage mobile est cassé.",
      fix: 'Ajoutez <meta name="viewport" content="width=device-width, initial-scale=1">.',
    }),
    r({
      code: "lang_missing",
      severity: "notice",
      category: "international",
      title: "Attribut lang manquant",
      why: "Aide les moteurs et lecteurs d'écran à identifier la langue.",
      fix: "Ajoutez lang sur la balise <html>.",
    }),
    r({
      code: "jsonld_invalid",
      severity: "warning",
      category: "structured-data",
      title: "JSON-LD invalide",
      why: "Un balisage Schema cassé est ignoré : pas de résultats enrichis.",
      fix: "Corrigez la syntaxe JSON et validez avec le test des résultats enrichis.",
    }),
    r({
      code: "jsonld_missing",
      severity: "notice",
      category: "structured-data",
      title: "Aucune donnée structurée",
      why: "Les données structurées facilitent résultats enrichis et citations par les IA.",
      fix: "Ajoutez le schema adapté (Article, Product, FAQ, Organization…).",
    }),
    r({
      code: "mixed_content",
      severity: "warning",
      category: "security",
      title: "Contenu mixte HTTP",
      why: "Ressources HTTP sur une page HTTPS : blocage navigateur et alerte sécurité.",
      fix: "Servez toutes les ressources en HTTPS.",
    }),
    r({
      code: "not_https",
      severity: "critical",
      category: "security",
      title: "Page non sécurisée (HTTP)",
      why: "HTTPS est un signal de classement et un prérequis de confiance.",
      fix: "Redirigez tout en 301 vers HTTPS.",
    }),
    r({
      code: "robots_missing",
      severity: "notice",
      category: "indexability",
      title: "robots.txt introuvable",
      why: "Sans robots.txt, aucun contrôle explicite du crawl ni référence au sitemap.",
      fix: "Créez /robots.txt et référencez-y votre sitemap.",
    }),
    r({
      code: "robots_blocks_all",
      severity: "critical",
      category: "indexability",
      title: "robots.txt bloque tout le site",
      why: "Disallow: / empêche Google de crawler le site.",
      fix: "Retirez la directive Disallow: / pour les robots autorisés.",
    }),
    r({
      code: "sitemap_missing",
      severity: "warning",
      category: "indexability",
      title: "Sitemap XML introuvable",
      why: "Le sitemap accélère la découverte et l'indexation des pages.",
      fix: "Générez /sitemap.xml et soumettez-le dans la Search Console.",
    }),
  ].map((x) => [x.code, x]),
);

export const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 10, warning: 4, notice: 1 };
