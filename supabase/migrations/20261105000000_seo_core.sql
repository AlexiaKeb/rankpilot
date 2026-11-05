-- RankPilot : fondations (projets) + audit technique.
-- Toutes les tables sont protégées par RLS : un utilisateur ne voit que ses données.

create table public.seo_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  domain text not null check (char_length(domain) between 4 and 255),
  created_at timestamptz not null default now(),
  unique (user_id, domain)
);

create table public.seo_audits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.seo_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'running' check (status in ('running','completed','failed')),
  max_pages int not null default 50 check (max_pages between 1 and 500),
  pages_crawled int not null default 0,
  health_score int,
  issue_counts jsonb not null default '{}'::jsonb,
  site_info jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index seo_audits_project_idx on public.seo_audits(project_id, started_at desc);

-- Une ligne par URL découverte ; crawled=false => encore dans la file d'attente.
create table public.seo_audit_pages (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.seo_audits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  crawled boolean not null default false,
  status_code int,
  depth int not null default 0,
  title text,
  meta_description text,
  h1_count int,
  word_count int,
  canonical text,
  noindex boolean,
  response_ms int,
  internal_links jsonb not null default '[]'::jsonb,
  data jsonb not null default '{}'::jsonb,
  unique (audit_id, url)
);
create index seo_audit_pages_queue_idx on public.seo_audit_pages(audit_id, crawled);

create table public.seo_audit_issues (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.seo_audits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  code text not null,
  severity text not null check (severity in ('critical','warning','notice')),
  detail text
);
create index seo_audit_issues_audit_idx on public.seo_audit_issues(audit_id, severity, code);

alter table public.seo_projects enable row level security;
alter table public.seo_audits enable row level security;
alter table public.seo_audit_pages enable row level security;
alter table public.seo_audit_issues enable row level security;

create policy "own projects" on public.seo_projects for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Les audits et leurs résultats sont écrits par les fonctions serveur (service role) :
-- l'utilisateur n'a qu'un accès en lecture, et peut supprimer ses audits.
create policy "read own audits" on public.seo_audits for select to authenticated using (user_id = auth.uid());
create policy "delete own audits" on public.seo_audits for delete to authenticated using (user_id = auth.uid());
create policy "read own pages" on public.seo_audit_pages for select to authenticated using (user_id = auth.uid());
create policy "read own issues" on public.seo_audit_issues for select to authenticated using (user_id = auth.uid());
