create table public.seo_articles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.seo_projects(id) on delete set null,
  title text not null default '' check (char_length(title) <= 300),
  keyword text not null default '' check (char_length(keyword) <= 200),
  meta_description text not null default '' check (char_length(meta_description) <= 500),
  brief jsonb,
  content text not null default '' check (char_length(content) <= 200000),
  status text not null default 'brouillon' check (status in ('idee','brouillon','publie')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index seo_articles_user_idx on public.seo_articles(user_id, updated_at desc);
alter table public.seo_articles enable row level security;
create policy "own articles" on public.seo_articles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Compteur d'appels IA par utilisateur et par jour (limite de coût).
create table public.seo_ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  count int not null default 0,
  primary key (user_id, day)
);
alter table public.seo_ai_usage enable row level security;

create or replace function public.consume_ai_call(_user uuid, _limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare c int;
begin
  insert into public.seo_ai_usage(user_id, day, count) values (_user, current_date, 1)
  on conflict (user_id, day) do update set count = public.seo_ai_usage.count + 1
    where public.seo_ai_usage.count < _limit
  returning count into c;
  return c is not null;
end;
$$;
revoke all on function public.consume_ai_call(uuid, int) from public, anon, authenticated;
grant execute on function public.consume_ai_call(uuid, int) to service_role;
