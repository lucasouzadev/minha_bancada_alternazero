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
export function toast(msg: string) {
  const t = h('div', { class: 'toast' }, msg); document.body.append(t);
  setTimeout(() => t.classList.add('out'), 1800); setTimeout(() => t.remove(), 2300);
}
export async function share(title: string, text: string, url: string) {
  try {
    if (navigator.share) { await navigator.share({ title, text, url }); return; }
    await navigator.clipboard.writeText(url); toast('Link copiado');
  } catch { /* cancelado */ }
}
export const fmtDate = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });

const ICONS: Record<string, string> = {
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  mark: '<path d="M7 4h10v16l-5-4-5 4z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
};
export function icon(name: keyof typeof ICONS | string) {
  const s = document.createElement('span'); s.className = 'ico-svg';
  s.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return s;
}
