-- Correção 02 — reforço de segurança. Rode UMA vez no SQL Editor do Supabase (idempotente).
-- O app já valida tudo no navegador; isto garante as mesmas regras no servidor,
-- mesmo para quem chamar a API direto com a chave pública.

-- 1) storage: só imagens raster e no máximo 12 MB por arquivo (SVG fica de fora: pode carregar script)
update storage.buckets
   set file_size_limit = 12 * 1024 * 1024,
       allowed_mime_types = array['image/webp', 'image/png', 'image/jpeg']
 where id = 'caixas';

-- 2) uploads só dentro da pasta de um drop (<uuid>/arquivo) e com extensão de imagem
drop policy if exists "caixas: admin envia" on storage.objects;
create policy "caixas: admin envia" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'caixas' and public.is_admin()
    and name ~ '^[0-9a-f-]{36}/[a-z0-9-]+\.(webp|png|jpg)$'
  );
drop policy if exists "caixas: admin altera" on storage.objects;
create policy "caixas: admin altera" on storage.objects for update to authenticated
  using (bucket_id = 'caixas' and public.is_admin())
  with check (bucket_id = 'caixas' and public.is_admin() and name ~ '^[0-9a-f-]{36}/[a-z0-9-]+\.(webp|png|jpg)$');

-- 3) dados dos drops: formato do link e tamanho máximo do JSON (evita lixo/abuso)
alter table public.drops drop constraint if exists drops_slug_formato;
alter table public.drops add constraint drops_slug_formato check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 120) not valid;
alter table public.drops drop constraint if exists drops_data_tamanho;
alter table public.drops add constraint drops_data_tamanho check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 200000) not valid;

-- 4) a política de "admins" compara o e-mail sem diferenciar maiúsculas, como is_admin()
drop policy if exists "admins: cada um ve o proprio" on public.admins;
create policy "admins: cada um ve o proprio" on public.admins for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

-- 5) is_admin() só para quem está logado (visitante anônimo não precisa)
revoke execute on function public.is_admin() from anon, public;
grant execute on function public.is_admin() to authenticated;

-- 6) no painel do Supabase (não dá para fazer por SQL):
--    Authentication > Sign In / Providers > desligue "Allow new users to sign up"
--    (senão alguém pode criar conta com um e-mail da lista de admins que ainda não foi cadastrado)
--    e mantenha "Confirm email" ligado.
