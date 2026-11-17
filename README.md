# Caixas 3D

Acervo de drops com caixa 3D gerada a partir da arte e das medidas.

- `/` prateleira (coleção) · `/c/:slug` caixa · `/admin` editor
- Sem variáveis de ambiente o app roda 100% local (IndexedDB, 6 drops de exemplo).
- Com Supabase: rode `supabase/schema.sql`, crie seu usuário em Authentication, insira seu e-mail em `public.admins`,
  e defina as variáveis de `.env.example` (no Vercel: Project Settings → Environment Variables).
- Preview do WhatsApp: `api/og.ts` injeta as tags `og:*` em `/c/:slug`. A imagem (1200×630) é gerada no navegador ao salvar no editor.
- Se um preview ficar em cache no WhatsApp, acrescente `?v=2` ao link.
