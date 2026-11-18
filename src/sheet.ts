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
      d.classList.add('closing');
      const done = () => { d.classList.remove('closing'); d.style.transform = ''; d.close(); closing = null; res(); };
      if (calm) done(); else setTimeout(done, 220);
    });
    return closing;
  };
  d.addEventListener('cancel', (e) => { e.preventDefault(); void close(); });            // Esc
  d.addEventListener('click', (e) => { if (e.target === d) void close(); });             // toque fora
  // arrastar a alça para baixo fecha
  let y0: number | null = null, dy = 0;
  head.addEventListener('pointerdown', (e) => { y0 = e.clientY; dy = 0; head.setPointerCapture(e.pointerId); d.classList.add('drag'); });
  head.addEventListener('pointermove', (e) => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); d.style.transform = `translateY(${dy}px)`; });
  const up = () => { if (y0 === null) return; y0 = null; d.classList.remove('drag'); if (dy > 70) void close(); else d.style.transform = ''; };
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
