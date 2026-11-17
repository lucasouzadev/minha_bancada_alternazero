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
};
export function icon(name: keyof typeof ICONS | string, size = 22) {
  const s = document.createElement('span'); s.className = 'ico-svg'; s.setAttribute('aria-hidden', 'true');
  s.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return s;
}
