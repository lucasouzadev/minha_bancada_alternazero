/**
 * Zoom e arraste de uma imagem dentro de um quadro: pinça com dois dedos, arrastar quando ampliada,
 * toque duplo (alterna 1× ↔ 2,5×) e roda do mouse. Com a imagem em 1× um arrasto horizontal vira "passar" (onSwipe).
 * É o único lugar do app que libera o zoom (o resto trava os gestos nativos): `data-zoomable` avisa o filtro global.
 */
export interface Zoom { reset(): void; readonly scale: number }

export function zoomable(host: HTMLElement, el: HTMLElement, opts: { max?: number; onSwipe?: (dir: -1 | 1) => void } = {}): Zoom {
  const MAX = opts.max ?? 6;
  host.dataset.zoomable = '';
  host.style.touchAction = 'none';
  let s = 1, x = 0, y = 0;
  const pts = new Map<number, { x: number; y: number }>();
  let pinch: { d: number; s: number } | null = null;
  let down: { x: number; y: number; t: number; moved: boolean } | null = null;
  let lastTap = 0;

  const clampXY = () => {
    const w = el.offsetWidth * s, h = el.offsetHeight * s;
    const mx = Math.max(0, (w - host.clientWidth) / 2), my = Math.max(0, (h - host.clientHeight) / 2);
    x = Math.max(-mx, Math.min(mx, x)); y = Math.max(-my, Math.min(my, y));
  };
  const apply = (animate = false) => {
    clampXY();
    el.style.transition = animate ? 'transform .22s cubic-bezier(.2,.8,.2,1)' : 'none';
    el.style.transform = `translate(${x}px,${y}px) scale(${s})`;
    host.classList.toggle('zoomed', s > 1.02);
  };
  const setScale = (n: number) => { s = Math.max(1, Math.min(MAX, n)); if (s === 1) { x = 0; y = 0; } };
  const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };

  host.addEventListener('pointerdown', (e) => {
    host.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { pinch = { d: dist(), s }; down = null; }
    else if (pts.size === 1) down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
  });
  host.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2 && pinch) { setScale(pinch.s * dist() / pinch.d); apply(); return; }
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) down.moved = true;
    if (s > 1) { x += dx; y += dy; apply(); }
  });
  const end = (e: PointerEvent) => {
    if (!pts.delete(e.pointerId)) return;
    if (pts.size < 2) pinch = null;
    const d = down; if (pts.size > 0 || !d) return;
    down = null;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (e.type === 'pointerup' && s <= 1.02 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) { opts.onSwipe?.(dx < 0 ? 1 : -1); return; }
    if (e.type === 'pointerup' && !d.moved && performance.now() - d.t < 300) {
      const now = performance.now();
      if (now - lastTap < 320) { lastTap = 0; setScale(s > 1.02 ? 1 : 2.5); apply(true); } else lastTap = now;
    }
  };
  host.addEventListener('pointerup', end); host.addEventListener('pointercancel', end);
  host.addEventListener('wheel', (e) => { e.preventDefault(); setScale(s * Math.exp(-e.deltaY * 0.0022)); apply(); }, { passive: false });
  host.addEventListener('dblclick', (e) => { e.preventDefault(); });

  return { reset() { s = 1; x = 0; y = 0; apply(); }, get scale() { return s; } };
}
