# Minha bancada — Caixas 3D (Alternazero)

Acervo de drops com a caixa 3D gerada a partir da arte (faca planificada) e das medidas em mm.

- `/` prateleira (coleção) · `/c/:slug` caixa aberta · `/colecao?c=a,b` coleção compartilhada · `/admin` editor
- Vite + TypeScript + three.js (sem framework). Produção: https://caixas-3d.vercel.app

## Editor (`/admin`)

Criação em 4 passos — **Identidade → Caixa → Arte → Publicar**; o que é raro (subtítulo, artista, data, link, acabamento, cores) fica em "Mais opções".
A tela ocupa só a área visível (acima do teclado) e nunca rola inteira; a prévia 3D aparece em Caixa e Arte e some enquanto você digita.
Rascunho automático no aparelho (recarregar não perde nada), "Duplicar drop" e medidas prontas.
No iPhone: Compartilhar → **Adicionar à Tela de Início** abre o app em tela cheia (sem a barra do Safari).

## Visualizador (`/c/:slug`)

Arrastar a alça da folha (ou tocar nela) recolhe os detalhes e deixa só a caixa em tela; arrastar de novo fecha. Em telas largas o painel lateral recolhe pelo botão ›, e um botão "Detalhes" traz de volta.
Três modos no topo: **Caixa** (3D), **Arte** (só a arte, face por face, com zoom) e **Planificada** (a faca inteira, com guias de dobra).
Na Arte e na Planificada: pinça ou roda do mouse para ampliar, toque duplo alterna 1× ↔ 2,5×, arrastar move; na Arte, passar o dedo muda de face.

## Rodar

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # tsc + vite build
```

Sem variáveis de ambiente o app roda 100% local (IndexedDB, 6 drops de exemplo).

## Servidor (Supabase)

1. Em um projeto Supabase, rode `supabase/schema.sql` no SQL Editor.
2. Crie o usuário em Authentication → Users (marque Auto Confirm).
3. Rode `supabase/fix-01-admin.sql` trocando o e-mail pelo do editor (insere em `public.admins`, libera leitura no storage e as permissões da API).
4. Variáveis (Vercel → Project Settings → Environment Variables; veja `.env.example`):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Use só a chave publicável (anon), nunca a `service_role`.
5. Redeploy (as `VITE_*` entram no build).

Preview do WhatsApp: `api/og.ts` injeta as tags `og:*` em `/c/:slug`. A imagem (1200×630) é gerada no navegador ao salvar no editor.
Se um preview ficar em cache no WhatsApp, acrescente `?v=2` ao link.

## Testes E2E (Playwright)

```bash
npx playwright install chromium     # ou CHROME_PATH=/usr/bin/google-chrome
npm run test:e2e                    # local: 10 tamanhos de tela (@flow funções, @layout regras de layout)
npm run test:e2e:remote             # produção + Supabase (@remote); E2E_EMAIL / E2E_PASSWORD
npm run test:e2e:report
```

Telas: celular pequeno/normal/grande, celular deitado, dobrável, tablet em pé/deitado, notebook, desktop, ultrawide.
WebGL por software é lento: se houver timeout em paralelo, rode com `--workers=1`.
