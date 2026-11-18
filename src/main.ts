import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import { acervoPage, type Page } from './pages/acervo';

const root = document.getElementById('app')!;
let page: Page | undefined, kind = '', seq = 0;

export function go(path: string) { history.pushState({}, '', path); route(); }

/** /admin = painel com todos os drops · /admin/novo = criar · /admin/:id = editar · resto = acervo público. */
async function route() {
  const [, top, sub] = location.pathname.split('/');
  const k = top === 'admin' ? (sub ? 'editor' : 'hub') : 'acervo';
  if (page && kind === k && page.sync) { page.sync(); return; }
  page?.cleanup(); page = undefined; root.replaceChildren(); kind = k;
  const my = ++seq;
  // painel e editor só baixam o próprio código quando alguém entra em /admin
  let next: Page;
  if (k === 'hub') { const { hubPage } = await import('./pages/hub'); const c = await hubPage(root); next = { cleanup: () => c && c() }; }
  else if (k === 'editor') { const { adminPage } = await import('./pages/admin'); const c = await adminPage(root, sub === 'novo' ? undefined : sub); next = { cleanup: () => c && c() }; }
  else next = await acervoPage(root);
  // navegou de novo enquanto esta página carregava: descarta a que ficou para trás
  if (my !== seq) next.cleanup(); else page = next;
}
addEventListener('popstate', route);
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest('a[data-link]') as HTMLAnchorElement | null;
  if (a && !e.metaKey && !e.ctrlKey) { e.preventDefault(); go(a.getAttribute('href')!); }
});
route();
