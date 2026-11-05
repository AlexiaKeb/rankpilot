-- Connexion Google (jeton de rafraîchissement) : lisible uniquement par les fonctions serveur (service role).
create table public.seo_google_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  created_at timestamptz not null default now()
);
alter table public.seo_google_connections enable row level security;
-- aucune policy : ni lecture ni écriture depuis le navigateur.

create table public.seo_oauth_states (
  nonce text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.seo_projects(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.seo_oauth_states enable row level security;

alter table public.seo_projects add column gsc_site text;
