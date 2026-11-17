-- Correção 01 — rode UMA vez no SQL Editor do Supabase.
-- Motivo: o login funcionava, mas o e-mail não estava em public.admins,
-- então o banco bloqueava o "Salvar" (row-level security).

-- 1) e-mail de editor (troque/adicione outros quando quiser)
insert into public.admins (email) values ('admin@admin.com') on conflict do nothing;

-- 2) comparação sem diferenciar maiúsculas/minúsculas
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

-- 3) o upload da imagem de preview usa "upsert", que também exige SELECT no storage;
--    o "Excluir" lista os arquivos da pasta, que também exige SELECT.
drop policy if exists "caixas: admin le" on storage.objects;
create policy "caixas: admin le" on storage.objects for select to authenticated
  using (bucket_id = 'caixas' and public.is_admin());

-- 4) permissões explícitas da API (projetos novos não concedem mais automaticamente)
grant usage on schema public to anon, authenticated;
grant select on public.drops to anon, authenticated;
grant insert, update, delete on public.drops to authenticated;
grant select on public.admins to authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- conferência: deve retornar 1 linha
select * from public.admins;
