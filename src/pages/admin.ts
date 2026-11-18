import type * as THREE from 'three';
import { buildTextures, imageSize, normalizeUpload, templateCanvas, demoDieline } from '../art';
import { buildBox, type BuiltBox } from '../box';
import { clearDraft, deleteDrop, draftCopy, getDrop, listDropMeta, loadDraft, newDrop, saveDraft, saveDrop, slugify } from '../db';
import { action, confirmSheet, sheet } from '../sheet';
import { dielineRects } from '../layout';
import { createStage } from '../stage';
import { FACES, FACE_LABEL, STATUS_LABEL, safeUrl, type Drop, type Face, type Finish, type Status } from '../types';
import { go } from '../main';
import { announce, fmtDate, h, icon, share, toast } from '../ui';
import { REMOTE, sb } from '../remote';
import { makeOg } from '../og';

export const FINISH_LABEL: Record<Finish, string> = { matte: 'Fosco', satin: 'Acetinado', gloss: 'Brilho' };
const STEPS = ['Identidade', 'Caixa', 'Arte', 'Ficha'] as const;
/** Temas da Alternazero (a partir dos nomes dos drops) para sugerir como tag, além das já usadas. */
const THEME_TAGS = ['halloween', 'alquimia', 'julgamento', 'insetos', 'mecha', 'investigação', 'horror', 'anime', 'ocultismo', 'cyber', 'gótico', 'corpo'];
/** Itens que a Alternazero põe na caixa além da roupa (acessórios e embalagem), como atalhos de um toque. */
const ITEM_SUGGEST = ['Cartela de adesivos', 'Pin Rubedo', 'Caderno Grande Obra', 'Boné Aniquilação', 'Gorro O Fruto', 'Ziplock da marca', 'Cartão numerado'];
/** Medidas prontas (mm): largura × altura × profundidade. */
const PRESETS: [string, [number, number, number]][] = [['Padrão', [200, 300, 60]], ['Compacta', [150, 200, 50]], ['Larga', [250, 350, 80]], ['Quadrada', [200, 200, 80]]];

const NO_EDITOR = 'Esta conta entrou, mas ainda não é editora. Inclua o e-mail na tabela admins do Supabase.';
const isEditor = async () => (await sb.rpc('is_admin')).data === true;
export function saveError(e: any): string {
  const m = String(e?.message ?? e ?? '');
  if (e?.code === '42501' || /row-level security|unauthori[sz]ed|403/i.test(m)) return 'Sem permissão de editor para salvar.';
  return m ? `Não foi possível salvar: ${m.slice(0, 90)}` : 'Não foi possível salvar.';
}

export async function loginGate(root: HTMLElement): Promise<boolean> {
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

/** Casca do editor no tamanho real, mostrada na hora (nada pula quando os dados chegam). */
function skeleton() {
  const b = (cls: string) => h('span', { class: `sk-b ${cls}` });
  return h('div', { class: 'ed sk', 'aria-busy': 'true' },
    h('div', { class: 'ed-top' }, b('sk-ico'), h('div', { class: 'ed-title' }, b('sk-h'), b('sk-lbl')), b('sk-ico')),
    h('div', { class: 'ed-steps' }, h('p', { class: 'sr-only', role: 'status' }, 'Carregando o editor…'), h('div', { class: 'sk-steps' }, b('sk-bar'), b('sk-bar'), b('sk-bar'), b('sk-bar'))),
    h('div', { class: 'ed-stage sk-stage' }),
    h('div', { class: 'ed-scroll' }, h('div', { class: 'step' }, b('sk-lbl'), b('sk-in'), b('sk-lbl'), b('sk-in'))),
    h('div', { class: 'ed-foot' }, b('sk-cta')));
}

export async function adminPage(root: HTMLElement, id?: string) {
  const sk = skeleton();
  root.append(sk);
  if (!(await loginGate(root))) { sk.remove(); return; }
  const [all, existing] = await Promise.all([listDropMeta(), id ? getDrop(id) : undefined]);
  if (!sk.isConnected) return; // trocou de rota enquanto carregava: não monta uma tela órfã (WebGL incluso)
  const drop: Drop = existing || newDrop();
  let isNew = !existing;
  let key = isNew ? 'new' : drop.id;           // chave do rascunho no aparelho
  let dirty = false, recovered = false, copied = false;

  // rascunho não salvo (a página recarregou, o app fechou, "Duplicar"…)
  const draft = await loadDraft(key);
  if (!sk.isConnected) return;
  if (draft && (isNew || draft.savedAt > drop.updatedAt)) {
    const { savedAt: _s, dup, ...rest } = draft; void _s;
    Object.assign(drop, rest, isNew ? {} : { id: drop.id });
    recovered = dirty = true; copied = !!dup;
  }
  drop.tagline ??= ''; drop.concept ??= ''; drop.storeUrl ??= ''; drop.status ??= 'available';
  if (!drop.slug && drop.name) drop.slug = slugify(drop.name);
  // slug acompanha o nome só em drop novo cujo link ainda é o automático (renomear um drop publicado não muda o link)
  let slugTouched = !isNew || (!!drop.slug && drop.slug !== slugify(drop.name));
  /** Recolocam nos campos o valor do drop (voltando do cache, trocando de preset, etc.). */
  const binders: (() => void)[] = [];
  const syncAll = () => binders.forEach((f) => f());

  // ---------- prévia 3D ----------
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
      warnText.textContent = `A proporção da arte (${w} × ${ih} px) difere da faca (${totalW} × ${totalH} mm): ela será esticada. Baixe o gabarito para conferir.`;
      warn.replaceChildren(icon('alert', 18), warnText);
    }
  }

  // ---------- rascunho automático ----------
  let draftT = 0;
  const persist = () => { dirty = true; clearTimeout(draftT); draftT = window.setTimeout(() => { if (dirty) saveDraft(key, drop); }, 350); };
  // sair da página (recarregar, trocar de app, fechar) grava na hora o que ainda estava esperando o intervalo
  const flush = () => { if (dirty) { clearTimeout(draftT); saveDraft(key, drop); } };
  const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
  addEventListener('pagehide', flush); document.addEventListener('visibilitychange', onHide);

  // ---------- campos ----------
  const field = (label: string, el: HTMLElement, hint?: string) =>
    h('label', { class: 'field' }, h('span', {}, label), el, hint ? h('small', { class: 'hint' }, hint) : null);
  const titleSub = h('small', {});
  const renderTitle = () => { titleSub.textContent = drop.name.trim() || 'Sem nome'; };
  const nameErr = h('p', { class: 'field-err', id: 'err-name', hidden: true });
  const linkHint = h('small', { class: 'hint' });
  const renderLink = () => { linkHint.textContent = `Link: /c/${drop.slug || slugify(drop.name) || 'nome-do-drop'}`; };
  const nameIn = h('input', { name: 'drop-name', value: drop.name, placeholder: 'Mutações', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'words', enterkeyhint: 'next', 'aria-describedby': 'err-name',
    oninput: () => {
      drop.name = nameIn.value;
      if (!slugTouched) { drop.slug = slugify(nameIn.value); slugIn.value = drop.slug; }
      if (nameIn.value.trim()) { nameErr.hidden = true; nameIn.ariaInvalid = 'false'; }
      renderTitle(); renderLink();
    } });
  binders.push(() => { nameIn.value = drop.name; renderTitle(); renderLink(); });
  const text = (label: string, key: 'subtitle' | 'artist', ph = '') => {
    const i = h('input', { name: `drop-${key}`, value: drop[key], placeholder: ph, autocomplete: 'off', autocorrect: 'off', autocapitalize: 'words', enterkeyhint: 'next', oninput: () => { drop[key] = i.value; } });
    binders.push(() => { i.value = drop[key]; });
    return field(label, i);
  };
  const slugIn = h('input', { name: 'slug', value: drop.slug, placeholder: 'mutacoes', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: false, enterkeyhint: 'done',
    oninput: () => { slugTouched = true; drop.slug = slugify(slugIn.value); renderLink(); } });
  binders.push(() => { slugIn.value = drop.slug; });
  const dateIn = h('input', { name: 'date', type: 'date', value: drop.date, oninput: () => { drop.date = dateIn.value; } });
  binders.push(() => { dateIn.value = drop.date; });

  const num = (label: string, key: 'w' | 'h' | 'd') => {
    const i = h('input', { name: key, type: 'number', inputMode: 'numeric', min: 10, max: 1000, step: 1, value: String(drop[key]), ariaLabel: `${label} (mm)`, enterkeyhint: 'next',
      oninput: () => { drop[key] = Math.max(10, +i.value || 10); renderPresets(); schedule(); artRefresh(); } });
    binders.push(() => { i.value = String(drop[key]); });
    return h('label', { class: 'field' }, h('span', {}, label), h('span', { class: 'unit', 'data-unit': 'mm' }, i));
  };
  const dims = h('div', { class: 'grid3' }, num('Largura', 'w'), num('Altura', 'h'), num('Profundidade', 'd'));
  const chips = PRESETS.map(([name, [w, hh, d]]) => h('button', { class: 'chip', type: 'button', 'data-dims': `${w}x${hh}x${d}`, onclick: () => {
    drop.w = w; drop.h = hh; drop.d = d; syncAll(); renderPresets(); schedule(); artRefresh(); persist();
  } }, `${name} `, h('small', {}, `${w}×${hh}×${d}`)));
  const renderPresets = () => chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.dims === `${drop.w}x${drop.h}x${drop.d}`)));

  /** Escolha entre poucas opções, de um toque (no lugar do select): grupo de rádio acessível. */
  const seg = <T extends string>(label: string, key: 'finish' | 'openMode' | 'artMode' | 'status', opts: [T, string][], after?: () => void) => {
    const btns = opts.map(([v, l]) => h('button', { type: 'button', role: 'radio', 'data-v': v, onclick: () => { (drop as any)[key] = v; paint(); after?.(); schedule(); persist(); } }, l));
    const paint = () => btns.forEach((b) => b.setAttribute('aria-checked', String((drop as any)[key] === b.dataset.v)));
    binders.push(paint); paint();
    return h('div', { class: 'field' }, h('span', { id: `lbl-${key}` }, label), h('div', { class: 'seg', role: 'radiogroup', 'aria-labelledby': `lbl-${key}` }, ...btns));
  };
  const color = (label: string, key: 'inner' | 'tissue') => {
    const code = h('code', { 'aria-hidden': 'true' }, drop[key]);
    const i = h('input', { name: key, type: 'color', value: drop[key], oninput: () => { drop[key] = i.value; code.textContent = i.value; schedule(); } });
    binders.push(() => { i.value = drop[key]; code.textContent = drop[key]; });
    return h('label', { class: 'field' }, h('span', {}, label), h('div', { class: 'swatch' }, i, code));
  };
  const itemsTa = h('textarea', { name: 'items', rows: 3, placeholder: 'Uma por linha', value: drop.items.join('\n'), autocorrect: 'off', oninput: () => { drop.items = itemsTa.value.split('\n').map((s) => s.trim()).filter(Boolean); } });
  const tagsIn = h('input', { name: 'tags', value: drop.tags.join(', '), placeholder: 'horror, anime, ocultismo', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'none', enterkeyhint: 'done', oninput: () => { drop.tags = tagsIn.value.split(',').map((s) => s.trim()).filter(Boolean); } });
  binders.push(() => { itemsTa.value = drop.items.join('\n'); tagsIn.value = drop.tags.join(', '); renderSuggest(); renderItemSuggest(); });

  // sugestões de tags: as já usadas nos outros drops (mais comuns primeiro) e os temas da marca; um toque adiciona
  const used = new Map<string, number>();
  for (const d of all) for (const t of d.tags ?? []) used.set(t, (used.get(t) ?? 0) + 1);
  const pool = [...new Set([...[...used.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t), ...THEME_TAGS])];
  const suggest = h('div', { class: 'chips', role: 'group', ariaLabel: 'Sugestões' });
  function renderSuggest() {
    const have = new Set(drop.tags.map((t) => t.toLowerCase()));
    // enquanto digita, filtra pelo termo; fora do campo (tags completas) mostra as sugestões gerais
    const q = document.activeElement === tagsIn ? tagsIn.value.split(',').pop()!.trim().toLowerCase() : '';
    const list = pool.filter((t) => !have.has(t.toLowerCase()) && (!q || t.toLowerCase().includes(q))).slice(0, 10);
    suggest.replaceChildren(...list.map((t) => h('button', { class: 'chip', type: 'button', onclick: () => {
      drop.tags = [...drop.tags.filter((x) => x.toLowerCase() !== q), t]; tagsIn.value = drop.tags.join(', ');
      renderSuggest(); persist();
    } }, `+ ${t}`)));
    suggest.hidden = !list.length;
  }
  tagsIn.addEventListener('input', renderSuggest); tagsIn.addEventListener('blur', () => setTimeout(renderSuggest, 150));
  // itens da caixa: os da marca primeiro, depois os já usados nos outros drops; um toque acrescenta uma linha
  const itemPool = [...new Set([...ITEM_SUGGEST, ...all.flatMap((d) => d.items ?? [])])];
  const itemSuggest = h('div', { class: 'chips', role: 'group', ariaLabel: 'Itens comuns' });
  function renderItemSuggest() {
    const have = new Set(drop.items.map((x) => x.toLowerCase()));
    const list = itemPool.filter((t) => !have.has(t.toLowerCase())).slice(0, 8);
    itemSuggest.replaceChildren(...list.map((t) => h('button', { class: 'chip', type: 'button', onclick: () => {
      drop.items = [...drop.items, t]; itemsTa.value = drop.items.join('\n'); renderItemSuggest(); fitTa(itemsTa); persist();
    } }, `+ ${t}`)));
    itemSuggest.hidden = !list.length;
  }
  const fitTa = (ta: HTMLTextAreaElement) => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; };
  itemsTa.addEventListener('input', () => { renderItemSuggest(); fitTa(itemsTa); });
  const taglineIn = h('input', { name: 'tagline', value: drop.tagline, placeholder: 'Você pode correr, mas não pode se esconder.', autocomplete: 'off', enterkeyhint: 'next', oninput: () => { drop.tagline = taglineIn.value; } });
  const conceptTa = h('textarea', { name: 'concept', rows: 4, value: drop.concept, placeholder: 'A história do drop, em poucas linhas.', oninput: () => { drop.concept = conceptTa.value; } });
  const storeErr = h('p', { class: 'field-err', id: 'err-store', hidden: true });
  const storeIn = h('input', { name: 'storeUrl', type: 'url', inputMode: 'url', value: drop.storeUrl, placeholder: 'https://www.alternazero.com/lancamentos/…', autocomplete: 'off', autocapitalize: 'none', spellcheck: false, enterkeyhint: 'done', 'aria-describedby': 'err-store',
    oninput: () => { drop.storeUrl = storeIn.value.trim(); storeErr.hidden = true; storeIn.ariaInvalid = 'false'; } });
  binders.push(() => { taglineIn.value = drop.tagline ?? ''; conceptTa.value = drop.concept ?? ''; storeIn.value = drop.storeUrl ?? ''; });

  // ---------- arte ----------
  const artBox = h('div', { class: 'artbox' });
  const urls: string[] = [];
  const thumbUrl = (b: Blob) => { const u = URL.createObjectURL(b); urls.push(u); return u; };
  /** Seletor de imagem: área clicável/arrastável, com miniatura e nome do arquivo. */
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
      show(f.name); refresh(); persist();
    };
    const inp = h('input', { type: 'file', name: `art-${key}`, accept: 'image/png,image/jpeg,image/webp,image/gif,image/avif,image/heic,image/heif', ariaLabel: label, onchange: () => take(inp.files?.[0]) });
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
            renderArt(); refresh(); persist();
          } }, 'Usar arte de exemplo')));
    } else {
      artBox.append(h('div', { class: 'face-grid' }, ...FACES.map((f) => filePicker(FACE_LABEL[f], f))));
    }
  }
  let artT = 0;
  const artRefresh = () => { clearTimeout(artT); artT = window.setTimeout(renderArt, 120); };
  renderArt();

  const pubIn = h('input', { type: 'checkbox', name: 'published', checked: drop.published, onchange: () => { drop.published = pubIn.checked; } });
  binders.push(() => { pubIn.checked = drop.published; });
  renderTitle(); renderLink(); renderPresets(); renderSuggest(); renderItemSuggest();

  // ---------- passos ----------
  const hasArt = () => (drop.artMode === 'dieline' ? !!drop.art.dieline : FACES.some((f) => drop.art[f]));
  const noArt = h('div', { class: 'notice', role: 'status' }, icon('alert', 18), h('span', {}, 'Ainda sem arte: a caixa aparece cinza no acervo.'));
  const more = (...kids: HTMLElement[]) => h('details', { class: 'more' }, h('summary', {}, 'Mais opções'), h('div', { class: 'more-body' }, ...kids));
  const sections = [
    h('section', { class: 'step', 'data-step': '0', 'aria-labelledby': 'st-0' },
      h('h3', { id: 'st-0', tabIndex: -1 }, 'Como se chama?'),
      h('div', { class: 'field' }, field('Nome', nameIn, undefined), nameErr, linkHint),
      text('Subtítulo', 'subtitle', 'Drop 07'),
      field('Lançamento', dateIn),
      more(text('Artista', 'artist'), field('Link (slug)', slugIn, 'Gerado do nome; mude só se precisar.'))),
    h('section', { class: 'step', 'data-step': '1', 'aria-labelledby': 'st-1' },
      h('h3', { id: 'st-1', tabIndex: -1 }, 'Tamanho e abertura'),
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Medidas prontas' }, ...chips),
      dims,
      seg('Abertura', 'openMode', [['top', 'Tampa'], ['book', 'Livro']]),
      more(seg('Acabamento', 'finish', [['matte', 'Fosco'], ['satin', 'Acetinado'], ['gloss', 'Brilho']]),
           h('div', { class: 'grid2' }, color('Cor interna', 'inner'), color('Papel de seda', 'tissue')))),
    h('section', { class: 'step', 'data-step': '2', 'aria-labelledby': 'st-2' },
      h('h3', { id: 'st-2', tabIndex: -1 }, 'Arte da caixa'),
      seg('Formato da arte', 'artMode', [['dieline', 'Faca única'], ['faces', 'Uma por face']], renderArt),
      artBox, warn),
    h('section', { class: 'step', 'data-step': '3', 'aria-labelledby': 'st-3' },
      h('h3', { id: 'st-3', tabIndex: -1 }, 'A ficha'),
      noArt,
      field('Frase de destaque', taglineIn),
      field('Conceito', conceptTa),
      h('div', { class: 'field' }, field('Dentro da caixa', itemsTa), itemSuggest),
      h('div', { class: 'field' }, field('Tags', tagsIn), suggest),
      seg('Status', 'status', Object.entries(STATUS_LABEL) as [Status, string][]),
      h('div', { class: 'field' }, field('Link da loja', storeIn), storeErr),
      h('label', { class: 'switch' }, pubIn, h('span', {}, h('b', {}, 'Publicado'), h('small', {}, 'Aparece no acervo e no link')))),
  ];
  // ---------- depois de salvar: "Pronto" (o que acabou de subir) ----------
  const doneEl = h('section', { class: 'step done-step', hidden: true, 'aria-labelledby': 'st-done' });
  let isDone = false;
  function showDone() {
    isDone = true; ed.classList.add('is-done');
    sections.forEach((x) => { x.hidden = true; }); doneEl.hidden = false;
    stepBtns.forEach((b) => { b.classList.add('done'); b.classList.remove('cur'); b.removeAttribute('aria-current'); });
    ed.dataset.stage = '1';
    const url = `${location.origin}/c/${drop.slug}`;
    const metaBits = [drop.subtitle, drop.date && fmtDate(drop.date), `${drop.w} × ${drop.h} × ${drop.d} mm`, drop.status && STATUS_LABEL[drop.status]].filter(Boolean) as string[];
    doneEl.replaceChildren(
      h('p', { class: `done-state ${drop.published ? 'live' : ''}` }, drop.published ? 'No ar no acervo' : 'Salvo como rascunho'),
      h('h3', { id: 'st-done', tabIndex: -1 }, drop.name),
      h('p', { class: 'meta' }, ...metaBits.map((t) => h('span', {}, t))),
      ...(drop.tagline ? [h('p', { class: 'tagline' }, `“${drop.tagline}”`)] : []),
      h('div', { class: 'done-link' },
        h('span', { class: 'sel' }, `/c/${drop.slug}`),
        h('button', { class: 'ghost sm', type: 'button', onclick: () => { void share(drop.name, `Veja a caixa ${drop.name} em 3D`, url); } }, icon('share', 18), 'Compartilhar')),
      ...(drop.published ? [] : [h('p', { class: 'hint' }, 'Rascunho: só aparece no acervo depois de publicado.')]),
      h('div', { class: 'act-list done-more' },
        h('a', { class: 'act', href: '/admin/novo', 'data-link': true }, icon('plus', 20), h('span', { class: 'act-tx' }, h('b', {}, 'Criar outro drop'), h('small', {}, 'Começa um drop do zero.'))),
        h('a', { class: 'act', href: '/admin', 'data-link': true }, icon('list', 20), h('span', { class: 'act-tx' }, h('b', {}, 'Ver todos os drops'), h('small', {}, 'Volta ao painel com os lançamentos.')))));
    foot.replaceChildren(
      h('button', { class: 'ghost', type: 'button', 'data-testid': 'edit-again', onclick: () => show(0) }, 'Editar'),
      drop.published
        ? h('button', { class: 'primary', type: 'button', 'data-testid': 'see', onclick: () => go(`/c/${encodeURIComponent(drop.slug)}`) }, 'Ver no acervo')
        : h('button', { class: 'primary', type: 'button', 'data-testid': 'publish-now', onclick: () => { drop.published = true; pubIn.checked = true; void save(); } }, 'Publicar agora'));
    scroller.scrollTop = 0;
    announce(drop.published ? `${drop.name} está no ar no acervo.` : `${drop.name} salvo como rascunho.`);
    (doneEl.querySelector('h3') as HTMLElement).focus({ preventScroll: true });
  }

  // ---------- salvar ----------
  const saveBtn = h('button', { class: 'primary', type: 'button', 'data-testid': 'save' }, 'Salvar');
  let saving = false;
  const showNameError = () => { nameErr.textContent = 'Dê um nome ao drop.'; nameErr.hidden = false; nameIn.ariaInvalid = 'true'; };
  const save = async () => {
    if (saving) return;
    if (!drop.name.trim()) { show(0); showNameError(); nameIn.focus(); return; }
    if (drop.storeUrl && !safeUrl(drop.storeUrl)) {
      show(3); storeErr.textContent = 'Use um link completo, começando com https://'; storeErr.hidden = false; storeIn.ariaInvalid = 'true'; storeIn.focus(); return;
    }
    if (drop.storeUrl) drop.storeUrl = safeUrl(drop.storeUrl)!;
    saving = true; saveBtn.disabled = true; saveBtn.ariaBusy = 'true'; saveBtn.textContent = 'Salvando…';
    const done = () => { saving = false; saveBtn.disabled = false; saveBtn.ariaBusy = 'false'; saveBtn.textContent = 'Salvar'; };
    try {
      await saveDrop(drop, REMOTE ? await makeOg(drop) : undefined);
    } catch (e) { console.error(e); done(); toast(saveError(e), 'error'); return; }
    done(); slugIn.value = drop.slug; renderLink(); toast('Salvo', 'ok');
    clearTimeout(draftT); dirty = false; await clearDraft(key); await clearDraft(drop.id);
    if (isNew) { isNew = false; key = drop.id; history.replaceState({}, '', `/admin/${drop.id}`); }
    renderMode();
    showDone();
  };
  saveBtn.onclick = save;
  const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } };
  addEventListener('keydown', onKey);

  // ---------- estrutura ----------
  let step = 0;
  const heading = h('h2', {}, isNew ? 'Novo drop' : 'Editar drop');
  const backLink = h('a', { class: 'ico', href: '/admin', 'data-link': true, ariaLabel: 'Voltar para todos os drops' }, icon('back', 22));
  const menuBtn = h('button', { class: 'ico', type: 'button', ariaLabel: 'Mais ações', 'aria-haspopup': 'dialog', 'data-testid': 'menu', onclick: () => openMenu() }, icon('more', 22));
  const stepBtns = STEPS.map((name, i) => h('button', { type: 'button', 'data-testid': `step-${i}`, onclick: () => { if (i > step && step === 0 && !drop.name.trim()) { showNameError(); nameIn.focus(); return; } show(i); } },
    h('span', { class: 'bar' }), h('span', { class: 'lbl' }, h('span', { class: 'sr-only' }, 'Passo '), h('b', {}, String(i + 1)), h('span', { class: 'nm' }, ` ${name}`))));
  const lidBtn = h('button', { class: 'ghost', type: 'button', ariaPressed: 'false', onclick: () => {
    target = target ? 0 : 1; lidBtn.textContent = target ? 'Fechar tampa' : 'Abrir tampa'; lidBtn.ariaPressed = String(!!target);
  } }, 'Abrir tampa');
  const grow = h('button', { class: 'ghost grow', type: 'button', ariaLabel: 'Ampliar prévia', ariaExpanded: 'false', onclick: () => {
    const big = ed.classList.toggle('big');
    grow.ariaExpanded = String(big); grow.ariaLabel = big ? 'Reduzir prévia' : 'Ampliar prévia';
    grow.replaceChildren(icon(big ? 'shrink' : 'expand', 20));
  } }, icon('expand', 20));
  const scroller = h('div', { class: 'ed-scroll' },
    recovered ? h('div', { class: 'notice', role: 'status' }, icon('alert', 18), h('span', {}, copied ? 'Cópia pronta: ajuste o nome e salve. ' : 'Recuperamos o que você não tinha salvo. '),
      h('button', { class: 'txt sm', type: 'button', onclick: async () => { clearTimeout(draftT); dirty = false; await clearDraft(key); go(location.pathname); } }, copied ? 'Cancelar' : 'Descartar')) : null,
    ...sections, doneEl);
  const foot = h('div', { class: 'ed-foot' });
  const ed = h('div', { class: 'ed', 'data-mode': isNew ? 'new' : 'edit' },
    h('header', { class: 'ed-top' }, backLink, h('div', { class: 'ed-title' }, heading, titleSub), menuBtn),
    h('nav', { class: 'ed-steps', ariaLabel: 'Etapas' }, h('ol', {}, ...stepBtns.map((b) => h('li', {}, b)))),
    h('div', { class: 'ed-stage', 'data-testid': 'preview' }, previewHost, h('div', { class: 'stage-bar' }, lidBtn, grow)),
    scroller, foot);

  function renderMode() {
    heading.textContent = isNew ? 'Novo drop' : 'Editar drop';
    ed.dataset.mode = isNew ? 'new' : 'edit';
    if (!isDone) renderFoot();
  }
  /** Rodapé: um único botão principal (Continuar ou Salvar); voltar/avançar viram setas compactas. */
  function renderFoot() {
    const last = step === STEPS.length - 1;
    const prev = h('button', { class: 'ghost icon-btn', type: 'button', 'data-testid': 'prev', ariaLabel: 'Passo anterior', onclick: () => show(step - 1) }, icon('back', 22));
    const fwd = h('button', { class: 'ghost icon-btn', type: 'button', 'data-testid': 'next', ariaLabel: 'Próximo passo', onclick: () => show(step + 1) }, h('span', { class: 'flip' }, icon('back', 22)));
    const next = h('button', { class: 'primary', type: 'button', 'data-testid': 'next', onclick: () => {
      if (step === 0 && !drop.name.trim()) { showNameError(); nameIn.focus(); return; }
      show(step + 1);
    } }, 'Continuar');
    if (!isNew) foot.replaceChildren(...(step > 0 ? [prev] : []), saveBtn, ...(last ? [] : [fwd]));
    else foot.replaceChildren(...(step > 0 ? [prev] : []), last ? saveBtn : next);
  }
  function show(n: number) {
    if (isDone) { isDone = false; ed.classList.remove('is-done'); doneEl.hidden = true; }
    step = Math.max(0, Math.min(STEPS.length - 1, n));
    sections.forEach((s, i) => { s.hidden = i !== step; });
    stepBtns.forEach((b, i) => { b.classList.toggle('done', i < step); b.classList.toggle('cur', i === step); i === step ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current'); });
    ed.dataset.step = String(step);
    ed.dataset.stage = step === 1 || step === 2 ? '1' : '0';   // a prévia só aparece onde ela ajuda (celular)
    if (step === 3) { noArt.hidden = hasArt(); requestAnimationFrame(() => fitTa(itemsTa)); }
    renderFoot();
    scroller.scrollTop = 0;
    announce(`Passo ${step + 1} de ${STEPS.length}: ${STEPS[step]}`);
  }

  // ---------- menu de ações (folha; cada ação explica o que faz e pede confirmação quando muda algo) ----------
  function openMenu() {
    const run = async (fn: () => unknown) => { await m.close(); m.el.remove(); await fn(); };
    const m = sheet('Ações',
      action('Todos os drops', 'Volta ao painel com os lançamentos. O que não foi salvo fica guardado no aparelho.', 'list', () => run(() => go('/admin')), { testid: 'act-all' }),
      !isNew ? action('Novo drop', 'Começa um drop do zero.', 'plus', () => run(() => go('/admin/novo')), { testid: 'act-new' }) : null,
      action('Duplicar drop', 'Cria uma cópia em rascunho, com a mesma arte, para ajustar.', 'copy', () => run(duplicate), { testid: 'act-dup' }),
      !isNew && drop.published ? action('Ver no acervo', `Abre a página pública /c/${drop.slug}.`, 'external', () => run(() => go(`/c/${encodeURIComponent(drop.slug)}`)), { testid: 'act-view' }) : null,
      !isNew ? action('Excluir drop', 'Apaga o drop, a arte e o link. Não dá para desfazer.', 'trash', () => run(remove), { danger: true, testid: 'act-del' }) : null,
      h('button', { type: 'button', class: 'act cancel', onclick: () => void m.close() }, 'Cancelar'));
    m.el.addEventListener('close', () => m.el.remove(), { once: true });
    m.open();
  }
  async function remove() {
    const ok = await confirmSheet({ title: `Excluir "${drop.name}"?`, body: `Apaga o drop, a arte e o link /c/${drop.slug}. Não dá para desfazer.`, confirm: 'Excluir', danger: true });
    if (!ok) return;
    await deleteDrop(drop.id); await clearDraft(drop.id); toast('Drop excluído'); go('/admin');
  }
  async function duplicate() {
    const ok = await confirmSheet({ title: `Duplicar "${drop.name.trim() || 'este drop'}"?`, body: 'Cria uma cópia em rascunho, com a mesma arte e ficha. Ela abre no editor para você ajustar o nome e salvar.', confirm: 'Duplicar' });
    if (!ok) return;
    await draftCopy(drop);
    toast('Cópia criada: ajuste e salve');
    if (isNew) go(location.pathname); else go('/admin/novo');
  }

  // ---------- teclado e tela ----------
  // O editor ocupa só a área visível (acima do teclado): rodapé sempre à mão, nada grudado/sobreposto.
  const vv = window.visualViewport;
  const size = () => { if (!vv) return; ed.style.setProperty('--vvh', `${vv.height}px`); ed.style.setProperty('--vvt', `${vv.offsetTop}px`); };
  vv?.addEventListener('resize', size); vv?.addEventListener('scroll', size); size();
  const coarse = matchMedia('(pointer: coarse)');
  const NO_KB = new Set(['checkbox', 'radio', 'color', 'file', 'date', 'range', 'button', 'submit']);
  const typesText = (el: Element | null) => el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !NO_KB.has(el.type));
  let typT = 0;
  ed.addEventListener('focusin', (e) => {
    const t = e.target as HTMLElement;
    if (coarse.matches && typesText(t)) { clearTimeout(typT); ed.classList.add('typing'); setTimeout(() => t.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior }), 250); }
  });
  ed.addEventListener('focusout', () => {
    clearTimeout(typT);
    typT = window.setTimeout(() => { if (!typesText(document.activeElement)) ed.classList.remove('typing'); }, 150);
  });
  // Enter num campo avança o passo (como o "próximo" do teclado do celular)
  ed.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (e.key !== 'Enter' || !(t instanceof HTMLInputElement) || NO_KB.has(t.type)) return;
    e.preventDefault();
    if (step === 0 && !drop.name.trim()) { showNameError(); nameIn.focus(); return; }
    // só campos à vista: fora de "Mais opções" fechado (o Chrome ainda dá caixa a esses campos)
    const fields = [...sections[step].querySelectorAll<HTMLElement>('input, textarea')].filter((f) => typesText(f) && f.offsetParent && !f.closest('details:not([open])'));
    const nextField = fields[fields.indexOf(t) + 1];
    if (nextField) { nextField.focus(); return; }
    t.blur();
    if (step < STEPS.length - 1) show(step + 1);
  });
  scroller.addEventListener('input', persist); scroller.addEventListener('change', persist);

  // Voltando pelo cache do navegador (ex.: depois do gabarito no iPhone) o Safari apaga os campos autocomplete=off:
  // recoloca neles o que o drop em memória guarda.
  const onShow = (e: PageTransitionEvent) => { if (e.persisted) syncAll(); };
  addEventListener('pageshow', onShow);

  show(0);
  sk.replaceWith(ed);
  refresh();
  return () => {
    clearTimeout(timer); clearTimeout(artT); clearTimeout(typT); clearTimeout(draftT);
    if (dirty) saveDraft(key, drop);
    removeEventListener('keydown', onKey); removeEventListener('pageshow', onShow);
    removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onHide);
    vv?.removeEventListener('resize', size); vv?.removeEventListener('scroll', size);
    document.querySelectorAll('dialog.sheet-dlg').forEach((x) => x.remove());
    urls.forEach((u) => URL.revokeObjectURL(u));
    stage.dispose(); box?.dispose(); Object.values(texs).forEach((t) => t!.dispose());
  };
}

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
