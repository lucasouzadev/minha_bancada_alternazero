import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import { acervoPage, type Page } from './pages/acervo';
import { adminPage } from './pages/admin';
import { hubPage } from './pages/hub';

const root = document.getElementById('app')!;
let page: Page | undefined, kind = '';

export function go(path: string) { history.pushState({}, '', path); route(); }

/** /admin = painel com todos os drops · /admin/novo = criar · /admin/:id = editar · resto = acervo público. */
async function route() {
  const [, top, sub] = location.pathname.split('/');
  const k = top === 'admin' ? (sub ? 'editor' : 'hub') : 'acervo';
  if (page && kind === k && page.sync) { page.sync(); return; }
  page?.cleanup(); root.replaceChildren(); kind = k;
  if (k === 'hub') { const c = await hubPage(root); page = { cleanup: () => c && c() }; }
  else if (k === 'editor') { const c = await adminPage(root, sub === 'novo' ? undefined : sub); page = { cleanup: () => c && c() }; }
  else page = await acervoPage(root);
}
addEventListener('popstate', route);
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest('a[data-link]') as HTMLAnchorElement | null;
  if (a && !e.metaKey && !e.ctrlKey) { e.preventDefault(); go(a.getAttribute('href')!); }
});
route();
