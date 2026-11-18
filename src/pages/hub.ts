import { clearDraft, deleteDrop, draftCopy, getDrop, listDropMeta, setPublished } from '../db';
import { go } from '../main';
import { REMOTE, remoteThumb, sb } from '../remote';
import { action, confirmSheet, sheet } from '../sheet';
import { STATUS_LABEL, safeHex, type Drop } from '../types';
import { announce, fmtDate, h, icon, toast } from '../ui';
import { loginGate } from './admin';

type Filter = 'all' | 'live' | 'draft';
const FILTERS: [Filter, string][] = [['all', 'Todos'], ['live', 'No ar'], ['draft', 'Rascunhos']];

/**
 * Painel do editor: todos os drops (no ar e rascunhos) num lugar só — abrir, publicar/remover do acervo,
 * duplicar, excluir. Cada ação explica o que faz e pede confirmação quando muda algo.
 */
export async function hubPage(root: HTMLElement) {
  const sk = h('div', { class: 'hub sk', 'aria-busy': 'true' },
    h('p', { class: 'sr-only', role: 'status' }, 'Carregando os drops…'),
    h('div', { class: 'hub-top' }, h('span', { class: 'sk-b sk-ico' }), h('span', { class: 'sk-b sk-h' })),
    h('div', { class: 'hub-list' }, ...Array.from({ length: 4 }, () => h('span', { class: 'sk-b hub-sk-row' }))));
  root.append(sk);
  if (!(await loginGate(root))) { sk.remove(); return; }
  let all: Drop[] = await listDropMeta();
  if (!sk.isConnected) return;

  let filter: Filter = 'all';
  const count = h('p', { class: 'hub-count' });
  const list = h('div', { class: 'hub-list', role: 'list', 'data-testid': 'hub-list' });
  const segBtns = FILTERS.map(([v, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(v === filter), onclick: () => { filter = v; render(); } }, l));
  const seg = h('div', { class: 'seg hub-seg', role: 'radiogroup', ariaLabel: 'Mostrar' }, ...segBtns);
  const newBtn = () => h('a', { class: 'primary hub-new', href: '/admin/novo', 'data-link': true, 'data-testid': 'hub-new' }, icon('plus', 20), 'Novo drop');

  const out = REMOTE ? h('button', { class: 'txt', type: 'button', onclick: async () => {
    if (!(await confirmSheet({ title: 'Sair do editor?', body: 'Você volta para a tela de login. Nada que já foi salvo é perdido.', confirm: 'Sair' }))) return;
    await sb.auth.signOut(); go('/admin');
  } }, 'Sair') : null;

  const hub = h('div', { class: 'hub', 'data-testid': 'hub' },
    h('header', { class: 'hub-top' },
      h('a', { class: 'ico', href: '/', 'data-link': true, ariaLabel: 'Ver o acervo público', 'data-tip': 'Acervo público' }, icon('back', 22)),
      h('div', { class: 'hub-title' }, h('h1', {}, 'Drops'), count),
      out, h('span', { class: 'hub-new-top' }, newBtn())),
    seg, list,
    h('div', { class: 'hub-foot' }, newBtn()));
  sk.replaceWith(hub);

  const thumb = (d: Drop) => {
    const box = h('span', { class: 'hub-thumb', 'aria-hidden': 'true', style: `--in:${safeHex(d.inner)};--ts:${safeHex(d.tissue)}` });
    if (REMOTE) { const img = h('img', { src: remoteThumb(d.id, d.updatedAt), alt: '', loading: 'lazy', draggable: false }); img.onerror = () => img.remove(); box.append(img); }
    return box;
  };
  function row(d: Drop) {
    const bits = [d.subtitle, d.date && fmtDate(d.date)].filter(Boolean) as string[];
    const badges = [
      h('span', { class: `badge ${d.published ? 'live' : 'draft'}` }, d.published ? 'No ar' : 'Rascunho'),
      d.status === 'soldout' || d.status === 'soon' ? h('span', { class: `badge ${d.status}` }, STATUS_LABEL[d.status]) : null,
    ];
    return h('div', { class: 'hub-row', role: 'listitem', 'data-id': d.id },
      h('a', { class: 'hub-main', href: `/admin/${d.id}`, 'data-link': true, title: `Editar ${d.name}` },
        thumb(d),
        h('span', { class: 'hub-tx' }, h('b', {}, d.name || 'Sem nome'), h('small', {}, bits.join(' · ') || ' '), h('span', { class: 'hub-badges' }, ...badges))),
      h('button', { class: 'ico', type: 'button', ariaLabel: `Ações de ${d.name}`, 'data-testid': 'row-menu', onclick: () => openActions(d) }, icon('more', 22)));
  }
  function render() {
    segBtns.forEach((b, i) => b.setAttribute('aria-checked', String(FILTERS[i][0] === filter)));
    const live = all.filter((d) => d.published).length;
    count.textContent = all.length ? `${all.length} ${all.length === 1 ? 'drop' : 'drops'} · ${live} no ar · ${all.length - live} ${all.length - live === 1 ? 'rascunho' : 'rascunhos'}` : 'Nenhum drop ainda';
    const shown = all.filter((d) => filter === 'all' || (filter === 'live' ? d.published : !d.published));
    list.replaceChildren(...shown.map(row));
    if (!shown.length) list.append(h('p', { class: 'hub-empty' }, all.length ? 'Nada neste filtro.' : 'Crie o primeiro drop: nome, medidas, arte e ficha — em quatro passos.'));
  }

  async function openActions(d: Drop) {
    const s = sheet(d.name || 'Drop',
      action('Editar', 'Abre o drop no editor, nos quatro passos.', 'edit', () => run(() => go(`/admin/${d.id}`)), { testid: 'act-edit' }),
      d.published ? action('Ver no acervo', `Abre a página pública /c/${d.slug}.`, 'external', () => run(() => go(`/c/${encodeURIComponent(d.slug)}`)), { testid: 'act-view' }) : null,
      d.published
        ? action('Remover do acervo', 'Vira rascunho: some da prateleira e o link deixa de abrir. Dá para publicar de novo.', 'close', () => run(() => togglePub(d, false)), { testid: 'act-unpub' })
        : action('Publicar', 'Coloca o drop na prateleira e libera o link público.', 'check', () => run(() => togglePub(d, true)), { testid: 'act-pub' }),
      action('Duplicar', 'Cria uma cópia em rascunho, com a mesma arte, para ajustar.', 'copy', () => run(() => duplicate(d)), { testid: 'act-dup' }),
      action('Excluir', 'Apaga o drop, a arte e o link. Não dá para desfazer.', 'trash', () => run(() => remove(d)), { danger: true, testid: 'act-del' }),
      h('button', { type: 'button', class: 'act cancel', onclick: () => void s.close() }, 'Cancelar'));
    const run = async (fn: () => unknown) => { await s.close(); s.el.remove(); await fn(); };
    s.el.addEventListener('close', () => s.el.remove(), { once: true });
    s.open();
  }
  async function togglePub(d: Drop, on: boolean) {
    const ok = await confirmSheet(on
      ? { title: `Publicar "${d.name}"?`, body: `Aparece no acervo e o link /c/${d.slug} passa a abrir para qualquer pessoa.`, confirm: 'Publicar' }
      : { title: `Remover "${d.name}" do acervo?`, body: `Some da prateleira e o link /c/${d.slug} deixa de abrir. Nada é apagado: você pode publicar de novo.`, confirm: 'Remover do acervo' });
    if (!ok) return;
    try { await setPublished(d.id, on); } catch (e) { console.error(e); toast('Não foi possível atualizar. Tente de novo.', 'error'); return; }
    d.published = on; render(); toast(on ? 'Publicado' : 'Removido do acervo', 'ok');
    announce(on ? `${d.name} publicado.` : `${d.name} removido do acervo.`);
  }
  async function duplicate(d: Drop) {
    const ok = await confirmSheet({ title: `Duplicar "${d.name}"?`, body: 'Cria uma cópia em rascunho, com a mesma arte e ficha. Ela abre no editor para você ajustar o nome e salvar.', confirm: 'Duplicar' });
    if (!ok) return;
    const full = await getDrop(d.id);
    if (!full) { toast('Esse drop não foi encontrado.', 'error'); return; }
    await draftCopy(full); go('/admin/novo');
  }
  async function remove(d: Drop) {
    const ok = await confirmSheet({ title: `Excluir "${d.name}"?`, body: `Apaga o drop, a arte e o link /c/${d.slug}. Não dá para desfazer.`, confirm: 'Excluir', danger: true });
    if (!ok) return;
    try { await deleteDrop(d.id); await clearDraft(d.id); } catch (e) { console.error(e); toast('Não foi possível excluir. Tente de novo.', 'error'); return; }
    all = all.filter((x) => x.id !== d.id); render(); toast('Drop excluído', 'ok');
  }

  render();
  return () => { document.querySelectorAll('dialog.sheet-dlg').forEach((x) => x.remove()); };
}
