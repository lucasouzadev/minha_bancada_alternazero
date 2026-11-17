import type * as THREE from 'three';
import { buildTextures, imageSize, normalizeUpload, templateCanvas, demoDieline } from '../art';
import { buildBox, type BuiltBox } from '../box';
import { deleteDrop, getDrop, listDrops, newDrop, saveDrop, slugify } from '../db';
import { dielineRects } from '../layout';
import { createStage } from '../stage';
import { FACES, FACE_LABEL, type Drop, type Face, type Finish } from '../types';
import { go } from '../main';
import { h, icon, toast } from '../ui';
import { REMOTE, sb } from '../remote';
import { makeOg } from '../og';

export const FINISH_LABEL: Record<Finish, string> = { matte: 'Fosco', satin: 'Acetinado', gloss: 'Brilho (verniz)' };

const NO_EDITOR = 'Esta conta entrou, mas ainda não é editora. Inclua o e-mail na tabela admins do Supabase.';
const isEditor = async () => (await sb.rpc('is_admin')).data === true;
export function saveError(e: any): string {
  const m = String(e?.message ?? e ?? '');
  if (e?.code === '42501' || /row-level security|unauthori[sz]ed|403/i.test(m)) return 'Sem permissão de editor para salvar.';
  return m ? `Não foi possível salvar: ${m.slice(0, 90)}` : 'Não foi possível salvar.';
}

async function loginGate(root: HTMLElement): Promise<boolean> {
  if (!REMOTE) return true;
  const back = () => h('a', { class: 'txt', href: '/', 'data-link': true }, 'Voltar ao acervo');
  if ((await sb.auth.getSession()).data.session) {
    if (await isEditor()) return true;
    const out = h('button', { class: 'ghost', type: 'button', onclick: async () => { out.disabled = true; await sb.auth.signOut(); go('/admin'); } }, 'Sair e usar outra conta');
    root.append(h('div', { class: 'gate' }, h('div', { class: 'login' },
      h('p', { class: 'eyebrow' }, 'Editor'), h('h2', {}, 'Sem acesso'),
      h('p', { role: 'alert' }, NO_EDITOR), out, back())));
    return false;
  }
  const msg = h('p', { class: 'err', role: 'alert' });
  const email = h('input', { type: 'email', placeholder: 'e-mail', autocomplete: 'username', name: 'email', required: true, ariaLabel: 'E-mail', inputMode: 'email', autocapitalize: 'off', spellcheck: false });
  const pass = h('input', { type: 'password', placeholder: 'senha', autocomplete: 'current-password', name: 'password', required: true, ariaLabel: 'Senha' });
  const enter = h('button', { class: 'primary', type: 'submit' }, 'Entrar');
  const form = h('form', { class: 'login', noValidate: true, onsubmit: async (e: Event) => {
    e.preventDefault();
    msg.textContent = ''; email.ariaInvalid = pass.ariaInvalid = 'false';
    if (!email.value.trim() || !pass.value) { msg.textContent = 'Preencha e-mail e senha.'; (email.value.trim() ? pass : email).focus(); return; }
    enter.disabled = true; enter.ariaBusy = 'true'; enter.textContent = 'Entrando…';
    const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
    enter.disabled = false; enter.ariaBusy = 'false'; enter.textContent = 'Entrar';
    if (error) { msg.textContent = 'E-mail ou senha incorretos.'; pass.ariaInvalid = 'true'; pass.select(); return; }
    go('/admin');
  } }, h('p', { class: 'eyebrow' }, 'Acervo'), h('h2', {}, 'Editor'), email, pass, msg, enter, back());
  root.append(h('div', { class: 'gate' }, form));
  setTimeout(() => email.focus(), 0);
  return false;
}

/** Casca do editor no tamanho real, mostrada na hora (antes: tela preta enquanto login e dados chegavam). */
function skeleton() {
  const b = (cls: string) => h('span', { class: `sk-b ${cls}` });
  const fieldSk = () => h('span', { class: 'sk-field' }, b('sk-lbl'), b('sk-in'));
  return h('div', { class: 'admin sk', 'aria-busy': 'true' },
    h('aside', { class: 'panel' },
      h('p', { class: 'sr-only', role: 'status' }, 'Carregando o editor…'),
      h('div', { class: 'panel-top' }, b('sk-btn'), b('sk-sel')),
      h('div', { class: 'panel-head' }, b('sk-h')),
      h('section', { class: 'sect' }, b('sk-eyebrow'), fieldSk(), h('div', { class: 'grid2' }, fieldSk(), fieldSk()), h('div', { class: 'grid2' }, fieldSk(), fieldSk())),
      h('section', { class: 'sect' }, b('sk-eyebrow'), h('div', { class: 'grid3' }, fieldSk(), fieldSk(), fieldSk()))),
    h('div', { class: 'preview' }, h('div', { class: 'stage' })));
}

export async function adminPage(root: HTMLElement, id?: string) {
  const sk = skeleton();
  root.append(sk);
  if (!(await loginGate(root))) { sk.remove(); return; }
  const all = await listDrops();
  const drop: Drop = (id && (await getDrop(id))) || newDrop();
  if (!sk.isConnected) return; // trocou de rota enquanto carregava: não monta uma tela órfã (WebGL incluso)
  let isNew = !all.some((d) => d.id === drop.id);
  /** Recolocam nos campos o valor do drop (ver "pageshow" abaixo). */
  const binders: (() => void)[] = [];
  let slugTouched = !!drop.slug;

  const previewHost = h('div', { class: 'stage' });
  const warnText = h('span');
  const warn = h('div', { class: 'notice', role: 'status' });
  const stage = createStage(previewHost, { autoRotate: true });
  let box: BuiltBox | null = null, texs: Partial<Record<Face, THREE.Texture>> = {};
  let open = 0, target = 0, timer = 0, gen = 0;
  stage.onTick((dt) => { open += (target - open) * Math.min(1, dt * 5); box?.setOpen(open); });

  async function refresh() {
    const my = ++gen;
    const t = await buildTextures(drop, stage.renderer.capabilities.getMaxAnisotropy());
    if (my !== gen) { Object.values(t).forEach((x) => x!.dispose()); return; }
    box?.dispose(); Object.values(texs).forEach((x) => x!.dispose());
    texs = t; box = buildBox({ ...drop, textures: t });
    stage.setObject(box.group, box.size, box.frameSize); previewHost.dataset.ready = '1';
    box.setOpen(open);
    checkAspect();
  }
  const schedule = () => { clearTimeout(timer); timer = window.setTimeout(refresh, 150); };

  async function checkAspect() {
    warn.replaceChildren();
    if (drop.artMode !== 'dieline' || !drop.art.dieline) return;
    const { w, h: ih } = await imageSize(drop.art.dieline);
    const { totalW, totalH } = dielineRects(drop.w, drop.h, drop.d);
    const diff = Math.abs(w / ih - totalW / totalH) / (totalW / totalH);
    if (diff > 0.03) {
      warnText.textContent = `A proporção da arte (${w} × ${ih} px) não bate com a faca (${totalW} × ${totalH} mm) e vai ser esticada. Baixe o gabarito para conferir.`;
      warn.replaceChildren(icon('alert', 18), warnText);
    }
  }

  // ---------- campos ----------
  const nameErr = h('p', { class: 'field-err', id: 'err-name', hidden: true });
  const text = (label: string, key: 'name' | 'subtitle' | 'artist', ph = '') => {
    const i = h('input', { name: `drop-${key}`, value: drop[key], placeholder: ph, autocomplete: 'off', oninput: () => {
      drop[key] = i.value;
      if (key === 'name') {
        if (!slugTouched) { drop.slug = slugify(i.value); slug.value = drop.slug; }
        if (i.value.trim()) { nameErr.hidden = true; i.ariaInvalid = 'false'; }
      }
    } });
    if (key === 'name') { i.setAttribute('aria-describedby', 'err-name'); nameIn = i; }
    binders.push(() => { i.value = drop[key]; });
    return field(label, i);
  };
  let nameIn!: HTMLInputElement;
  const slug = h('input', { name: 'slug', value: drop.slug, placeholder: 'mutacoes', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, oninput: () => { slugTouched = true; drop.slug = slugify(slug.value); } });
  binders.push(() => { slug.value = drop.slug; });
  /** Medida em mm: rótulo curto (não quebra em 2 linhas no celular) e a unidade dentro do campo. */
  const num = (label: string, key: 'w' | 'h' | 'd') => {
    const i = h('input', { name: key, type: 'number', inputMode: 'numeric', min: 10, max: 1000, step: 1, value: String(drop[key]), ariaLabel: `${label} (mm)`,
      oninput: () => { drop[key] = Math.max(10, +i.value || 10); schedule(); } });
    binders.push(() => { i.value = String(drop[key]); });
    return h('label', { class: 'field' }, h('span', {}, label), h('span', { class: 'unit', 'data-unit': 'mm' }, i));
  };
  const color = (label: string, key: 'inner' | 'tissue') => {
    const code = h('code', { 'aria-hidden': 'true' }, drop[key]);
    const i = h('input', { name: key, type: 'color', value: drop[key], oninput: () => { drop[key] = i.value; code.textContent = i.value; schedule(); } });
    binders.push(() => { i.value = drop[key]; code.textContent = drop[key]; });
    return h('label', { class: 'field' }, h('span', {}, label), h('div', { class: 'swatch' }, i, code));
  };
  const select = <T extends string>(label: string, key: 'finish' | 'openMode' | 'artMode', opts: [T, string][], after?: () => void) => {
    const s = h('select', { name: key, onchange: () => { (drop as any)[key] = s.value; after?.(); schedule(); } },
      ...opts.map(([v, l]) => h('option', { value: v, selected: (drop as any)[key] === v }, l)));
    binders.push(() => { s.value = (drop as any)[key]; });
    return field(label, s);
  };
  const itemsTa = h('textarea', { name: 'items', rows: 3, placeholder: 'Uma por linha', value: drop.items.join('\n'), oninput: () => { drop.items = itemsTa.value.split('\n').map((s) => s.trim()).filter(Boolean); } });
  const tagsIn = h('input', { name: 'tags', value: drop.tags.join(', '), placeholder: 'horror, anime, ocultismo', autocomplete: 'off', oninput: () => { drop.tags = tagsIn.value.split(',').map((s) => s.trim()).filter(Boolean); } });
  const dateIn = h('input', { name: 'date', type: 'date', value: drop.date, oninput: () => { drop.date = dateIn.value; } });
  binders.push(() => { itemsTa.value = drop.items.join('\n'); tagsIn.value = drop.tags.join(', '); dateIn.value = drop.date; });

  // ---------- arte ----------
  const artBox = h('div', { class: 'artbox' });
  const urls: string[] = [];
  const thumbUrl = (b: Blob) => { const u = URL.createObjectURL(b); urls.push(u); return u; };
  /** Seletor de imagem em português: área clicável/arrastável, com miniatura e nome do arquivo. */
  const filePicker = (label: string, key: 'dieline' | Face) => {
    const thumb = h('span', { class: 'thumb' }, icon('image', 22));
    const title = h('b');
    const sub = h('small');
    const show = (name?: string) => {
      const b = drop.art[key];
      thumb.classList.toggle('has', !!b);
      thumb.style.backgroundImage = b ? `url(${thumbUrl(b)})` : '';
      title.textContent = b ? (name ?? 'Imagem enviada') : 'Escolher imagem';
      sub.textContent = b ? 'Toque para trocar' : 'ou arraste o arquivo aqui';
      if (matchMedia('(hover: hover) and (pointer: fine)').matches && b) sub.textContent = 'Clique ou arraste para trocar';
    };
    const take = async (f?: File | null) => {
      if (!f) return;
      if (!f.type.startsWith('image/')) { toast('Envie um arquivo de imagem (PNG, JPG ou WEBP).', 'error'); return; }
      title.textContent = 'Carregando…';
      try { drop.art[key] = await normalizeUpload(f); } catch { toast('Não foi possível ler essa imagem.', 'error'); show(); return; }
      show(f.name); refresh();
    };
    const inp = h('input', { type: 'file', name: `art-${key}`, accept: 'image/*', onchange: () => take(inp.files?.[0]) });
    const zone = h('label', { class: 'drop' }, inp, thumb, h('span', { class: 'dt' }, h('span', { class: 'lbl' }, label), title, sub));
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); take(e.dataTransfer?.files[0]); });
    show();
    return zone;
  };
  function renderArt() {
    artBox.replaceChildren();
    if (drop.artMode === 'dieline') {
      const r = dielineRects(drop.w, drop.h, drop.d);
      artBox.append(
        filePicker('Arte planificada (faca em cruz)', 'dieline'),
        h('p', { class: 'hint' }, `Proporção da arte: ${r.totalW} × ${r.totalH} mm, em qualquer resolução.`),
        h('div', { class: 'row2' },
          h('button', { class: 'ghost sm', type: 'button', onclick: () => saveImage(templateCanvas(drop.w, drop.h, drop.d), `gabarito-${drop.slug || 'caixa'}-${drop.w}x${drop.h}x${drop.d}.png`) }, icon('download', 18), 'Baixar gabarito'),
          h('button', { class: 'ghost sm', type: 'button', onclick: async (e: Event) => {
            const b = e.currentTarget as HTMLButtonElement; b.disabled = true;
            drop.art.dieline = await demoDieline(drop.w, drop.h, drop.d, drop.name || 'Drop', true, Date.now() % 1000);
            renderArt(); refresh();
          } }, 'Usar arte de exemplo')));
    } else {
      FACES.forEach((f) => artBox.append(filePicker(FACE_LABEL[f], f)));
    }
  }
  renderArt();
  const dimIn = [num('Largura', 'w'), num('Altura', 'h'), num('Profundidade', 'd')];
  let artT = 0;
  dimIn.forEach((f) => f.addEventListener('input', () => { clearTimeout(artT); artT = window.setTimeout(renderArt, 120); }));

  const stateChip = h('span', { class: 'state' });
  const renderState = () => { stateChip.textContent = drop.published ? 'Publicado' : 'Rascunho'; stateChip.classList.toggle('live', drop.published); };
  const pubIn = h('input', { type: 'checkbox', name: 'published', checked: drop.published, onchange: () => { drop.published = pubIn.checked; renderState(); } });
  binders.push(() => { pubIn.checked = drop.published; renderState(); });
  renderState();

  // Novo × edição: o mesmo DOM serve aos dois (salvar um drop novo não recria a tela)
  const heading = h('h2', {});
  const picker = h('select', { ariaLabel: 'Escolher drop', onchange: () => go(picker.value ? `/admin/${picker.value}` : '/admin') },
    h('option', { value: '' }, 'Novo drop'),
    ...all.map((d) => h('option', { value: d.id, selected: d.id === drop.id }, d.name)));
  const viewLink = h('a', { class: 'ghost', href: '/', 'data-link': true }, 'Ver página');
  const delBtn = h('button', { class: 'danger', type: 'button', onclick: async () => {
    if (!confirm(`Excluir "${drop.name}"? Isso não pode ser desfeito.`)) return;
    await deleteDrop(drop.id); toast('Drop excluído'); go('/admin');
  } }, icon('trash', 18), 'Excluir');
  const renderMode = () => {
    heading.textContent = isNew ? 'Novo drop' : 'Editar drop';
    viewLink.hidden = delBtn.hidden = isNew;
    viewLink.href = `/c/${encodeURIComponent(drop.slug)}?preview`;
    if (!isNew) {
      let opt = [...picker.options].find((o) => o.value === drop.id);
      if (!opt) { opt = h('option', { value: drop.id }, drop.name); picker.options[0].after(opt); }
      opt.textContent = drop.name; picker.value = drop.id;
    }
  };
  renderMode();

  const saveBtn = h('button', { class: 'primary', type: 'button' }, 'Salvar');
  let saving = false;
  const save = async () => {
    if (saving) return;
    if (!drop.name.trim()) {
      nameErr.textContent = 'Dê um nome ao drop.'; nameErr.hidden = false; nameIn.ariaInvalid = 'true';
      nameIn.focus(); nameIn.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    saving = true; saveBtn.disabled = true; saveBtn.ariaBusy = 'true'; saveBtn.textContent = 'Salvando…';
    const done = () => { saving = false; saveBtn.disabled = false; saveBtn.ariaBusy = 'false'; saveBtn.textContent = 'Salvar'; };
    try {
      await saveDrop(drop, REMOTE ? await makeOg(drop) : undefined);
    } catch (e) { console.error(e); done(); toast(saveError(e), 'error'); return; }
    done(); slug.value = drop.slug; toast('Salvo', 'ok');
    if (isNew) { isNew = false; history.replaceState({}, '', `/admin/${drop.id}`); }
    renderMode();
  };
  saveBtn.onclick = save;
  const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } };
  addEventListener('keydown', onKey);

  const lidBtn = h('button', { class: 'ghost', type: 'button', ariaPressed: 'false', onclick: () => {
    target = target ? 0 : 1; lidBtn.textContent = target ? 'Fechar tampa' : 'Abrir tampa'; lidBtn.ariaPressed = String(!!target);
  } }, 'Abrir tampa');

  // celular: prévia compacta por padrão; o botão amplia/reduz (o CSS esconde o botão quando há espaço)
  const grow = h('button', { class: 'ghost grow', type: 'button', ariaLabel: 'Ampliar prévia', ariaExpanded: 'false', onclick: () => {
    const big = adminEl.classList.toggle('big');
    grow.ariaExpanded = String(big); grow.ariaLabel = big ? 'Reduzir prévia' : 'Ampliar prévia';
    grow.replaceChildren(icon(big ? 'shrink' : 'expand', 20));
  } }, icon('expand', 20));

  const sect = (title: string, ...kids: (HTMLElement | null | false)[]) => h('section', { class: 'sect' }, h('h3', { class: 'eyebrow' }, title), ...kids);

  const adminEl = h('div', { class: 'admin' },
    h('aside', { class: 'panel' },
      h('div', { class: 'panel-top' },
        h('a', { class: 'ghost sm', href: '/', 'data-link': true }, icon('back', 18), 'Acervo'),
        picker),
      h('div', { class: 'panel-head' }, heading, stateChip),
      sect('Identidade',
        text('Nome', 'name', 'Mutações'), nameErr,
        h('div', { class: 'grid2' }, text('Subtítulo', 'subtitle', 'Drop 07'), text('Artista', 'artist')),
        h('div', { class: 'grid2' }, field('Lançamento', dateIn), field('Link (slug)', slug))),
      sect('Caixa',
        h('div', { class: 'grid3' }, ...dimIn),
        h('div', { class: 'grid2' },
          select('Acabamento', 'finish', Object.entries(FINISH_LABEL) as [Finish, string][]),
          select('Abertura', 'openMode', [['top', 'Tampa (topo)'], ['book', 'Livro (capa)']])),
        h('div', { class: 'grid2' }, color('Cor interna', 'inner'), color('Papel de seda', 'tissue'))),
      sect('Arte',
        select('Formato da arte', 'artMode', [['dieline', 'Faca única (recomendado)'], ['faces', 'Uma imagem por face']], renderArt),
        artBox, warn),
      sect('Ficha',
        field('Dentro da caixa', itemsTa), field('Tags', tagsIn),
        h('label', { class: 'switch' }, pubIn, h('span', {}, h('b', {}, 'Publicado'), h('small', {}, 'Aparece no acervo e no link')))),
      h('div', { class: 'actions' }, saveBtn, viewLink, delBtn)),
    h('div', { class: 'preview', 'data-testid': 'preview' }, previewHost, h('div', { class: 'stage-bar' }, lidBtn, grow)));
  sk.replaceWith(adminEl);

  // Teclado aberto (toque): a prévia e a barra de ações deixam de ser fixas e rolam junto com o formulário.
  // Antes, no iPhone, a barra "Salvar" ficava presa atrás da barra do teclado e a prévia tomava o topo,
  // sobrando pouquíssimo espaço para o campo. Sem mudança de layout: só deixam de "grudar".
  const coarse = matchMedia('(pointer: coarse)');
  const NO_KB = new Set(['checkbox', 'radio', 'color', 'file', 'date', 'range', 'button', 'submit']);
  const typesText = (el: Element | null) => el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !NO_KB.has(el.type));
  let typT = 0;
  adminEl.addEventListener('focusin', (e) => {
    if (!coarse.matches || !typesText(e.target as Element)) return;
    clearTimeout(typT); adminEl.classList.add('typing');
  });
  // pequena espera: ao pular de um campo para o próximo (setas do teclado do iOS) nada pisca
  adminEl.addEventListener('focusout', () => {
    clearTimeout(typT);
    typT = window.setTimeout(() => { if (!typesText(document.activeElement)) adminEl.classList.remove('typing'); }, 150);
  });

  // Voltando à página pelo cache do navegador (ex.: depois de "Ver" o gabarito no iPhone), o Safari apaga
  // os campos com autocomplete=off, mas o drop em memória continua com os valores: recoloca-os nos campos.
  const onShow = (e: PageTransitionEvent) => { if (e.persisted) binders.forEach((f) => f()); };
  addEventListener('pageshow', onShow);

  refresh();
  return () => {
    clearTimeout(timer); clearTimeout(artT); clearTimeout(typT); removeEventListener('keydown', onKey); removeEventListener('pageshow', onShow);
    urls.forEach((u) => URL.revokeObjectURL(u));
    stage.dispose(); box?.dispose(); Object.values(texs).forEach((t) => t!.dispose());
  };
}

const field = (label: string, el: HTMLElement) => h('label', { class: 'field' }, h('span', {}, label), el);
/**
 * Celular/tablet: folha de compartilhar do sistema (Salvar imagem / Arquivos), sem sair do editor.
 * No iPhone o download comum abria a imagem no lugar da página. Gerado de forma síncrona para manter o
 * "gesto do usuário" que o navigator.share exige. Computador: download normal.
 */
function saveImage(canvas: HTMLCanvasElement, name: string) {
  const bin = atob(canvas.toDataURL('image/png').split(',')[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const file = new File([bytes], name, { type: 'image/png' });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file], title: name }).catch((e) => { if (e?.name !== 'AbortError') download(file, name); });
    return;
  }
  download(file, name);
}
function download(b: Blob, name: string) {
  const a = h('a', { href: URL.createObjectURL(b), download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
