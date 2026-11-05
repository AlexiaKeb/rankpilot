# RankPilot

SaaS SEO : audit technique, score de santé et plan d'action priorisé.
Stack : TanStack Start (React 19), Tailwind 4, shadcn/ui, Supabase (RLS), déploiement Cloudflare Workers.

## Fonctionnalités
- Audit technique, historique, comparaison, export CSV, maillage interne, llms.txt
- Optimiseur de page par mot-clé, idées de mots-clés, outils gratuits (aperçu Google, JSON-LD)
- Diagnostics : vitesse (Core Web Vitals), redirections et en-têtes, visibilité IA
- Google Search Console : clics, impressions, opportunités (nécessite GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)

## Phase 1 (livrée)

- Auth email/mot de passe, projets (domaines), RLS sur toutes les tables.
- Crawler d'audit technique par lots (`crawlStep`), protégé contre le SSRF.
- ~38 règles (indexabilité, on-page, contenu, liens, performance, données structurées, sécurité), chacune avec « pourquoi » et « comment corriger ».
- Score de santé 0-100, comparaison de doublons, pages orphelines, liens cassés, robots.txt, sitemap.

## Démarrage

```bash
npm install
cp .env.example .env   # renseigner les clés Supabase
# la migration supabase/migrations/*.sql est déjà appliquée au projet « rankpilot »
npm run dev
npm test
```

## Roadmap

2. Mots-clés + suivi de positions · 3. Éditeur de contenu IA · 4. Backlinks + concurrents · 5. Visibilité IA (GEO) · 6. Stripe + landing + outils gratuits.
