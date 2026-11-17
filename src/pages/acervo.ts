import * as THREE from 'three';
import { Spring } from '../anim';
import { buildTextures, templateCanvas } from '../art';
import { buildBox, type BuiltBox } from '../box';
import { collectionUrl, getOwned, toggleOwned } from '../collection';
import { listDrops } from '../db';
import { GL } from '../gl';
import { dielineRects } from '../layout';
import { FACES, type Drop, type Face } from '../types';
import { zoomable, type Zoom } from '../zoom';
import { announce, fmtDate, h, icon, reducedMotion, share, toast, usingKeyboard } from '../ui';

export interface Page { cleanup(): void; sync?(): void }

type Tex = Awaited<ReturnType<typeof buildTextures>>;
interface Slot { drop: Drop; el: HTMLButtonElement; box?: BuiltBox; tex?: Tex; intro?: number; lift: Spring }

const SHELF_POSE = { rx: 0.1, ry: -0.4 };
const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, t), 3);
const TAU = Math.PI * 2;
type Mode = 'box' | 'art' | 'pano';
const MODES: [Mode, string][] = [['box', 'Caixa'], ['art', 'Arte'], ['pano', 'Planificada']];
const FACE_SHORT: Record<Face, string> = { front: 'Frente', back: 'Verso', left: 'Esquerda', right: 'Direita', top: 'Topo', bottom: 'Fundo' };
const FACE_ORDER: Face[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];
const canvasUrl = (c: HTMLCanvasElement) => new Promise<string>((res) => c.toBlob((b) => res(URL.createObjectURL(b!)), 'image/jpeg', 0.92));
const FINISH: Record<Drop['finish'], string> = { matte: 'Fosco', satin: 'Acetinado', gloss: 'Brilho (verniz)' };
/** Número de colunas da prateleira definido no CSS para a tela atual. */
const colsOf = (el: Element) => Math.max(1, parseInt(getComputedStyle(el).getPropertyValue('--cols')) || 3);

export async function acervoPage(root: HTMLElement): Promise<Page> {
  const q = new URLSearchParams(location.search).get('c');
  const isShared = q !== null;
  const owned: Set<string> = isShared ? new Set(q!.split(',').filter(Boolean)) : getOwned();
  // casca imediata (cabeçalho + esqueletos) enquanto a lista de drops chega
  const shellRows = h('div', { class: 'rows' });
  const shell = h('div', { class: 'acervo', 'aria-busy': 'true' },
    h('header', { class: 'top' }, h('div', { class: 'brand' }, h('h1', {}, isShared ? 'Coleção' : 'Acervo')), h('i', { class: 'ico' })), shellRows);
  root.append(shell);
  { const c = colsOf(shell); const n = c >= 6 ? c : c * 2; for (let i = 0; i < n; i += c) shellRows.append(h('div', { class: 'row' }, ...Array.from({ length: c }, () => h('div', { class: 'slot' })))); }
  const drops = (await listDrops()).filter((d) => d.published);
  shell.remove();

  /* ---------- DOM ---------- */
  const calm = reducedMotion();
  const shelfCanvas = h('canvas', { class: 'gl shelf-gl', 'aria-hidden': 'true' });
  const heroCanvas = h('canvas', { class: 'gl hero-gl', 'aria-hidden': 'true' });
  const veil = h('div', { class: 'veil' });
  const count = h('span', { class: 'count', 'data-testid': 'count' });
  const rowsEl = h('main', { class: 'rows', ariaLabel: isShared ? 'Coleção' : 'Prateleira de caixas' });

  const slots: Slot[] = drops.map((d) => ({
    drop: d, lift: new Spring(0, 260, 22),
    el: h('button', { class: 'slot', ariaLabel: d.name, ariaBusy: 'true', 'data-testid': 'slot', 'data-slug': d.slug, 'data-tip': d.name }),
  }));
  /** Colunas vêm do CSS (--cols por classe de tela); cada fileira é uma tábua. Reagrupa só quando muda. */
  let cols = 0;
  function groupRows() {
    const c = Math.max(1, Math.min(colsOf(acervoEl), slots.length || 1));
    if (c === cols) return;
    cols = c;
    const focused = slots.find((s) => s.el === document.activeElement);
    rowsEl.style.setProperty('--c', String(c));
    rowsEl.querySelectorAll('.row').forEach((r) => r.remove());
    const n = Math.max(1, Math.ceil(slots.length / c));
    for (let i = 0; i < n; i++) rowsEl.append(h('div', { class: 'row' }, ...slots.slice(i * c, i * c + c).map((s) => s.el)));
    focused?.el.focus({ preventScroll: true });
  }

  const ownBtn = h('button', { class: 'ico', ariaLabel: 'Tenho esta caixa', ariaPressed: 'false', 'data-tip': 'Tenho esta caixa' }, icon('mark'));
  const shareBtn = h('button', { class: 'ico', ariaLabel: 'Compartilhar', 'data-tip': 'Compartilhar' }, icon('share'), icon('check'));
  const closeBtn = h('button', { class: 'ico', ariaLabel: 'Fechar', 'data-tip': 'Fechar · Esc' }, icon('close'));
  const openBtn = h('button', { class: 'pill', 'data-testid': 'lid', ariaLabel: 'Abrir tampa' }, 'Abrir');
  const titleEl = h('h2', { class: 'title', id: 'sheet-title' });
  const metaEl = h('p', { class: 'meta' });
  const itemsEl = h('ul', { class: 'items', ariaLabel: 'Dentro da caixa' });
  // ficha técnica: só aparece no painel lateral de telas grandes (o CSS esconde no resto)
  const specsEl = h('dl', { class: 'specs' });
  const grab = h('button', { class: 'grab', type: 'button', ariaLabel: 'Recolher detalhes', ariaExpanded: 'true', 'data-testid': 'grab' });
  // faixa que fica visível quando a folha está recolhida (só a caixa na tela)
  const peekLid = h('button', { class: 'pill sm', type: 'button', ariaLabel: 'Abrir tampa' }, 'Abrir');
  const peekClose = h('button', { class: 'ico', type: 'button', ariaLabel: 'Fechar' }, icon('close'));
  const peekBar = h('div', { class: 'peek-bar' }, peekLid, peekClose);
  const collapseBtn = h('button', { class: 'ico collapse', type: 'button', ariaLabel: 'Recolher detalhes', 'data-tip': 'Recolher', 'data-testid': 'collapse' }, icon('chev'));
  const peekTab = h('button', { class: 'peek-tab', type: 'button', hidden: true, 'data-testid': 'peek-tab' }, icon('chev'), 'Detalhes');
  const sheet = h('section', { class: 'sheet', 'data-testid': 'sheet', role: 'dialog', 'aria-labelledby': 'sheet-title', tabIndex: -1 },
    grab,
    h('div', { class: 'acts' }, openBtn, h('span', { class: 'sp' }), isShared ? null : ownBtn, shareBtn, collapseBtn, closeBtn),
    titleEl, metaEl, itemsEl, specsEl, peekBar);
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

  /* ---------- modos: Caixa · Arte · Planificada ---------- */
  const modeBtns = MODES.map(([v, l]) => h('button', { type: 'button', role: 'radio', 'data-mode': v, 'data-testid': `mode-${v}`, 'aria-checked': String(v === 'box'), onclick: () => { void setMode(v); } }, l));
  const modes = h('div', { class: 'modes seg', role: 'radiogroup', ariaLabel: 'Modo de visualização' }, ...modeBtns);
  modes.inert = true;
  const artImg = h('img', { class: 'art-img', alt: '', draggable: false });
  const guidesSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  guidesSvg.setAttribute('class', 'art-guides'); guidesSvg.setAttribute('aria-hidden', 'true'); guidesSvg.setAttribute('preserveAspectRatio', 'none');
  const artWrap = h('div', { class: 'art-wrap' }, artImg, guidesSvg);
  const artEmpty = h('p', { class: 'art-empty', hidden: true }, 'Sem arte nesta face.');
  const artHost = h('div', { class: 'art-host', 'data-testid': 'art-host' }, artWrap, artEmpty);
  const faceTabs = h('div', { class: 'face-tabs', role: 'tablist', ariaLabel: 'Face da caixa' },
    ...FACE_ORDER.map((f) => h('button', { type: 'button', role: 'tab', 'data-face': f, 'data-testid': `face-${f}`, onclick: () => { void showFace(f); } }, FACE_SHORT[f])));
  const guidesBtn = h('button', { class: 'chip guides-btn', type: 'button', ariaPressed: 'false', 'data-testid': 'guides', onclick: () => {
    const on = !artView.classList.contains('guides'); artView.classList.toggle('guides', on); guidesBtn.ariaPressed = String(on);
  } }, 'Guias de dobra');
  const artNote = h('p', { class: 'art-note', hidden: true });
  const artView = h('div', { class: 'artview', 'data-testid': 'artview', hidden: true }, artHost, faceTabs, guidesBtn, artNote);
  const acervoEl = h('div', { class: 'acervo', 'data-testid': 'acervo' },
      shelfCanvas, header, rowsEl, veil, heroCanvas, artView, sheet, modes, peekTab);
  if (calm) acervoEl.classList.add('calm');
  root.append(acervoEl);
  groupRows();

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
  A.onResize = () => { groupRows(); placeAll(); };
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
  let peek = false, mode: Mode = 'box';
  let heroTexP: Promise<Tex> | null = null;

  /** Região livre para a caixa aberta: acima da folha (folha embaixo) ou à esquerda dela (painel lateral). */
  function freeRegion() {
    const W = B.W, H = B.H, v = getComputedStyle(veil);
    const sa = { t: parseFloat(v.paddingTop) || 0, r: parseFloat(v.paddingRight) || 0, b: parseFloat(v.paddingBottom) || 0, l: parseFloat(v.paddingLeft) || 0 };
    const m = Math.round(Math.max(14, Math.min(40, Math.min(W, H) * 0.04)));
    // offsetLeft/offsetTop ignoram o transform (a folha pode estar entrando/saindo)
    const cs = getComputedStyle(sheet);
    if (cs.getPropertyValue('--dock').trim() === 'side')
      return { x0: sa.l + m, y0: sa.t + 64, x1: (peek ? W - sa.r : sheet.offsetLeft) - m, y1: H - sa.b - m };
    // folha recolhida: só a faixa de 68 px (+ folga) fica por baixo; a caixa usa o resto
    const bottom = peek ? H - sa.b - (parseFloat(cs.getPropertyValue('--peek')) || 68) - 10 : sheet.offsetTop;
    return { x0: sa.l + m, y0: sa.t + (H > 640 ? 64 : 48), x1: W - sa.r - m, y1: bottom - m };
  }
  const tmpPos = new THREE.Vector3(), tmpRot = new THREE.Euler(), tmpScale = new THREE.Vector3();
  /** Retângulo na tela da caixa numa pose hipotética (centro em px, escala, giro, tampa). */
  function rectAt(cx: number, cy: number, s: number, rxv: number, ryv: number, open: number) {
    const g = hero!.group, w = B.toWorld(cx, cy);
    g.position.set(w.x, w.y, 0); g.scale.setScalar(s); g.rotation.set(rxv, ryv, 0); hero!.setOpen(open);
    return heroRect(0);
  }
  /**
   * Alvo da caixa aberta: cabe na região livre com margem (perspectiva incluída, medindo a projeção real),
   * centralizada nela. Tampa fechada: mede vários ângulos do giro; tampa aberta: a pose de frente.
   */
  function fitHero() {
    if (!hero || !current || closing) return;
    const R = freeRegion();
    const rw = Math.max(40, R.x1 - R.x0), rh = Math.max(40, R.y1 - R.y0);
    const gx = (R.x0 + R.x1) / 2, gy = (R.y0 + R.y1) / 2;
    const maxW = Math.min(rw * (lidOn ? 0.96 : 0.84), 1100), maxH = Math.min(rh * (lidOn ? 0.92 : 0.84), 860);
    const angles = lidOn ? [0] : [0, 0.4, 0.8, 1.2, Math.PI / 2];
    const rxv = lidOn ? 0.08 : 0.1, open = lidOn ? 1 : 0;
    const g = hero.group;
    B.camera.updateMatrixWorld(); // a projeção abaixo não pode depender de já ter havido um render
    tmpPos.copy(g.position); tmpRot.copy(g.rotation); tmpScale.copy(g.scale);
    let s = sc > 0 ? sc : k, cx = gx, cy = gy;
    for (let i = 0; i < 5; i++) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const a of angles) {
        const r = rectAt(cx, cy, s, rxv, a, open);
        x0 = Math.min(x0, r.x0); y0 = Math.min(y0, r.y0); x1 = Math.max(x1, r.x1); y1 = Math.max(y1, r.y1);
      }
      const f = Math.min(maxW / (x1 - x0), maxH / (y1 - y0));
      // o desvio do retângulo em relação ao pivô escala junto com a caixa
      const ox = (x0 + x1) / 2 - cx, oy = (y0 + y1) / 2 - cy;
      s *= f; cx = gx - ox * f; cy = gy - oy * f;
    }
    g.position.copy(tmpPos); g.rotation.copy(tmpRot); g.scale.copy(tmpScale); hero.setOpen(lid.x);
    if (!lidOn) sc = s;
    hx.t = cx; hy.t = cy; hs.t = s;
  }
  // mudou o tamanho da tela/folha com a caixa aberta: reposiciona (nada fica fora da tela)
  let refitRaf = 0;
  const refit = () => {
    cancelAnimationFrame(refitRaf);
    refitRaf = requestAnimationFrame(() => {
      if (!current || !hero) return;
      if (closing) { const p = shelfPx(current); hx.t = p.x; hy.t = p.y; hs.t = k; }
      else { fitHero(); if (mode !== 'box') placeArt(); }
    });
  };
  B.onResize = refit;
  const sheetRO = new ResizeObserver(refit); sheetRO.observe(sheet);

  function fillSheet(d: Drop) {
    titleEl.textContent = d.name;
    metaEl.replaceChildren(...[d.subtitle, fmtDate(d.date)].filter(Boolean).flatMap((t) => [h('span', {}, t)]),
      h('span', { class: 'dims' }, `${d.w} × ${d.h} × ${d.d} mm`));
    itemsEl.replaceChildren(...d.items.map((it) => h('li', {}, it)));
    itemsEl.hidden = !d.items.length;
    const spec: [string, string][] = [
      ['Artista', d.artist], ['Acabamento', FINISH[d.finish]], ['Abertura', d.openMode === 'book' ? 'Livro (capa lateral)' : 'Tampa no topo'],
      ['Medidas', `${d.w} × ${d.h} × ${d.d} mm`], ['Tags', d.tags.join(', ')]];
    specsEl.replaceChildren(...spec.filter(([, v]) => v).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
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
    peekLid.textContent = openBtn.textContent; peekLid.ariaLabel = openBtn.ariaLabel;
  }

  /* ---------- folha recolhida: só a caixa em tela ---------- */
  const docked = () => getComputedStyle(sheet).getPropertyValue('--dock').trim();
  function setPeek(on: boolean) {
    if (!current || closing || peek === on) return;
    peek = on;
    sheet.classList.toggle('peek', on); acervoEl.classList.toggle('peeked', on);
    grab.ariaExpanded = String(!on); grab.ariaLabel = on ? 'Mostrar detalhes' : 'Recolher detalhes';
    // o que está fora da faixa visível não recebe foco nem leitor de tela
    for (const el of [...sheet.children] as HTMLElement[]) if (el !== grab && el !== peekBar && el !== titleEl) el.inert = on;
    peekTab.hidden = !(on && docked() === 'side');
    announce(on ? 'Detalhes recolhidos' : 'Detalhes à mostra');
    refit();
    if (!on) setTimeout(() => { if (current === slotNow() && !closing && !peek) sheet.focus({ preventScroll: true }); }, 0);
  }
  const slotNow = () => current;
  grab.onclick = () => { if (!justDragged) setPeek(!peek); };
  collapseBtn.onclick = () => setPeek(true);
  peekTab.onclick = () => setPeek(false);
  peekClose.onclick = () => uiClose();
  peekLid.onclick = () => toggleLid();
  let justDragged = false;

  /* ---------- modos Caixa · Arte · Planificada ---------- */
  let artUrls: string[] = [];
  let facesSrc: Partial<Record<Face, string>> | null = null, panoSrc: string | null = null;
  let face: Face = 'front';
  let zoom: Zoom | null = null;
  let panoRatio = 1, buildToken = 0;
  const releaseArt = () => { artUrls.forEach((u) => URL.revokeObjectURL(u)); artUrls = []; facesSrc = null; panoSrc = null; };
  const own = (u: string) => { artUrls.push(u); return u; };

  /** O quadro da arte ocupa exatamente a região livre (acima da folha / ao lado do painel). */
  function placeArt() {
    const R = freeRegion();
    Object.assign(artView.style, { left: `${R.x0}px`, top: `${R.y0 - 6}px`, width: `${Math.max(80, R.x1 - R.x0)}px`, height: `${Math.max(80, R.y1 - R.y0 + 6)}px` });
    fitArt();
  }
  /** Imagem "contida" no quadro, em px (o SVG das guias acompanha o mesmo retângulo). */
  function fitArt() {
    const W = artHost.clientWidth, H = artHost.clientHeight; if (!W || !H) return;
    const r = mode === 'pano' ? panoRatio : (artImg.naturalWidth && artImg.naturalHeight ? artImg.naturalWidth / artImg.naturalHeight : 1);
    let w = W, hh = W / r; if (hh > H) { hh = H; w = H * r; }
    artWrap.style.width = `${Math.round(w)}px`; artWrap.style.height = `${Math.round(hh)}px`;
  }
  artImg.addEventListener('load', fitArt);

  async function texSet() { return heroTexP ? await heroTexP : null; }
  async function facesUrls(): Promise<Partial<Record<Face, string>>> {
    if (facesSrc) return facesSrc;
    const t = await texSet(); const out: Partial<Record<Face, string>> = {};
    if (t) for (const f of FACES) { const c = t[f]?.image as HTMLCanvasElement | undefined; if (c) out[f] = own(await canvasUrl(c)); }
    return (facesSrc = out);
  }
  /** Planificada: a faca como foi enviada; no modo "uma imagem por face", compõe a cruz; sem arte, mostra o gabarito. */
  async function panoUrl(d: Drop): Promise<{ url: string; note: string }> {
    if (panoSrc) return { url: panoSrc, note: '' };
    const { rects, totalW, totalH } = dielineRects(d.w, d.h, d.d);
    panoRatio = totalW / totalH;
    if (d.artMode === 'dieline' && d.art.dieline) return { url: (panoSrc = own(URL.createObjectURL(d.art.dieline))), note: '' };
    const t = await texSet();
    const has = !!t && FACES.some((f) => t[f]);
    if (!has) return { url: (panoSrc = own(await canvasUrl(templateCanvas(d.w, d.h, d.d)))), note: 'Sem arte enviada: mostrando o gabarito.' };
    const k = 2400 / Math.max(totalW, totalH), c = document.createElement('canvas');
    c.width = Math.round(totalW * k); c.height = Math.round(totalH * k);
    const g = c.getContext('2d')!; g.fillStyle = '#17171b'; g.fillRect(0, 0, c.width, c.height);
    for (const f of FACES) { const im = t![f]?.image as HTMLCanvasElement | undefined, r = rects[f]; if (im) g.drawImage(im, r.x * k, r.y * k, r.w * k, r.h * k); }
    return { url: (panoSrc = own(await canvasUrl(c))), note: '' };
  }
  function drawGuides(d: Drop) {
    const { rects, totalW, totalH } = dielineRects(d.w, d.h, d.d);
    guidesSvg.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);
    guidesSvg.replaceChildren();
    const ns = 'http://www.w3.org/2000/svg', fs = Math.max(6, Math.min(d.w, d.h, d.d) * 0.16);
    for (const f of FACES) {
      const r = rects[f];
      const rc = document.createElementNS(ns, 'rect');
      for (const [k, v] of Object.entries({ x: r.x, y: r.y, width: r.w, height: r.h, fill: 'none', stroke: 'rgba(255,255,255,.85)', 'stroke-width': 1.4, 'stroke-dasharray': '5 4', 'vector-effect': 'non-scaling-stroke' })) rc.setAttribute(k, String(v));
      const tx = document.createElementNS(ns, 'text');
      for (const [k, v] of Object.entries({ x: r.x + r.w / 2, y: r.y + r.h / 2, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': fs, fill: 'rgba(255,255,255,.9)', 'paint-order': 'stroke', stroke: 'rgba(0,0,0,.55)', 'stroke-width': fs * 0.18 })) tx.setAttribute(k, String(v));
      tx.textContent = FACE_SHORT[f]; g2(rc, tx);
    }
    function g2(...n: Element[]) { guidesSvg.append(...n); }
  }
  async function showFace(f: Face) {
    if (!current) return;
    face = f; zoom?.reset();
    faceTabs.querySelectorAll('button').forEach((b) => { const on = b.dataset.face === f; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on) b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' as ScrollBehavior }); });
    const tok = ++buildToken, src = (await facesUrls())[f];
    if (tok !== buildToken || mode !== 'art') return;
    artEmpty.hidden = !!src; artWrap.style.visibility = src ? '' : 'hidden';
    artImg.alt = `${FACE_SHORT[f]} da caixa ${current.drop.name}`;
    if (src) artImg.src = src; else artImg.removeAttribute('src');
    announce(FACE_SHORT[f]);
  }
  function stepFace(dir: -1 | 1) {
    const i = FACE_ORDER.indexOf(face), n = (i + dir + FACE_ORDER.length) % FACE_ORDER.length;
    void showFace(FACE_ORDER[n]);
  }
  async function setMode(m: Mode, instant = false) {
    if (!current || (closing && !instant) || mode === m) return;
    const tok = ++buildToken; mode = m;
    modeBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === m)));
    acervoEl.dataset.mode = m;
    const art = m !== 'box';
    artView.hidden = !art; artView.classList.toggle('pano', m === 'pano'); artView.classList.toggle('face', m === 'art');
    heroCanvas.style.visibility = art ? 'hidden' : '';
    zoom?.reset();
    if (!art) { artNote.hidden = true; if (hero) fitHero(); announce('Caixa em 3D'); return; }
    placeArt();
    if (m === 'art') { guidesSvg.replaceChildren(); artNote.hidden = true; await showFace(face); announce('Arte da caixa'); }
    else {
      artEmpty.hidden = true; artWrap.style.visibility = '';
      const d = current.drop, r = await panoUrl(d);
      if (tok !== buildToken || mode !== 'pano') return;
      drawGuides(d); artImg.alt = `Planificação da caixa ${d.name}`; artImg.src = r.url;
      artNote.textContent = r.note; artNote.hidden = !r.note; fitArt(); announce('Planificada');
    }
  }
  /** Volta ao estado inicial (caixa 3D, folha aberta) ao abrir ou fechar uma caixa. */
  function resetView(dropArt = false) {
    peek = false; sheet.classList.remove('peek'); acervoEl.classList.remove('peeked'); peekTab.hidden = true;
    grab.ariaExpanded = 'true'; grab.ariaLabel = 'Recolher detalhes';
    for (const el of [...sheet.children] as HTMLElement[]) el.inert = false;
    mode = 'box'; ++buildToken; delete acervoEl.dataset.mode;
    modeBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === 'box')));
    artView.hidden = true; heroCanvas.style.visibility = ''; artView.classList.remove('guides', 'pano', 'face'); guidesBtn.ariaPressed = 'false';
    zoom?.reset(); face = 'front';
    if (dropArt) { artImg.removeAttribute('src'); releaseArt(); }
  }
  zoom = zoomable(artHost, artWrap, { onSwipe: (dir) => { if (mode === 'art') stepFace(dir); } });

  function openSlot(s: Slot) {
    if (current || !s.box || !s.tex) return;
    const r0 = s.el.getBoundingClientRect();
    if (r0.top < 40 || r0.bottom > innerHeight - 40) { scrollBy({ top: r0.top - innerHeight / 2 + r0.height / 2, behavior: 'instant' as ScrollBehavior }); placeAll(); A.render(); }
    current = s; closing = false; s.lift.snap(0);
    resetView();
    document.body.classList.add('locked');
    fillSheet(s.drop);
    hero = buildBox({ ...s.drop, textures: s.tex });
    B.scene.add(hero.group);
    const p0 = shelfPx(s);
    hx.snap(p0.x); hy.snap(p0.y); hs.snap(k); rx.snap(SHELF_POSE.rx); ry.snap(SHELF_POSE.ry); lid.snap(0);
    s.box.group.visible = false; A.render();
    sc = 0; fitHero();
    rx.t = 0.1; ry.t = calm ? 0 : -TAU;
    idleAt = performance.now() + 1900;
    veil.classList.add('on'); heroCanvas.classList.add('live'); acervoEl.classList.add('open'); acervoEl.dataset.open = s.drop.slug;
    header.inert = rowsEl.inert = true; sheet.inert = false; modes.inert = false;
    setTimeout(() => {
      if (current !== s || closing) return;
      sheet.classList.add('in');
      sheet.focus({ preventScroll: true });
    }, calm ? 0 : 140);
    // textura em alta, trocada quando chegar
    heroTexP = buildTextures(s.drop, B.renderer.capabilities.getMaxAnisotropy(), 2048);
    heroTexP.then((t) => {
      if (current !== s || !hero) { Object.values(t).forEach((x) => x!.dispose()); return; }
      const nb = buildBox({ ...s.drop, textures: t });
      nb.group.position.copy(hero.group.position); nb.group.rotation.copy(hero.group.rotation); nb.group.scale.copy(hero.group.scale);
      nb.setOpen(lid.x); B.scene.remove(hero.group); hero.dispose(); B.scene.add(nb.group); hero = nb;
      heroTex = t;
    });
  }

  function beginClose() {
    if (!current || closing) return;
    closing = true; sheet.style.transform = ''; sheet.classList.remove('in', 'peek'); veil.classList.remove('on'); acervoEl.classList.remove('open');
    modes.inert = true; peekTab.hidden = true; resetView(true);
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
    current = null; closing = false; B.renderer.clear(); delete acervoEl.dataset.open; heroTexP = null;
  }

  /* ---------- interações ---------- */
  slots.forEach((s) => {
    const up = (on: boolean) => { if (!calm) s.lift.t = on ? 1 : 0; };
    s.el.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && up(true));
    s.el.addEventListener('pointerleave', () => up(false));
    s.el.addEventListener('focus', () => usingKeyboard() && s.el.matches(':focus-visible') && up(true));
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
    else if (!current && /^(Arrow(Left|Right|Up|Down)|Home|End)$/.test(e.key)) {
      // setas navegam entre as caixas da prateleira (grade de --c colunas)
      const i = slots.findIndex((s) => s.el === document.activeElement);
      if (i < 0) return;
      const j = e.key === 'Home' ? 0 : e.key === 'End' ? slots.length - 1
        : i + ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols } as Record<string, number>)[e.key];
      if (slots[j]) { slots[j].el.focus(); e.preventDefault(); }
    }
    else if (current && !closing && mode === 'art' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !(e.target as HTMLElement).closest('input,textarea,select')) {
      stepFace(e.key === 'ArrowLeft' ? -1 : 1); e.preventDefault();
    }
    else if (current && !closing && mode === 'box' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !(e.target as HTMLElement).closest('input,textarea,select')) {
      ry.t += (e.key === 'ArrowLeft' ? -1 : 1) * Math.PI / 4; idleAt = performance.now() + 3500; e.preventDefault();
    }
  };
  addEventListener('keydown', onKey);

  const toggleLid = () => {
    if (!hero || closing || mode !== 'box') return;
    setLidUi(!lidOn); lid.t = lidOn ? 1 : 0;
    if (lidOn) { ry.t = Math.round(ry.x / TAU) * TAU; rx.t = 0.08; }
    fitHero(); idleAt = performance.now() + 2500;
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

  // A alça (ou qualquer ponto da folha) arrasta: para baixo RECOLHE a folha (só a caixa fica em tela) e, já recolhida,
  // para baixo de novo fecha; para cima traz a folha de volta. No painel lateral o arrasto para a direita recolhe.
  // Distância ou "peteleco" rápido; no sentido sem efeito há resistência elástica. O toque vertical no painel lateral continua rolando.
  let sd: { x: number; y: number; d: number; t: number; v: number; axis: '' | 'x' | 'y'; onGrab: boolean } | null = null;
  const shift = (d: number, axis: 'x' | 'y') => axis === 'x' ? `translateX(${d}px)` : peek ? `translateY(calc(100% - var(--peek, 68px) + ${d}px))` : `translateY(${d}px)`;
  sheet.addEventListener('pointerdown', (e) => {
    const btn = (e.target as HTMLElement).closest('button,a');
    if ((btn && btn !== grab) || !current || closing || e.button > 0) return;
    sd = { x: e.clientX, y: e.clientY, d: 0, t: performance.now(), v: 0, axis: '', onGrab: btn === grab };
  });
  sheet.addEventListener('pointermove', (e) => {
    if (!sd) return;
    const rx0 = e.clientX - sd.x, ry0 = e.clientY - sd.y, now = performance.now();
    if (!sd.axis) {
      if (Math.hypot(rx0, ry0) < 6) return;
      sd.axis = docked() === 'side' && Math.abs(rx0) > Math.abs(ry0) ? 'x' : 'y';
      sheet.setPointerCapture(e.pointerId); sheet.classList.add('drag');
    }
    const raw = sd.axis === 'x' ? rx0 : ry0;
    const d = peek || raw >= 0 ? raw : -Math.sqrt(-raw) * 2.2;
    sd.v = (d - sd.d) / Math.max(1, now - sd.t); sd.t = now; sd.d = d;
    sheet.style.transform = shift(d, sd.axis);
  });
  const sheetUp = () => {
    const g = sd; sd = null; sheet.classList.remove('drag');
    if (!g) return;
    sheet.style.transform = '';
    if (!g.axis) { if (peek && !g.onGrab) setPeek(false); return; }   // toque na faixa recolhida: abre (a alça tem o próprio clique)
    justDragged = true; setTimeout(() => { justDragged = false; }, 50);
    const down = g.d > 60 || (g.d > 20 && g.v > 0.6);
    if (peek) { if (g.d < -40 || g.v < -0.5) setPeek(false); else if (down) uiClose(); }
    else if (down) setPeek(true);
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
      if (mode === 'box' || closing) B.render();
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
      cancelAnimationFrame(raf); cancelAnimationFrame(refitRaf); sheetRO.disconnect(); removeEventListener('scroll', onScroll); removeEventListener('keydown', onKey);
      document.body.classList.remove('locked'); A.dispose(); B.dispose();
    },
  };
}
