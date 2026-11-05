-- Mots-clés sauvegardés (listes de travail par utilisateur, optionnellement liées à un projet).
create table public.seo_keywords (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.seo_projects(id) on delete cascade,
  keyword text not null check (char_length(keyword) between 1 and 200),
  intent text not null default 'informationnelle',
  cluster text,
  notes text,
  created_at timestamptz not null default now()
);
create unique index seo_keywords_unique on public.seo_keywords(user_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(keyword));
create index seo_keywords_user_idx on public.seo_keywords(user_id, created_at desc);
alter table public.seo_keywords enable row level security;
create policy "own keywords" on public.seo_keywords for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
