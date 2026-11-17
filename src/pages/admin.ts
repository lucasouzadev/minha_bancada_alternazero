import type * as THREE from 'three';
import { buildTextures, imageSize, normalizeUpload, templateCanvas, demoDieline } from '../art';
import { buildBox, type BuiltBox } from '../box';
import { deleteDrop, getDrop, listDrops, newDrop, saveDrop, slugify } from '../db';
import { dielineRects } from '../layout';
import { createStage } from '../stage';
import { FACES, FACE_LABEL, type Drop, type Face, type Finish } from '../types';
import { go } from '../main';
import { h, toast } from '../ui';
import { REMOTE, sb } from '../remote';
import { makeOg } from '../og';

export const FINISH_LABEL: Record<Finish, string> = { matte: 'Fosco', satin: 'Acetinado', gloss: 'Brilho (verniz)' };

async function loginGate(root: HTMLElement): Promise<boolean> {
  if (!REMOTE) return true;
  if ((await sb.auth.getSession()).data.session) return true;
  const email = h('input', { type: 'email', placeholder: 'e-mail', autocomplete: 'username' });
  const pass = h('input', { type: 'password', placeholder: 'senha', autocomplete: 'current-password' });
  const msg = h('small', { class: 'warn' });
  const enter = async () => {
    const { error } = await sb.auth.signInWithPassword({ email: email.value, password: pass.value });
    if (error) msg.textContent = 'E-mail ou senha incorretos.'; else go('/admin');
  };
  pass.addEventListener('keydown', (e) => e.key === 'Enter' && enter());
  root.append(h('div', { class: 'login' }, h('h2', {}, 'Editor'), email, pass, msg, h('button', { class: 'primary', onclick: enter }, 'Entrar'), h('a', { class: 'txt', href: '/', 'data-link': true }, 'Voltar ao acervo')));
  return false;
}

export async function adminPage(root: HTMLElement, id?: string) {
  if (!(await loginGate(root))) return;
  const all = await listDrops();
  const drop: Drop = (id && (await getDrop(id))) || newDrop();
  const isNew = !all.some((d) => d.id === drop.id);
  let slugTouched = !!drop.slug;

  const previewHost = h('div', { class: 'stage' });
  const warn = h('div', { class: 'warn' });
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
    const first = !stage.controls.target.lengthSq() && !previewHost.dataset.ready;
    stage.setObject(box.group, box.size, box.frameSize); previewHost.dataset.ready = '1'; void first;
    box.setOpen(open);
    checkAspect();
  }
  const schedule = () => { clearTimeout(timer); timer = window.setTimeout(refresh, 150); };

  async function checkAspect() {
    warn.textContent = '';
    if (drop.artMode !== 'dieline' || !drop.art.dieline) return;
    const { w, h: ih } = await imageSize(drop.art.dieline);
    const { totalW, totalH } = dielineRects(drop.w, drop.h, drop.d);
    const diff = Math.abs(w / ih - totalW / totalH) / (totalW / totalH);
    if (diff > 0.03) warn.textContent = `⚠ A proporção da arte (${w}×${ih}px) não bate com a faca (${totalW}×${totalH} mm). A arte será esticada — baixe o gabarito para conferir.`;
  }

  // ---------- campos ----------
  const text = (label: string, key: 'name' | 'subtitle' | 'artist', ph = '') => {
    const i = h('input', { value: drop[key], placeholder: ph, oninput: () => {
      drop[key] = i.value;
      if (key === 'name' && !slugTouched) { drop.slug = slugify(i.value); slug.value = drop.slug; }
    } });
    return field(label, i);
  };
  const slug = h('input', { value: drop.slug, placeholder: 'mutacoes', oninput: () => { slugTouched = true; drop.slug = slugify(slug.value); } });
  const num = (label: string, key: 'w' | 'h' | 'd') => {
    const i = h('input', { type: 'number', min: 10, max: 1000, value: String(drop[key]), oninput: () => { drop[key] = Math.max(10, +i.value || 10); schedule(); } });
    return field(label, i);
  };
  const color = (label: string, key: 'inner' | 'tissue') => {
    const i = h('input', { type: 'color', value: drop[key], oninput: () => { drop[key] = i.value; schedule(); } });
    return field(label, i);
  };
  const select = <T extends string>(label: string, key: 'finish' | 'openMode' | 'artMode', opts: [T, string][], after?: () => void) => {
    const s = h('select', { onchange: () => { (drop as any)[key] = s.value; after?.(); schedule(); } },
      ...opts.map(([v, l]) => h('option', { value: v, selected: (drop as any)[key] === v }, l)));
    return field(label, s);
  };
  const itemsTa = h('textarea', { rows: 3, placeholder: 'Uma por linha', value: drop.items.join('\n'), oninput: () => { drop.items = itemsTa.value.split('\n').map((s) => s.trim()).filter(Boolean); } });
  const tagsIn = h('input', { value: drop.tags.join(', '), placeholder: 'horror, anime, ocultismo', oninput: () => { drop.tags = tagsIn.value.split(',').map((s) => s.trim()).filter(Boolean); } });
  const dateIn = h('input', { type: 'date', value: drop.date, oninput: () => { drop.date = dateIn.value; } });

  // ---------- arte ----------
  const artBox = h('div', { class: 'artbox' });
  const fileInput = (label: string, key: 'dieline' | Face) => {
    const status = h('small', { class: 'muted' }, drop.art[key] ? '✓ enviada' : 'nenhum arquivo');
    const inp = h('input', { type: 'file', accept: 'image/*', onchange: async () => {
      const f = inp.files?.[0]; if (!f) return;
      drop.art[key] = await normalizeUpload(f); status.textContent = `✓ ${f.name}`; refresh();
    } });
    return h('label', { class: 'file' }, h('span', {}, label), inp, status);
  };
  function renderArt() {
    artBox.replaceChildren();
    if (drop.artMode === 'dieline') {
      artBox.append(
        fileInput('Arte planificada (faca em cruz)', 'dieline'),
        h('div', { class: 'row2' },
          h('button', { class: 'ghost', onclick: () => templateCanvas(drop.w, drop.h, drop.d).toBlob((b) => download(b!, `gabarito-${drop.slug || 'caixa'}-${drop.w}x${drop.h}x${drop.d}.png`)) }, 'Baixar gabarito (PNG)'),
          h('button', { class: 'ghost', onclick: async () => { drop.art.dieline = await demoDieline(drop.w, drop.h, drop.d, drop.name || 'Drop', true, Date.now() % 1000); renderArt(); refresh(); } }, 'Usar arte de exemplo')),
        h('small', { class: 'muted' }, (() => { const r = dielineRects(drop.w, drop.h, drop.d); return `Tamanho da arte: ${r.totalW} × ${r.totalH} mm (qualquer resolução, mesma proporção).`; })()));
    } else {
      FACES.forEach((f) => artBox.append(fileInput(FACE_LABEL[f], f)));
    }
  }
  renderArt();
  const dimIn = [num('Largura (mm)', 'w'), num('Altura (mm)', 'h'), num('Profundidade (mm)', 'd')];
  dimIn.forEach((f) => f.addEventListener('input', () => { renderArt(); }));

  const pubIn = h('input', { type: 'checkbox', checked: drop.published, onchange: () => { drop.published = pubIn.checked; } });

  const save = async () => {
    if (!drop.name.trim()) return toast('Dê um nome ao drop');
    try {
      toast('Salvando…');
      await saveDrop(drop, REMOTE ? await makeOg(drop) : undefined);
    } catch (e) { console.error(e); return toast('Não foi possível salvar'); }
    slug.value = drop.slug; toast('Salvo');
    if (isNew) go(`/admin/${drop.id}`);
  };

  root.append(h('div', { class: 'admin' },
    h('aside', { class: 'panel' },
      h('div', { class: 'row2 between' },
        h('a', { class: 'ghost', href: '/', 'data-link': true }, '‹ Acervo'),
        h('select', { onchange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; go(v ? `/admin/${v}` : '/admin'); } },
          h('option', { value: '' }, isNew ? '— novo drop —' : '+ Novo drop'),
          ...all.map((d) => h('option', { value: d.id, selected: d.id === drop.id }, d.name)))),
      h('h2', {}, isNew ? 'Novo drop' : 'Editar drop'),
      text('Nome', 'name', 'Mutações'), text('Subtítulo', 'subtitle', 'Drop 07'), text('Artista', 'artist'),
      h('div', { class: 'grid2' }, field('Lançamento', dateIn), field('Link (slug)', slug)),
      h('div', { class: 'eyebrow' }, 'Caixa'),
      h('div', { class: 'grid3' }, ...dimIn),
      h('div', { class: 'grid2' },
        select('Acabamento', 'finish', Object.entries(FINISH_LABEL) as [Finish, string][]),
        select('Abertura', 'openMode', [['top', 'Tampa (topo)'], ['book', 'Livro (capa)']])),
      h('div', { class: 'grid2' }, color('Cor interna', 'inner'), color('Papel de seda', 'tissue')),
      h('div', { class: 'eyebrow' }, 'Arte'),
      select('Formato da arte', 'artMode', [['dieline', 'Faca única (recomendado)'], ['faces', 'Uma imagem por face']], renderArt),
      artBox, warn,
      h('div', { class: 'eyebrow' }, 'Ficha'),
      field('Dentro da caixa', itemsTa), field('Tags', tagsIn),
      h('label', { class: 'check' }, pubIn, 'Publicado (aparece no acervo e no link)'),
      h('div', { class: 'row2' },
        h('button', { class: 'primary', onclick: save }, 'Salvar'),
        !isNew && h('a', { class: 'ghost', href: `/c/${drop.slug}?preview`, 'data-link': true }, 'Ver página'),
        !isNew && h('button', { class: 'danger', onclick: async () => { if (confirm(`Excluir "${drop.name}"?`)) { await deleteDrop(drop.id); go('/admin'); } } }, 'Excluir'))),
    h('div', { class: 'preview' }, previewHost,
      h('div', { class: 'row2 center pad' }, h('button', { class: 'ghost', onclick: (e: Event) => { target = target ? 0 : 1; (e.target as HTMLElement).textContent = target ? 'Fechar' : 'Abrir caixa'; } }, 'Abrir caixa')))));

  refresh();
  return () => { clearTimeout(timer); stage.dispose(); box?.dispose(); Object.values(texs).forEach((t) => t!.dispose()); };
}

const field = (label: string, el: HTMLElement) => h('label', { class: 'field' }, h('span', {}, label), el);
function download(b: Blob, name: string) {
  const a = h('a', { href: URL.createObjectURL(b), download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
