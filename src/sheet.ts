import { h, icon } from './ui';

/**
 * Folha de baixo (menus, confirmações, seletor): a mesma linguagem da ficha da caixa — alça, título,
 * borda a borda no celular. Entra e SAI animada (Esc, toque fora, arrastar a alça, Cancelar).
 */
export interface Sheet { el: HTMLDialogElement; body: HTMLElement; open(): void; close(): Promise<void> }

export function sheet(title: string, ...kids: (Node | null)[]): Sheet {
  const head = h('div', { class: 'dlg-head' }, h('span', { class: 'sh-handle', 'aria-hidden': 'true' }), h('p', { class: 'dlg-title' }, title));
  const body = h('div', { class: 'dlg-body' }, ...kids);
  const d = h('dialog', { class: 'sheet-dlg', ariaLabel: title }, head, body);
  let closing: Promise<void> | null = null;
  const close = () => {
    if (!d.open) return Promise.resolve();
    if (closing) return closing;
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    closing = new Promise<void>((res) => {
      // sai a partir da posição atual (inclusive de onde o dedo soltou a alça), sem voltar ao topo antes
      d.getAnimations().forEach((a) => a.finish());
      d.classList.add('closing');
      const done = () => { d.classList.remove('closing', 'drag'); d.style.transform = ''; d.close(); closing = null; res(); };
      if (calm) done(); else setTimeout(done, 250);
    });
    return closing;
  };
  d.addEventListener('cancel', (e) => { e.preventDefault(); void close(); });            // Esc
  d.addEventListener('click', (e) => { if (e.target === d) void close(); });             // toque fora
  // alça: arrastar para baixo fecha (distância ou "peteleco"); tocar também fecha; para cima, resistência
  let y0: number | null = null, dy = 0, t = 0, v = 0;
  head.addEventListener('pointerdown', (e) => {
    if (closing) return;
    d.getAnimations().forEach((a) => a.finish());   // entrou há pouco: termina a entrada antes de arrastar
    y0 = e.clientY; dy = 0; v = 0; t = performance.now(); head.setPointerCapture(e.pointerId); d.classList.add('drag');
  });
  head.addEventListener('pointermove', (e) => {
    if (y0 === null) return;
    const raw = e.clientY - y0, now = performance.now(), nd = raw >= 0 ? raw : -Math.sqrt(-raw) * 2;
    v = (nd - dy) / Math.max(1, now - t); t = now; dy = nd;
    d.style.transform = `translateY(${dy}px)`;
  });
  const up = () => {
    if (y0 === null) return;
    y0 = null;
    const tap = Math.abs(dy) < 6;
    if (tap || dy > 70 || (dy > 16 && v > 0.5)) { void close(); return; }
    d.classList.remove('drag'); d.style.transform = '';
  };
  head.addEventListener('pointerup', up); head.addEventListener('pointercancel', up);
  document.body.append(d);
  return { el: d, body, open: () => { if (!d.open) d.showModal(); }, close };
}

/** Linha de ação com explicação curta embaixo (o que vai acontecer antes de tocar). */
export function action(label: string, hint: string, ico: string, fn: () => void, opts: { danger?: boolean; testid?: string } = {}) {
  return h('button', { type: 'button', class: `act${opts.danger ? ' act-danger' : ''}`, 'data-testid': opts.testid ?? null, onclick: fn },
    icon(ico, 20), h('span', { class: 'act-tx' }, h('b', {}, label), h('small', {}, hint)));
}

/** Confirmação em folha: título, explicação do que acontece e dois botões. Resolve true se confirmou. */
export function confirmSheet(o: { title: string; body: string; confirm: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    const s = sheet(o.title,
      h('p', { class: 'dlg-text' }, o.body),
      h('div', { class: 'dlg-btns' },
        h('button', { type: 'button', class: 'ghost', 'data-testid': 'confirm-no', onclick: () => finish(false) }, 'Cancelar'),
        h('button', { type: 'button', class: o.danger ? 'primary danger-fill' : 'primary', 'data-testid': 'confirm-yes', onclick: () => finish(true) }, o.confirm)));
    const finish = async (v: boolean) => { if (answered) return; answered = true; await s.close(); s.el.remove(); resolve(v); };
    s.el.classList.add('confirm');
    s.el.addEventListener('close', () => { if (!answered) { answered = true; s.el.remove(); resolve(false); } });
    s.open();
    (s.el.querySelector('[data-testid=confirm-no]') as HTMLElement).focus();
  });
}
