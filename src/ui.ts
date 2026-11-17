type Kid = Node | string | null | false | undefined;
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list') (el as any)[k] = v;
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, String(v));
  }
  for (const kid of kids) if (kid != null && kid !== false) el.append(kid);
  return el;
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Última forma de interação (teclado ou ponteiro), em <html data-input>.
 * O foco devolvido por código (ex.: ao fechar a caixa) só mostra anel quando a pessoa navega pelo teclado;
 * sem isso o Safari/Chrome desenham o contorno depois de um toque.
 */
const docEl = document.documentElement;
docEl.dataset.input = 'pointer';
addEventListener('keydown', (e) => { if (!e.metaKey && !e.ctrlKey && !e.altKey) docEl.dataset.input = 'key'; }, true);
addEventListener('pointerdown', () => { docEl.dataset.input = 'pointer'; }, true);
export const usingKeyboard = () => docEl.dataset.input === 'key';

/* ---------- avisos (toast) ---------- */
export type ToastKind = 'info' | 'ok' | 'error';
let tray: HTMLElement | null = null;
/** Região viva criada uma vez: leitores de tela só anunciam mudanças em regiões que já existiam. */
function getTray() {
  if (tray?.isConnected) return tray;
  tray = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  document.body.append(tray);
  return tray;
}
export function toast(msg: string, kind: ToastKind = 'info', ms = kind === 'error' ? 5200 : 3400) {
  const box = getTray();
  box.querySelectorAll('.toast').forEach((o) => o.remove()); // um por vez: o novo substitui o anterior
  const t = h('div', { class: `toast ${kind}` }, kind === 'info' ? null : icon(kind === 'ok' ? 'check' : 'alert', 18), h('span', {}, msg));
  box.append(t);
  requestAnimationFrame(() => t.classList.add('in'));
  let timer = 0;
  const hide = () => { t.classList.remove('in'); t.classList.add('out'); setTimeout(() => t.remove(), 320); };
  const arm = () => { clearTimeout(timer); timer = window.setTimeout(hide, ms); };
  // não some enquanto o ponteiro está em cima (dá tempo de ler)
  t.addEventListener('pointerenter', () => clearTimeout(timer));
  t.addEventListener('pointerleave', arm);
  arm();
}

/** Anúncio só para leitores de tela (sem nada visual). */
let sr: HTMLElement | null = null;
export function announce(msg: string) {
  if (!sr?.isConnected) { sr = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' }); document.body.append(sr); }
  sr.textContent = ''; requestAnimationFrame(() => { sr!.textContent = msg; });
}

export type ShareResult = 'shared' | 'copied' | 'cancel';
export async function share(title: string, text: string, url: string): Promise<ShareResult> {
  try {
    if (navigator.share) { await navigator.share({ title, text, url }); return 'shared'; }
    await navigator.clipboard.writeText(url); toast('Link copiado', 'ok'); return 'copied';
  } catch { return 'cancel'; }
}
export const fmtDate = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace(' de ', ' ').replace('.', '');

const ICONS: Record<string, string> = {
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  mark: '<path d="M7 4h10v16l-5-4-5 4z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 8v5M12 16.5v.01"/><circle cx="12" cy="12" r="9"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 16l5-5 4 4 3-3 5 5"/><circle cx="15.5" cy="9" r="1.5"/>',
  download: '<path d="M12 4v11M8 11l4 4 4-4M5 20h14"/>',
  spark: '<path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M6.5 17.5L9 15M15 9l2.5-2.5"/>',
  external: '<path d="M14 5h5v5M19 5l-8 8M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  shrink: '<path d="M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
};
export function icon(name: keyof typeof ICONS | string, size = 22) {
  const s = document.createElement('span'); s.className = 'ico-svg'; s.setAttribute('aria-hidden', 'true');
  s.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return s;
}

/**
 * Trava os gestos nativos do navegador que atrapalham um app: zoom por pinça (o iOS ignora user-scalable=no),
 * menu de segurar em imagens/canvas e início de seleção fora dos campos de texto.
 * Campos (input/textarea/select) ficam intactos; a visualização "Arte" faz o próprio zoom.
 */
const isField = (t: EventTarget | null) => t instanceof Element && !!t.closest('input,textarea,select,[contenteditable],.sel');
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) addEventListener(ev, (e) => e.preventDefault(), { passive: false } as AddEventListenerOptions);
addEventListener('selectstart', (e) => { if (!isField(e.target)) e.preventDefault(); });
addEventListener('contextmenu', (e) => { if (!isField(e.target) && !(e.target instanceof HTMLAnchorElement)) e.preventDefault(); });
addEventListener('dragstart', (e) => { if (!isField(e.target)) e.preventDefault(); });
// pinça com dois dedos em qualquer lugar (Safari antigo que ignora o viewport)
addEventListener('touchmove', (e) => { if ((e as TouchEvent).touches.length > 1 && !(e.target as Element)?.closest?.('[data-zoomable]')) e.preventDefault(); }, { passive: false });
