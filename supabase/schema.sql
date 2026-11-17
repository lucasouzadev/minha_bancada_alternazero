-- Caixas 3D — esquema do Supabase
-- Rode no SQL Editor do projeto (ou via migration). Depois: insira seu e-mail em public.admins.

create table if not exists public.admins (email text primary key);

create table if not exists public.drops (
  id uuid primary key,
  slug text not null unique,
  data jsonb not null,
  published boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.admins enable row level security;
alter table public.drops enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where email = (auth.jwt() ->> 'email'));
$$;

-- público lê só o que está publicado; admin lê e escreve tudo
create policy "drops: leitura publica" on public.drops for select using (published);
create policy "drops: admin le tudo" on public.drops for select to authenticated using (public.is_admin());
create policy "drops: admin insere" on public.drops for insert to authenticated with check (public.is_admin());
create policy "drops: admin altera" on public.drops for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "drops: admin apaga" on public.drops for delete to authenticated using (public.is_admin());
create policy "admins: cada um ve o proprio" on public.admins for select to authenticated using (email = (auth.jwt() ->> 'email'));

-- bucket publico para as artes e a imagem de preview
insert into storage.buckets (id, name, public) values ('caixas', 'caixas', true) on conflict (id) do nothing;
create policy "caixas: admin envia" on storage.objects for insert to authenticated with check (bucket_id = 'caixas' and public.is_admin());
create policy "caixas: admin altera" on storage.objects for update to authenticated using (bucket_id = 'caixas' and public.is_admin());
create policy "caixas: admin apaga" on storage.objects for delete to authenticated using (bucket_id = 'caixas' and public.is_admin());

-- Depois de criar seu usuario em Authentication > Users:
-- insert into public.admins (email) values ('seu@email.com');
