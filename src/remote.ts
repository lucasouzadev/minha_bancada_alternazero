import { normalizeDrop, FACES, type Drop } from './types';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const REMOTE = !!(SUPABASE_URL && SUPABASE_KEY);
/** supabase-js (~50 KB) só é baixado por quem escreve/entra no painel; o acervo público lê por fetch. */
const client = async () => (await import('./sb')).sb;

const BUCKET = 'caixas';
const MAX_ART = 12 * 1024 * 1024;
const pathOf = new WeakMap<Blob, string>();
const publicUrl = (path: string, v: string) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}?v=${encodeURIComponent(v)}`;
/** Miniatura gravada ao lado da arte: "<uuid>/front-123.webp" → "<uuid>/front-123-s.webp". */
const smallPath = (p: string) => p.replace(/\.(webp|png)$/, '-s.webp');
const THUMB_EDGE = { dieline: 1600, face: 768 };

/** Linha do banco → drop validado (sem as imagens). */
const rowMeta = (row: any): Drop => ({
  ...normalizeDrop(row.data), id: String(row.id), slug: normalizeDrop({ slug: row.slug }).slug,
  published: !!row.published, art: {}, updatedAt: Date.parse(row.updated_at) || 0,
});
/** Só caminhos que o próprio app grava: "<uuid>/<face>-<n>.webp". */
const ART_KEYS = new Set<string>(['dieline', ...FACES]);
const ART_PATH = /^[0-9a-f-]{36}\/[a-z]+-\d+\.(webp|png)$/i;

const isArt = (k: string, path: unknown): path is string => ART_KEYS.has(k) && typeof path === 'string' && ART_PATH.test(path);
async function fetchImage(url: string): Promise<Blob | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const b = await r.blob();
    return b.type.startsWith('image/') ? b : null;
  } catch { return null; }
}

/**
 * Linha → drop com a arte. `small`: prateleira — baixa a miniatura (cai para a arte cheia se o drop é antigo e
 * não tem miniatura) e deixa `fullArt()` para quando a pessoa abrir a caixa.
 */
async function rowToDrop(row: any, small = false): Promise<Drop> {
  const drop = rowMeta(row);
  const src: Record<string, unknown> = row.data?.art && typeof row.data.art === 'object' ? row.data.art : {};
  const entries = Object.entries(src).filter(([k, p]) => isArt(k, p)) as [string, string][];
  const full = async () => {
    const art: Drop['art'] = {};
    await Promise.all(entries.map(async ([k, path]) => {
      const b = await fetchImage(publicUrl(path, row.updated_at));
      if (b) { pathOf.set(b, path); (art as any)[k] = b; }
    }));
    return art;
  };
  if (!small) { drop.art = await full(); return drop; }
  await Promise.all(entries.map(async ([k, path]) => {
    const b = (await fetchImage(publicUrl(smallPath(path), row.updated_at))) ?? (await fetchImage(publicUrl(path, row.updated_at)));
    if (b) (drop.art as any)[k] = b;
  }));
  let cached: Promise<Drop['art']> | undefined;
  drop.fullArt = () => (cached ??= full());
  return drop;
}

/** Acervo público: leitura anônima por fetch na API REST (sem baixar o supabase-js). */
async function publicRows(): Promise<any[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/drops?select=*&published=eq.true`, { headers: { apikey: SUPABASE_KEY! } });
  if (!r.ok) throw new Error(`drops ${r.status}`);
  const rows = await r.json();
  return Array.isArray(rows) ? rows : [];
}

export async function remoteList(onlyPublished = false): Promise<Drop[]> {
  let rows: any[];
  if (onlyPublished) rows = await publicRows();   // vitrine: só publicados, com miniaturas
  else {
    const { data, error } = await (await client()).from('drops').select('*');
    if (error) throw error;
    rows = data ?? [];
  }
  const all = await Promise.all(rows.map((row) => rowToDrop(row, onlyPublished)));
  return all.sort((a, b) => b.date.localeCompare(a.date));
}

/** Só os dados (sem baixar as imagens): para listas e seletores. `art` vem vazio. */
export async function remoteMeta(): Promise<Drop[]> {
  const { data, error } = await (await client()).from('drops').select('*');
  if (error) throw error;
  return (data ?? []).map(rowMeta)
    .sort((a, b) => b.date.localeCompare(a.date));
}
export async function remoteGet(id: string): Promise<Drop | undefined> {
  const { data, error } = await (await client()).from('drops').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? rowToDrop(data) : undefined;
}

/** Miniatura de uma arte (≤ 768 px, ou 1600 px na faca) em webp, enviada junto com ela. */
async function makeSmall(blob: Blob, key: string): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const edge = key === 'dieline' ? THUMB_EDGE.dieline : THUMB_EDGE.face;
    const k = Math.min(1, edge / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
    return await new Promise((res) => c.toBlob((o) => res(o && o.type === 'image/webp' ? o : null), 'image/webp', 0.82));
  } catch { return null; }
}

export async function remoteSave(drop: Drop, og?: Blob): Promise<Drop> {
  const sb = await client();
  const paths: Record<string, string> = {};
  for (const [k, blob] of Object.entries(drop.art) as [string, Blob][]) {
    let p = pathOf.get(blob);
    if (!p) {
      const ext = blob.type === 'image/png' ? 'png' : 'webp';
      if (!/^image\/(webp|png)$/.test(blob.type) || blob.size > MAX_ART) throw new Error('arte inválida');
      p = `${drop.id}/${k}-${Date.now()}.${ext}`;
      const { error } = await sb.storage.from(BUCKET).upload(p, blob, { contentType: blob.type, cacheControl: '31536000' });
      if (error) throw error; pathOf.set(blob, p);
      // miniatura para a prateleira (se falhar, o acervo usa a arte cheia)
      const sm = await makeSmall(blob, k);
      if (sm) await sb.storage.from(BUCKET).upload(smallPath(p), sm, { contentType: 'image/webp', cacheControl: '31536000' });
    }
    paths[k] = p;
  }
  if (og) {
    const { error } = await sb.storage.from(BUCKET).upload(`${drop.id}/og.jpg`, og, { contentType: 'image/jpeg', upsert: true, cacheControl: '60' });
    if (error) throw error;
  }
  const { id, slug, published, art: _a, updatedAt: _u, fullArt: _f, ...rest } = drop; void _a; void _u; void _f;
  const updated_at = new Date().toISOString();
  const { error } = await sb.from('drops').upsert({ id, slug, published, data: { ...rest, art: paths }, updated_at });
  if (error) throw error;
  drop.updatedAt = Date.parse(updated_at); return drop;
}

/** Liga/desliga a publicação sem reenviar arte nem regravar os dados. */
export async function remoteSetPublished(id: string, published: boolean) {
  const sb = await client();
  const { error } = await sb.from('drops').update({ published, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
/** Miniatura do drop no servidor (a imagem do WhatsApp, gerada ao salvar). */
export const remoteThumb = (id: string, v: number) => `${publicUrl(`${id}/og.jpg`, String(v))}`;

export async function remoteDelete(id: string) {
  const sb = await client();
  const { data } = await sb.storage.from(BUCKET).list(id);
  if (data?.length) await sb.storage.from(BUCKET).remove(data.map((f) => `${id}/${f.name}`));
  const { error } = await sb.from('drops').delete().eq('id', id);
  if (error) throw error;
}
