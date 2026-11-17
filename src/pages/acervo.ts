import * as THREE from 'three';
import { Spring } from '../anim';
import { buildTextures } from '../art';
import { buildBox, type BuiltBox } from '../box';
import { collectionUrl, getOwned, toggleOwned } from '../collection';
import { listDrops } from '../db';
import { GL } from '../gl';
import type { Drop } from '../types';
import { fmtDate, h, icon, share } from '../ui';

export interface Page { cleanup(): void; sync?(): void }

type Tex = Awaited<ReturnType<typeof buildTextures>>;
interface Slot { drop: Drop; el: HTMLButtonElement; box?: BuiltBox; tex?: Tex }

const SHELF_POSE = { rx: 0.1, ry: -0.4 };
const TAU = Math.PI * 2;

export async function acervoPage(root: HTMLElement): Promise<Page> {
  const q = new URLSearchParams(location.search).get('c');
  const isShared = q !== null;
  const owned: Set<string> = isShared ? new Set(q!.split(',').filter(Boolean)) : getOwned();
  const drops = (await listDrops()).filter((d) => d.published);

  /* ---------- DOM ---------- */
  const shelfCanvas = h('canvas', { class: 'gl shelf-gl' });
  const heroCanvas = h('canvas', { class: 'gl hero-gl' });
  const veil = h('div', { class: 'veil' });
  const count = h('span', { class: 'count', 'data-testid': 'count' });
  const rowsEl = h('main', { class: 'rows' });

  const slots: Slot[] = [];
  for (let i = 0; i < Math.max(3, Math.ceil(drops.length / 3) * 3); i += 3) {
    const row = h('div', { class: 'row' });
    for (let j = i; j < i + 3; j++) {
      const d = drops[j];
      if (!d) { row.append(h('div', { class: 'slot empty' })); continue; }
      const el = h('button', { class: 'slot', ariaLabel: d.name, 'data-testid': 'slot', 'data-slug': d.slug });
      row.append(el); slots.push({ drop: d, el });
    }
    rowsEl.append(row);
  }

  const ownBtn = h('button', { class: 'ico', ariaLabel: 'Tenho esta caixa' }, icon('mark'));
  const shareBtn = h('button', { class: 'ico', ariaLabel: 'Compartilhar' }, icon('share'));
  const closeBtn = h('button', { class: 'ico', ariaLabel: 'Fechar' }, icon('close'));
  const openBtn = h('button', { class: 'pill', 'data-testid': 'lid' }, 'Abrir');
  const titleEl = h('h2', { class: 'title' });
  const metaEl = h('p', { class: 'meta' });
  const itemsEl = h('p', { class: 'items' });
  const sheet = h('section', { class: 'sheet', 'data-testid': 'sheet', ariaLabel: 'Detalhes da caixa' },
    h('i', { class: 'grab' }),
    h('div', { class: 'acts' }, openBtn, h('span', { class: 'sp' }), isShared ? null : ownBtn, shareBtn, closeBtn),
    titleEl, metaEl, itemsEl);

  const acervoEl = h('div', { class: 'acervo', 'data-testid': 'acervo' },
      shelfCanvas,
      h('header', { class: 'top' },
        h('div', { class: 'brand' }, h('b', {}, 'Acervo'), count),
        h('div', { class: 'row-r' },
          isShared ? h('a', { class: 'txt', href: '/', 'data-link': true }, 'Meu acervo') : null,
          h('button', { class: 'ico', ariaLabel: 'Compartilhar coleção', 'data-testid': 'share-collection', onclick: () => share('Minha coleção', `${countOwned()} de ${drops.length} caixas`, collectionUrl(owned)) }, icon('share')),
          h('a', { class: 'ico', href: '/admin', 'data-link': true, ariaLabel: 'Editor' }, icon('edit')))),
      rowsEl, veil, heroCanvas, sheet);
  root.append(acervoEl);

  const countOwned = () => drops.filter((d) => owned.has(d.slug)).length;
  const renderCount = () => { count.textContent = `${countOwned()}/${drops.length}`; };
  renderCount();
  if (!drops.length) rowsEl.append(h('p', { class: 'muted pad' }, 'Nenhum drop publicado ainda.'));

  /* ---------- camadas WebGL ---------- */
  const A = new GL(shelfCanvas);
  const B = new GL(heroCanvas);
  let dirtyA = true;
  let k = 1; // escala cm -> mundo, igual para todas as caixas (tamanhos relativos reais)

  const dim = (box: BuiltBox, on: boolean) => {
    const seen = new Set<THREE.Material>();
    box.group.traverse((n) => {
      const m = n as THREE.Mesh; if (!m.isMesh) return;
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((mt) => {
        if (seen.has(mt)) return; seen.add(mt);
        const c = (mt as THREE.MeshStandardMaterial).color; if (!c) return;
        mt.userData.c0 ??= c.clone();
        c.copy(mt.userData.c0); if (on) c.multiplyScalar(0.3);
      });
    });
  };

  function shelfPx(s: Slot) {
    const r = s.el.getBoundingClientRect();
    const hpx = s.box!.size.y * k * A.ppc;
    return { x: r.left + r.width / 2, y: r.bottom - hpx / 2 - 5 };
  }
  function placeAll() {
    const first = slots[0]?.el.getBoundingClientRect();
    if (first) {
      const mw = Math.max(...drops.map((d) => d.w * 0.1)), mh = Math.max(...drops.map((d) => d.h * 0.1));
      k = Math.min((first.width * 0.8) / (mw * A.ppc), (first.height * 0.86) / (mh * A.ppc));
    }
    for (const s of slots) {
      if (!s.box) continue;
      const p = shelfPx(s), w = A.toWorld(p.x, p.y);
      s.box.group.position.set(w.x, w.y, 0); s.box.group.scale.setScalar(k);
      s.box.group.rotation.set(SHELF_POSE.rx, SHELF_POSE.ry, 0);
    }
    dirtyA = true;
  }
  A.onResize = placeAll;
  const onScroll = () => placeAll();
  addEventListener('scroll', onScroll, { passive: true });

  const aniso = A.renderer.capabilities.getMaxAnisotropy();
  const loading = slots.map(async (s) => {
    s.tex = await buildTextures(s.drop, aniso, 768);
    s.box = buildBox({ ...s.drop, textures: s.tex });
    if (!owned.has(s.drop.slug)) dim(s.box, true);
    A.scene.add(s.box.group); placeAll();
    s.el.classList.add('ready'); s.el.dataset.state = 'ready';
  });

  /* ---------- herói ---------- */
  let current: Slot | null = null, closing = false;
  let hero: BuiltBox | null = null, heroTex: Tex | null = null;
  const hx = new Spring(0, 110, 15), hy = new Spring(0, 110, 15), hs = new Spring(1, 120, 14);
  const rx = new Spring(0, 90, 14), ry = new Spring(0, 70, 11), lid = new Spring(0, 90, 15);
  let lidOn = false, idleAt = 0, closeAt = 0, sc = 1;

  function endPose(drop: Drop) {
    const sz = hero!.size;
    const top = 72, bottom = B.H - sheet.offsetHeight - (parseFloat(getComputedStyle(sheet).bottom) || 10) - 6;
    sc = Math.min(((bottom - top) * 0.78) / (sz.y * B.ppc), (B.W * 0.6) / (sz.x * B.ppc));
    void drop;
    return { x: B.W / 2, y: (top + bottom) / 2 };
  }
  function lidScale() {
    if (!lidOn) return sc;
    const sz = hero!.size, f = hero!.frameSize;
    const maxW = (B.W * 0.94) / (f.x * B.ppc), maxH = ((B.H - sheet.offsetHeight - 120) * 0.92) / (f.y * B.ppc);
    return Math.min(sc, maxW, maxH, (B.W * 0.9) / (sz.x * B.ppc));
  }

  function fillSheet(d: Drop) {
    titleEl.textContent = d.name;
    metaEl.textContent = [d.subtitle, fmtDate(d.date), `${d.w} × ${d.h} × ${d.d} mm`].filter(Boolean).join(' · ');
    itemsEl.textContent = d.items.join(' · ');
    itemsEl.hidden = !d.items.length;
    ownBtn.classList.toggle('on', owned.has(d.slug));
    openBtn.textContent = 'Abrir'; lidOn = false;
  }

  function openSlot(s: Slot) {
    if (current || !s.box || !s.tex) return;
    const r0 = s.el.getBoundingClientRect();
    if (r0.top < 40 || r0.bottom > innerHeight - 40) { scrollBy({ top: r0.top - innerHeight / 2 + r0.height / 2, behavior: 'instant' as ScrollBehavior }); placeAll(); A.render(); }
    current = s; closing = false;
    document.body.classList.add('locked');
    fillSheet(s.drop);
    hero = buildBox({ ...s.drop, textures: s.tex });
    B.scene.add(hero.group);
    const p0 = shelfPx(s);
    hx.snap(p0.x); hy.snap(p0.y); hs.snap(k); rx.snap(SHELF_POSE.rx); ry.snap(SHELF_POSE.ry); lid.snap(0);
    s.box.group.visible = false; A.render();
    const e = endPose(s.drop);
    hx.t = e.x; hy.t = e.y; hs.t = sc; rx.t = 0.1; ry.t = -TAU;
    idleAt = performance.now() + 1900;
    veil.classList.add('on'); heroCanvas.classList.add('live'); acervoEl.classList.add('open'); acervoEl.dataset.open = s.drop.slug;
    setTimeout(() => current === s && sheet.classList.add('in'), 140);
    // textura em alta, trocada quando chegar
    buildTextures(s.drop, B.renderer.capabilities.getMaxAnisotropy(), 2048).then((t) => {
      if (current !== s || !hero) { Object.values(t).forEach((x) => x!.dispose()); return; }
      const nb = buildBox({ ...s.drop, textures: t });
      nb.group.position.copy(hero.group.position); nb.group.rotation.copy(hero.group.rotation); nb.group.scale.copy(hero.group.scale);
      nb.setOpen(lid.x); B.scene.remove(hero.group); hero.dispose(); B.scene.add(nb.group); hero = nb;
      heroTex = t;
    });
  }

  function beginClose() {
    if (!current || closing) return;
    closing = true; sheet.style.transform = ''; sheet.classList.remove('in'); veil.classList.remove('on'); acervoEl.classList.remove('open');
    lidOn = false; lid.t = 0;
    const n = Math.round(ry.x / TAU); ry.x -= n * TAU; ry.t = SHELF_POSE.ry;
    rx.t = SHELF_POSE.rx;
    const p = shelfPx(current); hx.t = p.x; hy.t = p.y; hs.t = k;
    closeAt = performance.now();
  }
  function finishClose() {
    const s = current!; B.scene.remove(hero!.group); hero!.dispose(); hero = null;
    if (heroTex) { Object.values(heroTex).forEach((t) => t!.dispose()); heroTex = null; }
    s.box!.group.visible = true; dirtyA = true;
    heroCanvas.classList.remove('live'); document.body.classList.remove('locked');
    current = null; closing = false; B.renderer.clear(); delete acervoEl.dataset.open;
  }

  /* ---------- interações ---------- */
  slots.forEach((s) => s.el.addEventListener('click', () => {
    if (!s.box || current) return;
    history.pushState({ open: true }, '', `/c/${s.drop.slug}${location.search}`);
    openSlot(s);
  }));
  const uiClose = () => {
    if (!current || closing) return;
    if (history.state?.open) history.back();
    else { history.replaceState({}, '', `/${location.search}`); beginClose(); }
  };
  closeBtn.onclick = uiClose; veil.onclick = uiClose;
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && uiClose();
  addEventListener('keydown', onKey);

  const toggleLid = () => {
    if (!hero || closing) return;
    lidOn = !lidOn; lid.t = lidOn ? 1 : 0; openBtn.textContent = lidOn ? 'Fechar' : 'Abrir';
    if (lidOn) { ry.t = Math.round(ry.x / TAU) * TAU; rx.t = 0.08; }
    hs.t = lidScale(); idleAt = performance.now() + 2500;
  };
  openBtn.onclick = toggleLid; heroCanvas.addEventListener('dblclick', toggleLid);

  ownBtn.onclick = () => {
    if (!current) return;
    const on = toggleOwned(current.drop.slug);
    on ? owned.add(current.drop.slug) : owned.delete(current.drop.slug);
    ownBtn.classList.toggle('on', on); ownBtn.classList.remove('pop'); void ownBtn.offsetWidth; ownBtn.classList.add('pop');
    dim(current.box!, !on); renderCount();
  };
  shareBtn.onclick = () => current && share(current.drop.name, `Veja a caixa ${current.drop.name} em 3D`, `${location.origin}/c/${current.drop.slug}`);

  // arrastar para girar
  let drag: { x: number; y: number; dx: number } | null = null;
  heroCanvas.addEventListener('pointerdown', (e) => { if (!hero || closing) return; drag = { x: e.clientX, y: e.clientY, dx: 0 }; heroCanvas.setPointerCapture(e.pointerId); });
  heroCanvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.dx = dx;
    ry.x += dx * 0.012; ry.t = ry.x; ry.v = 0;
    rx.x = Math.max(-0.6, Math.min(0.9, rx.x + dy * 0.008)); rx.t = rx.x; rx.v = 0;
    idleAt = performance.now() + 2500;
  });
  const endDrag = () => { if (drag) { ry.t = ry.x + drag.dx * 0.012 * 7; drag = null; idleAt = performance.now() + 2500; } };
  heroCanvas.addEventListener('pointerup', endDrag); heroCanvas.addEventListener('pointercancel', endDrag);

  // arrastar a folha para baixo fecha
  let sd: { y: number; dy: number } | null = null;
  sheet.addEventListener('pointerdown', (e) => { if ((e.target as HTMLElement).closest('button')) return; sd = { y: e.clientY, dy: 0 }; sheet.setPointerCapture(e.pointerId); sheet.classList.add('drag'); });
  sheet.addEventListener('pointermove', (e) => { if (!sd) return; sd.dy = Math.max(0, e.clientY - sd.y); sheet.style.transform = `translateY(${sd.dy}px)`; });
  const sheetUp = () => { if (!sd) return; const far = sd.dy > 80; sd = null; sheet.classList.remove('drag'); if (far) uiClose(); else sheet.style.transform = ''; };
  sheet.addEventListener('pointerup', sheetUp); sheet.addEventListener('pointercancel', sheetUp);

  /* ---------- loop ---------- */
  let raf = 0, last = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.033, (now - last) / 1000); last = now;
    if (current && hero) {
      if (!closing && !drag && !lidOn && now > idleAt) { ry.t += dt * 0.7; rx.t = 0.1; }
      [hx, hy, hs, rx, ry, lid].forEach((sp) => {
        if (drag && (sp === rx || sp === ry)) return; sp.step(dt);
      });
      const pw = B.toWorld(hx.x, hy.x);
      hero.group.position.set(pw.x, pw.y, 0); hero.group.scale.setScalar(hs.x);
      hero.group.rotation.set(rx.x, ry.x, 0); hero.setOpen(lid.x);
      B.render();
      if (closing && ((hx.done && hy.done && hs.done && ry.done && rx.done) || now - closeAt > 1100)) finishClose();
    }
    if (dirtyA) { A.render(); dirtyA = false; }
  };
  raf = requestAnimationFrame(frame);

  /* ---------- rota ---------- */
  const bySlug = (slug: string) => slots.find((s) => s.drop.slug === slug);
  const sync = () => {
    const m = location.pathname.match(/^\/c\/([^/]+)/);
    if (m) { const s = bySlug(decodeURIComponent(m[1])); if (s && !current) openSlot(s); }
    else if (current && !closing) beginClose();
  };
  Promise.all(loading).then(() => { sync(); });

  return {
    sync,
    cleanup() {
      cancelAnimationFrame(raf); removeEventListener('scroll', onScroll); removeEventListener('keydown', onKey);
      document.body.classList.remove('locked'); A.dispose(); B.dispose();
    },
  };
}
