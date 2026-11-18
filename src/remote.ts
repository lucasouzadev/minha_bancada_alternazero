import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { normalizeDrop, FACES, type Drop } from './types';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const REMOTE = !!(URL_ && KEY);
export const sb: SupabaseClient = REMOTE ? createClient(URL_!, KEY!) : (null as never);

const BUCKET = 'caixas';
const MAX_ART = 12 * 1024 * 1024;
const pathOf = new WeakMap<Blob, string>();
const publicUrl = (path: string, v: string) => `${sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl}?v=${encodeURIComponent(v)}`;

/** Linha do banco → drop validado (sem as imagens). */
const rowMeta = (row: any): Drop => ({
  ...normalizeDrop(row.data), id: String(row.id), slug: normalizeDrop({ slug: row.slug }).slug,
  published: !!row.published, art: {}, updatedAt: Date.parse(row.updated_at) || 0,
});
/** Só caminhos que o próprio app grava: "<uuid>/<face>-<n>.webp". */
const ART_KEYS = new Set<string>(['dieline', ...FACES]);
const ART_PATH = /^[0-9a-f-]{36}\/[a-z]+-\d+\.(webp|png)$/i;

async function rowToDrop(row: any): Promise<Drop> {
  const drop = rowMeta(row);
  const src = row.data?.art && typeof row.data.art === 'object' ? row.data.art : {};
  await Promise.all(Object.entries(src).map(async ([k, path]) => {
    if (!ART_KEYS.has(k) || typeof path !== 'string' || !ART_PATH.test(path)) return;
    const r = await fetch(publicUrl(path, row.updated_at));
    if (!r.ok) return;
    const b = await r.blob();
    if (!b.type.startsWith('image/')) return;
    pathOf.set(b, path); (drop.art as any)[k] = b;
  }));
  return drop;
}

export async function remoteList(onlyPublished = false): Promise<Drop[]> {
  // o acervo pede só os publicados: com admin logado, não baixa a arte dos rascunhos
  const q = sb.from('drops').select('*');
  const { data, error } = await (onlyPublished ? q.eq('published', true) : q);
  if (error) throw error;
  const all = await Promise.all((data ?? []).map(rowToDrop));
  return all.sort((a, b) => b.date.localeCompare(a.date));
}

/** Só os dados (sem baixar as imagens): para listas e seletores. `art` vem vazio. */
export async function remoteMeta(): Promise<Drop[]> {
  const { data, error } = await sb.from('drops').select('*');
  if (error) throw error;
  return (data ?? []).map(rowMeta)
    .sort((a, b) => b.date.localeCompare(a.date));
}
export async function remoteGet(id: string): Promise<Drop | undefined> {
  const { data, error } = await sb.from('drops').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? rowToDrop(data) : undefined;
}

export async function remoteSave(drop: Drop, og?: Blob): Promise<Drop> {
  const paths: Record<string, string> = {};
  for (const [k, blob] of Object.entries(drop.art) as [string, Blob][]) {
    let p = pathOf.get(blob);
    if (!p) {
      const ext = blob.type === 'image/png' ? 'png' : 'webp';
      if (!/^image\/(webp|png)$/.test(blob.type) || blob.size > MAX_ART) throw new Error('arte inválida');
      p = `${drop.id}/${k}-${Date.now()}.${ext}`;
      const { error } = await sb.storage.from(BUCKET).upload(p, blob, { contentType: blob.type, cacheControl: '31536000' });
      if (error) throw error; pathOf.set(blob, p);
    }
    paths[k] = p;
  }
  if (og) {
    const { error } = await sb.storage.from(BUCKET).upload(`${drop.id}/og.jpg`, og, { contentType: 'image/jpeg', upsert: true, cacheControl: '60' });
    if (error) throw error;
  }
  const { id, slug, published, art: _a, updatedAt: _u, ...rest } = drop; void _a; void _u;
  const updated_at = new Date().toISOString();
  const { error } = await sb.from('drops').upsert({ id, slug, published, data: { ...rest, art: paths }, updated_at });
  if (error) throw error;
  drop.updatedAt = Date.parse(updated_at); return drop;
}

/** Liga/desliga a publicação sem reenviar arte nem regravar os dados. */
export async function remoteSetPublished(id: string, published: boolean) {
  const { error } = await sb.from('drops').update({ published, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
/** Miniatura do drop no servidor (a imagem do WhatsApp, gerada ao salvar). */
export const remoteThumb = (id: string, v: number) => `${sb.storage.from(BUCKET).getPublicUrl(`${id}/og.jpg`).data.publicUrl}?v=${v}`;

export async function remoteDelete(id: string) {
  const { data } = await sb.storage.from(BUCKET).list(id);
  if (data?.length) await sb.storage.from(BUCKET).remove(data.map((f) => `${id}/${f.name}`));
  const { error } = await sb.from('drops').delete().eq('id', id);
  if (error) throw error;
}
