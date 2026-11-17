import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import { acervoPage, type Page } from './pages/acervo';
import { adminPage } from './pages/admin';

const root = document.getElementById('app')!;
let page: Page | undefined, kind = '';

export function go(path: string) { history.pushState({}, '', path); route(); }

async function route() {
  const k = location.pathname.startsWith('/admin') ? 'admin' : 'acervo';
  if (page && kind === k && page.sync) { page.sync(); return; }
  page?.cleanup(); root.replaceChildren(); kind = k;
  if (k === 'admin') { const c = await adminPage(root, location.pathname.split('/')[2]); page = { cleanup: () => c && c() }; }
  else page = await acervoPage(root);
}
addEventListener('popstate', route);
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest('a[data-link]') as HTMLAnchorElement | null;
  if (a && !e.metaKey && !e.ctrlKey) { e.preventDefault(); go(a.getAttribute('href')!); }
});
route();
