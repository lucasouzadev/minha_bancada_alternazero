# Auditoria — segurança, performance e boas práticas (nov/2026)

## Segurança

| # | Achado | Risco | Correção |
|---|--------|-------|----------|
| S1 | Cores do drop iam direto para `style="background:…"` (ficha e painel). Um valor malicioso no banco virava injeção de CSS. | Médio | `safeHex()` em toda cor renderizada + `normalizeDrop()` valida o drop vindo do banco. |
| S2 | Dados do banco eram usados sem validar tipo/tamanho (`items` não-array, `w` texto, `storeUrl` qualquer). | Médio | `normalizeDrop()`: tipos, limites, enums, link só http(s), slug só `[a-z0-9-]`. |
| S3 | Caminho da arte vinha do JSON e era buscado sem conferir. | Baixo | Só chaves conhecidas, caminho `<uuid>/<face>-<n>.(webp\|png)` e resposta `image/*`. |
| S4 | Upload: se a conversão falhasse, o arquivo **original** subia (inclusive SVG com script) para o bucket público. | Alto | Só raster (png/jpg/webp/gif/avif/heic), até 40 MB na entrada, nunca envia o original; servidor aceita só webp/png ≤ 12 MB. |
| S5 | `api/og.ts`: título com `$&`/`$'` era interpretado por `String.replace` (quebrava a página); `esc` não cobria `'`/`>`; slug sem filtro. | Médio | Substituição por função, escape completo, slug filtrado, campos checados por tipo. |
| S6 | Sem cabeçalhos de segurança. | Médio | CSP restrita (`script-src 'self'`, Supabase só em img/connect), `frame-ancestors 'none'`, HSTS, nosniff, Referrer/Permissions-Policy, COOP — em `vercel.json` e na função og. |
| S7 | Storage sem limite de tamanho/tipo; política de upload sem restringir caminho; cadastro aberto permitiria criar conta com e-mail de admin ainda não cadastrado. | Médio | `supabase/fix-02-seguranca.sql` (rodar no projeto) + desligar "Allow new users to sign up". |
| S8 | `localStorage.setItem` sem proteção quebrava "Tenho" em navegação privada; lista da coleção sem limite. | Baixo | try/catch e limite de 500 itens. |
| S9 | `npm audit`: 4 "high" em `picomatch` (ReDoS) — só ferramenta de build (vite), não vai para o navegador. | Baixo | Sem correção sem rebaixar o vite; acompanhar atualização. Dependências de produção: 0. |

Já estava correto: RLS (público lê só publicado; escrita só admin), textos via `textContent` (sem `innerHTML` com dados), link da loja validado, chave `anon` apenas.

Testes: `e2e/security.spec.ts` grava payloads de XSS em todos os campos, tenta `javascript:` no link e injeção por URL — nada executa.

## Performance

| Ponto | Antes | Depois |
|-------|-------|--------|
| JS inicial do acervo | 641 KB (com editor/painel) | 593 KB; editor (46 KB) e painel (5 KB) só ao entrar em `/admin` |
| Acervo com admin logado | baixava a arte de **todos** os drops, inclusive rascunhos | filtra `published` no servidor antes de baixar |
| Cache | padrão | `/assets/*` imutável por 1 ano; ícones/manifest 1 dia |
| Navegação rápida entre rotas | páginas antigas podiam ficar vivas | descarta a página que terminou de carregar atrasada |

| Cliente Supabase no acervo | `supabase-js` (216 KB, 56 KB gzip) no JS inicial | fora do inicial: o acervo lê por `fetch` na REST; só o editor/painel baixam o cliente |
| Arte na prateleira | arte cheia de cada drop | miniatura `-s.webp` (≤768 px; 1600 px na faca) gravada ao salvar; a arte cheia só baixa ao abrir a caixa (herói e Planificada). Drops antigos sem miniatura continuam funcionando (usam a arte cheia) e ganham miniatura ao reenviar a arte |

Em aberto: gerar miniaturas dos drops já publicados (hoje só nascem quando a arte é reenviada); `three` (~130 KB gzip) segue no JS inicial — é o núcleo do acervo.

## Boas práticas, acessibilidade, privacidade

- `axe-core` (WCAG 2.1 AA) no acervo, caixa aberta, painel e nos 4 passos do editor: corrigido nome acessível dos links do painel e das etapas (WCAG 2.5.3). Sem violações sérias/críticas.
- Tela de erro com "Tentar de novo" para falha de rede/servidor ou versão nova publicada.
- Código morto removido; TypeScript com `noUnusedLocals`/`noUnusedParameters`.
- Página `/privacidade.html` (rascunho — revisar com quem responde pela marca): o que fica no aparelho, o que não é coletado, serviços usados, LGPD.
