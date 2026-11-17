import * as THREE from 'three';
import { Spring } from '../anim';
import { buildTextures } from '../art';
import { buildBox, type BuiltBox } from '../box';
import { collectionUrl, getOwned, toggleOwned } from '../collection';
import { listDrops } from '../db';
import { GL } from '../gl';
import type { Drop } from '../types';
import { announce, fmtDate, h, icon, reducedMotion, share, toast } from '../ui';

export interface Page { cleanup(): void; sync?(): void }

type Tex = Awaited<ReturnType<typeof buildTextures>>;
interface Slot { drop: Drop; el: HTMLButtonElement; box?: BuiltBox; tex?: Tex; intro?: number; lift: Spring }

const SHELF_POSE = { rx: 0.1, ry: -0.4 };
const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, t), 3);
const TAU = Math.PI * 2;

export async function acervoPage(root: HTMLElement): Promise<Page> {
  const q = new URLSearchParams(location.search).get('c');
  const isShared = q !== null;
  const owned: Set<string> = isShared ? new Set(q!.split(',').filter(Boolean)) : getOwned();
  // casca imediata (cabeçalho + esqueletos) enquanto a lista de drops chega
  const shell = h('div', { class: 'acervo', 'aria-busy': 'true' },
    h('header', { class: 'top' }, h('div', { class: 'brand' }, h('h1', {}, isShared ? 'Coleção' : 'Acervo')), h('i', { class: 'ico' })),
    h('div', { class: 'rows' }, ...[0, 1].map(() => h('div', { class: 'row' }, ...[0, 1, 2].map(() => h('div', { class: 'slot' }))))));
  root.append(shell);
  const drops = (await listDrops()).filter((d) => d.published);
  shell.remove();

  /* ---------- DOM ---------- */
  const calm = reducedMotion();
  const shelfCanvas = h('canvas', { class: 'gl shelf-gl', 'aria-hidden': 'true' });
  const heroCanvas = h('canvas', { class: 'gl hero-gl', 'aria-hidden': 'true' });
  const veil = h('div', { class: 'veil' });
  const count = h('span', { class: 'count', 'data-testid': 'count' });
  const rowsEl = h('main', { class: 'rows', ariaLabel: isShared ? 'Coleção' : 'Prateleira de caixas' });

  const slots: Slot[] = [];
  for (let i = 0; i < Math.max(3, Math.ceil(drops.length / 3) * 3); i += 3) {
    const row = h('div', { class: 'row' });
    for (let j = i; j < i + 3; j++) {
      const d = drops[j];
      if (!d) { row.append(h('div', { class: 'slot empty', 'aria-hidden': 'true' })); continue; }
      const el = h('button', { class: 'slot', ariaLabel: d.name, ariaBusy: 'true', 'data-testid': 'slot', 'data-slug': d.slug });
      row.append(el); slots.push({ drop: d, el, lift: new Spring(0, 260, 22) });
    }
    rowsEl.append(row);
  }

  const ownBtn = h('button', { class: 'ico', ariaLabel: 'Tenho esta caixa', ariaPressed: 'false', 'data-tip': 'Tenho esta caixa' }, icon('mark'));
  const shareBtn = h('button', { class: 'ico', ariaLabel: 'Compartilhar', 'data-tip': 'Compartilhar' }, icon('share'), icon('check'));
  const closeBtn = h('button', { class: 'ico', ariaLabel: 'Fechar', 'data-tip': 'Fechar · Esc' }, icon('close'));
  const openBtn = h('button', { class: 'pill', 'data-testid': 'lid', ariaLabel: 'Abrir tampa' }, 'Abrir');
  const titleEl = h('h2', { class: 'title', id: 'sheet-title' });
  const metaEl = h('p', { class: 'meta' });
  const itemsEl = h('ul', { class: 'items', ariaLabel: 'Dentro da caixa' });
  const grab = h('i', { class: 'grab', 'aria-hidden': 'true' });
  const sheet = h('section', { class: 'sheet', 'data-testid': 'sheet', role: 'dialog', 'aria-labelledby': 'sheet-title', tabIndex: -1 },
    grab,
    h('div', { class: 'acts' }, openBtn, h('span', { class: 'sp' }), isShared ? null : ownBtn, shareBtn, closeBtn),
    titleEl, metaEl, itemsEl);
  sheet.inert = true;

  const shareCol = h('button', { class: 'ico', ariaLabel: 'Compartilhar coleção', 'data-tip': 'Compartilhar coleção', 'data-testid': 'share-collection', onclick: async () => {
    if (!isShared && !countOwned()) { toast('Marque as caixas que você tem para compartilhar a coleção.'); return; }
    const r = await share('Minha coleção', `${countOwned()} de ${drops.length} caixas`, collectionUrl(owned));
    if (r !== 'cancel') flashDone(shareCol);
  } }, icon('share'), icon('check'));
  const header = h('header', { class: 'top' },
    h('div', { class: 'brand' }, h('h1', {}, isShared ? 'Coleção' : 'Acervo'), count),
    h('nav', { class: 'row-r', ariaLabel: 'Ações' },
      isShared ? h('a', { class: 'txt', href: '/', 'data-link': true }, 'Meu acervo') : null,
      shareCol,
      isShared ? null : h('a', { class: 'ico', href: '/admin', 'data-link': true, ariaLabel: 'Editor', 'data-tip': 'Editor' }, icon('edit'))));

  const acervoEl = h('div', { class: 'acervo', 'data-testid': 'acervo' },
      shelfCanvas, header, rowsEl, veil, heroCanvas, sheet);
  if (calm) acervoEl.classList.add('calm');
  root.append(acervoEl);

  const countOwned = () => drops.filter((d) => owned.has(d.slug)).length;
  const renderCount = () => {
    const n = countOwned();
    count.replaceChildren(h('b', {}, String(n)), `/${drops.length}`);
    const what = isShared ? 'nesta coleção' : 'no seu acervo';
    count.title = `${n} de ${drops.length} caixas ${what}`;
    count.setAttribute('aria-label', count.title);
    count.classList.toggle('full', drops.length > 0 && n === drops.length);
  };
  renderCount();
  if (!drops.length) { count.hidden = true; rowsEl.append(h('p', { class: 'empty-line' }, 'Nenhum drop na prateleira ainda.')); }

  /** Confirmação curta no próprio botão (ícone vira ✓ por 1,6 s). */
  function flashDone(btn: HTMLElement) {
    btn.classList.add('done'); setTimeout(() => btn.classList.remove('done'), 1600);
  }

  /* ---------- camadas WebGL ---------- */
  const A = new GL(shelfCanvas);
  const B = new GL(heroCanvas);
  let dirtyA = true;
  let k = 1; // escala cm -> mundo, igual para todas as caixas (tamanhos relativos reais)

  const dim = (box: BuiltBox, on: boolean, f = 1) => {
    const seen = new Set<THREE.Material>();
    box.group.traverse((n) => {
      const m = n as THREE.Mesh; if (!m.isMesh) return;
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((mt) => {
        if (seen.has(mt)) return; seen.add(mt);
        const c = (mt as THREE.MeshStandardMaterial).color; if (!c) return;
        mt.userData.c0 ??= c.clone();
        c.copy(mt.userData.c0).multiplyScalar((on ? 0.3 : 1) * f);
      });
    });
  };

  /** Entrada na prateleira: a caixa "acende" do escuro (sem transparência, que mostraria o interior). */
  const fade = (sl: Slot, f: number) => dim(sl.box!, !owned.has(sl.drop.slug), f);

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
      if (!s.box) {
        // silhueta do esqueleto com o tamanho aproximado da caixa (vista a -0,4 rad)
        const d = s.drop, pw = (d.w * Math.cos(0.4) + d.d * Math.sin(0.4)) * 0.1 * k * A.ppc;
        s.el.style.setProperty('--sk-w', `${Math.round(pw)}px`);
        s.el.style.setProperty('--sk-h', `${Math.round(d.h * 0.1 * k * A.ppc)}px`);
        continue;
      }
      pose(s);
    }
    dirtyA = true;
  }
  /** Pose na prateleira: posição do slot + leve "levantar" no hover/foco. */
  function pose(s: Slot) {
    const p = shelfPx(s), l = s.lift.x, w = A.toWorld(p.x, p.y - l * 6);
    s.box!.group.position.set(w.x, w.y, 0); s.box!.group.scale.setScalar(k * introScale(s));
    s.box!.group.rotation.set(SHELF_POSE.rx, SHELF_POSE.ry + l * 0.22, 0);
  }
  const introScale = (s: Slot) => (s.intro === undefined ? 1 : 0.94 + 0.06 * easeOut(s.intro));
  A.onResize = placeAll;
  const onScroll = () => placeAll();
  addEventListener('scroll', onScroll, { passive: true });

  const aniso = A.renderer.capabilities.getMaxAnisotropy();
  const loading = slots.map(async (s) => {
    s.tex = await buildTextures(s.drop, aniso, 768);
    s.box = buildBox({ ...s.drop, textures: s.tex });
    dim(s.box, !owned.has(s.drop.slug));
    if (!calm) { s.intro = 0; fade(s, 0); }
    A.scene.add(s.box.group); placeAll();
    s.el.classList.add('ready'); s.el.dataset.state = 'ready'; s.el.removeAttribute('aria-busy');
  });

  /* ---------- herói ---------- */
  let current: Slot | null = null, closing = false;
  let hero: BuiltBox | null = null, heroTex: Tex | null = null;
  // com "reduzir movimento": molas rígidas e criticamente amortecidas (sem balanço), sem giro automático
  const sp = (k0: number, c0: number) => (calm ? new Spring(0, 400, 40) : new Spring(0, k0, c0));
  const hx = sp(110, 15), hy = sp(110, 15), hs = sp(120, 14);
  const rx = sp(90, 14), ry = sp(70, 11), lid = sp(90, 15);
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
    metaEl.replaceChildren(...[d.subtitle, fmtDate(d.date)].filter(Boolean).flatMap((t) => [h('span', {}, t)]),
      h('span', { class: 'dims' }, `${d.w} × ${d.h} × ${d.d} mm`));
    itemsEl.replaceChildren(...d.items.map((it) => h('li', {}, it)));
    itemsEl.hidden = !d.items.length;
    setOwnUi(owned.has(d.slug));
    setLidUi(false);
  }
  function setOwnUi(on: boolean) {
    ownBtn.classList.toggle('on', on); ownBtn.ariaPressed = String(on);
    ownBtn.dataset.tip = on ? 'No seu acervo' : 'Tenho esta caixa';
  }
  function setLidUi(on: boolean) {
    lidOn = on; openBtn.textContent = on ? 'Fechar' : 'Abrir';
    openBtn.ariaLabel = on ? 'Fechar tampa' : 'Abrir tampa';
    openBtn.classList.toggle('on', on);
  }

  function openSlot(s: Slot) {
    if (current || !s.box || !s.tex) return;
    const r0 = s.el.getBoundingClientRect();
    if (r0.top < 40 || r0.bottom > innerHeight - 40) { scrollBy({ top: r0.top - innerHeight / 2 + r0.height / 2, behavior: 'instant' as ScrollBehavior }); placeAll(); A.render(); }
    current = s; closing = false; s.lift.snap(0);
    document.body.classList.add('locked');
    fillSheet(s.drop);
    hero = buildBox({ ...s.drop, textures: s.tex });
    B.scene.add(hero.group);
    const p0 = shelfPx(s);
    hx.snap(p0.x); hy.snap(p0.y); hs.snap(k); rx.snap(SHELF_POSE.rx); ry.snap(SHELF_POSE.ry); lid.snap(0);
    s.box.group.visible = false; A.render();
    const e = endPose(s.drop);
    hx.t = e.x; hy.t = e.y; hs.t = sc; rx.t = 0.1; ry.t = calm ? 0 : -TAU;
    idleAt = performance.now() + 1900;
    veil.classList.add('on'); heroCanvas.classList.add('live'); acervoEl.classList.add('open'); acervoEl.dataset.open = s.drop.slug;
    header.inert = rowsEl.inert = true; sheet.inert = false;
    setTimeout(() => {
      if (current !== s || closing) return;
      sheet.classList.add('in');
      sheet.focus({ preventScroll: true });
    }, calm ? 0 : 140);
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
    header.inert = rowsEl.inert = false;
    if (sheet.contains(document.activeElement) || document.activeElement === sheet) current.el.focus({ preventScroll: true });
    sheet.inert = true;
    setLidUi(false); lid.t = 0;
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
  slots.forEach((s) => {
    const up = (on: boolean) => { if (!calm) s.lift.t = on ? 1 : 0; };
    s.el.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && up(true));
    s.el.addEventListener('pointerleave', () => up(false));
    s.el.addEventListener('focus', () => s.el.matches(':focus-visible') && up(true));
    s.el.addEventListener('blur', () => up(false));
  });
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
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') uiClose();
    // setas giram a caixa aberta (teclado)
    else if (current && !closing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !(e.target as HTMLElement).closest('input,textarea,select')) {
      ry.t += (e.key === 'ArrowLeft' ? -1 : 1) * Math.PI / 4; idleAt = performance.now() + 3500; e.preventDefault();
    }
  };
  addEventListener('keydown', onKey);

  const toggleLid = () => {
    if (!hero || closing) return;
    setLidUi(!lidOn); lid.t = lidOn ? 1 : 0;
    if (lidOn) { ry.t = Math.round(ry.x / TAU) * TAU; rx.t = 0.08; }
    hs.t = lidScale(); idleAt = performance.now() + 2500;
  };
  openBtn.onclick = toggleLid;

  ownBtn.onclick = () => {
    if (!current) return;
    const on = toggleOwned(current.drop.slug);
    on ? owned.add(current.drop.slug) : owned.delete(current.drop.slug);
    setOwnUi(on); ownBtn.classList.remove('pop'); void ownBtn.offsetWidth; ownBtn.classList.add('pop');
    dim(current.box!, !on); renderCount();
    announce(on ? `${current.drop.name} marcada como sua. ${countOwned()} de ${drops.length}.` : `${current.drop.name} desmarcada.`);
  };
  shareBtn.onclick = async () => {
    if (!current) return;
    const r = await share(current.drop.name, `Veja a caixa ${current.drop.name} em 3D`, `${location.origin}/c/${current.drop.slug}`);
    if (r !== 'cancel') flashDone(shareBtn);
  };

  // arrastar para girar; toque curto fora da caixa fecha; toque duplo na caixa abre a tampa
  const TAP_MOVE = 6, TAP_MS = 350;
  let drag: { x: number; y: number; dx: number; x0: number; y0: number; t0: number; moved: boolean } | null = null;
  let lastTap = 0;
  const corner = new THREE.Vector3(), bb = new THREE.Box3();
  /** Retângulo da caixa na tela (projeção dos 8 cantos), com folga para o dedo. */
  function heroRect(pad = 18) {
    hero!.group.updateMatrixWorld(true); bb.setFromObject(hero!.group);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).project(B.camera);
      const px = (corner.x + 1) / 2 * B.W, py = (1 - corner.y) / 2 * B.H;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
  }
  const onHero = (x: number, y: number) => { const r = heroRect(); return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1; };

  heroCanvas.addEventListener('pointerdown', (e) => {
    if (!hero || closing) return;
    drag = { x: e.clientX, y: e.clientY, dx: 0, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false };
    heroCanvas.setPointerCapture(e.pointerId);
  });
  heroCanvas.addEventListener('pointermove', (e) => {
    if (!drag) {
      if (hero && !closing && e.pointerType === 'mouse') heroCanvas.style.cursor = onHero(e.clientX, e.clientY) ? 'grab' : '';
      return;
    }
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < TAP_MOVE) return;
    if (!drag.moved) { drag.moved = true; heroCanvas.classList.add('grabbing'); }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.dx = dx;
    ry.x += dx * 0.012; ry.t = ry.x; ry.v = 0;
    rx.x = Math.max(-0.6, Math.min(0.9, rx.x + dy * 0.008)); rx.t = rx.x; rx.v = 0;
    idleAt = performance.now() + 2500;
  });
  const endDrag = (e: PointerEvent) => {
    if (!drag) return;
    const d = drag; drag = null; heroCanvas.classList.remove('grabbing');
    if (d.moved) { ry.t = ry.x + d.dx * 0.012 * (calm ? 2 : 7); idleAt = performance.now() + 2500; return; }
    if (e.type !== 'pointerup' || performance.now() - d.t0 > TAP_MS || !hero || closing) return;
    if (!onHero(e.clientX, e.clientY)) { lastTap = 0; uiClose(); return; }
    const now = performance.now();
    if (now - lastTap < 380) { lastTap = 0; toggleLid(); } else lastTap = now;
  };
  heroCanvas.addEventListener('pointerup', endDrag); heroCanvas.addEventListener('pointercancel', endDrag);

  // arrastar a folha para baixo fecha (distância ou "peteleco" rápido); para cima, resistência elástica
  let sd: { y: number; dy: number; t: number; v: number } | null = null;
  sheet.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button,a') || !current || closing) return;
    sd = { y: e.clientY, dy: 0, t: performance.now(), v: 0 }; sheet.setPointerCapture(e.pointerId); sheet.classList.add('drag');
  });
  sheet.addEventListener('pointermove', (e) => {
    if (!sd) return;
    const raw = e.clientY - sd.y, now = performance.now();
    const dy = raw >= 0 ? raw : -Math.sqrt(-raw) * 2.2;
    sd.v = (dy - sd.dy) / Math.max(1, now - sd.t); sd.t = now; sd.dy = dy;
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const sheetUp = () => {
    if (!sd) return;
    const far = sd.dy > 80 || (sd.dy > 20 && sd.v > 0.6); sd = null; sheet.classList.remove('drag');
    if (far) uiClose(); else sheet.style.transform = '';
  };
  sheet.addEventListener('pointerup', sheetUp); sheet.addEventListener('pointercancel', sheetUp);

  /* ---------- loop ---------- */
  let raf = 0, last = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.033, (now - last) / 1000); last = now;
    if (current && hero) {
      if (!calm && !closing && !drag && !lidOn && now > idleAt) { ry.t += dt * 0.7; rx.t = 0.1; }
      [hx, hy, hs, rx, ry, lid].forEach((s) => {
        if (drag?.moved && (s === rx || s === ry)) return; s.step(dt);
      });
      const pw = B.toWorld(hx.x, hy.x);
      hero.group.position.set(pw.x, pw.y, 0); hero.group.scale.setScalar(hs.x);
      hero.group.rotation.set(rx.x, ry.x, 0); hero.setOpen(lid.x);
      B.render();
      if (closing && ((hx.done && hy.done && hs.done && ry.done && rx.done) || now - closeAt > 1100)) finishClose();
    }
    for (const s of slots) {
      if (!s.box) continue;
      let moved = false;
      if (s.intro !== undefined) {
        s.intro = Math.min(1, s.intro + dt / 0.45);
        fade(s, easeOut(s.intro));
        if (s.intro >= 1) { s.intro = undefined; fade(s, 1); }
        moved = true;
      }
      if (!s.lift.done) { s.lift.step(dt); if (s.lift.done) s.lift.snap(s.lift.t); moved = true; }
      if (moved && s !== current) { pose(s); dirtyA = true; }
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
