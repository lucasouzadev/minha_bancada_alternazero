import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Drop } from './types';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const REMOTE = !!(URL_ && KEY);
export const sb: SupabaseClient = REMOTE ? createClient(URL_!, KEY!) : (null as never);

const BUCKET = 'caixas';
const pathOf = new WeakMap<Blob, string>();
const publicUrl = (path: string, v: string) => `${sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl}?v=${encodeURIComponent(v)}`;

async function rowToDrop(row: any): Promise<Drop> {
  const d = row.data;
  const art: Drop['art'] = {};
  await Promise.all(Object.entries(d.art ?? {}).map(async ([k, path]) => {
    const r = await fetch(publicUrl(path as string, row.updated_at));
    if (!r.ok) return;
    const b = await r.blob(); pathOf.set(b, path as string); (art as any)[k] = b;
  }));
  return { ...d, id: row.id, slug: row.slug, published: row.published, art, updatedAt: Date.parse(row.updated_at) };
}

export async function remoteList(): Promise<Drop[]> {
  const { data, error } = await sb.from('drops').select('*');
  if (error) throw error;
  const all = await Promise.all((data ?? []).map(rowToDrop));
  return all.sort((a, b) => b.date.localeCompare(a.date));
}

export async function remoteSave(drop: Drop, og?: Blob): Promise<Drop> {
  const paths: Record<string, string> = {};
  for (const [k, blob] of Object.entries(drop.art) as [string, Blob][]) {
    let p = pathOf.get(blob);
    if (!p) {
      p = `${drop.id}/${k}-${Date.now()}.webp`;
      const { error } = await sb.storage.from(BUCKET).upload(p, blob, { contentType: blob.type || 'image/webp', cacheControl: '31536000' });
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

export async function remoteDelete(id: string) {
  const { data } = await sb.storage.from(BUCKET).list(id);
  if (data?.length) await sb.storage.from(BUCKET).remove(data.map((f) => `${id}/${f.name}`));
  const { error } = await sb.from('drops').delete().eq('id', id);
  if (error) throw error;
}
