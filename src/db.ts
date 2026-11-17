import { demoDieline } from './art';
import { REMOTE, remoteDelete, remoteGet, remoteList, remoteMeta, remoteSave } from './remote';
import type { Drop } from './types';

const STORE = 'drops', DRAFTS = 'drafts';
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('caixa3d', 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(DRAFTS)) db.createObjectStore(DRAFTS); // rascunhos do editor (com as imagens), chave = "new" ou id
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, store = STORE): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const rq = fn(db.transaction(store, mode).objectStore(store));
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  });
}

export const slugify = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'drop';

export async function listDrops(): Promise<Drop[]> {
  if (REMOTE) return remoteList();
  await ensureSeed();
  const all = await run<Drop[]>('readonly', (s) => s.getAll());
  return all.sort((a, b) => b.date.localeCompare(a.date));
}
/** Lista leve para seletores e checagens: no servidor não baixa as imagens de cada drop. */
export async function listDropMeta(): Promise<Drop[]> {
  if (REMOTE) return remoteMeta();
  return listDrops();
}
export async function getDrop(id: string) {
  if (REMOTE) return remoteGet(id);
  return run<Drop | undefined>('readonly', (s) => s.get(id));
}
export async function getBySlug(slug: string) { return (await listDrops()).find((d) => d.slug === slug); }
export async function deleteDrop(id: string) {
  if (REMOTE) return remoteDelete(id);
  await run('readwrite', (s) => s.delete(id));
}
export async function saveDrop(d: Drop, og?: Blob) {
  const others = (await listDropMeta()).filter((x) => x.id !== d.id);
  let slug = slugify(d.slug || d.name), n = 2;
  while (others.some((x) => x.slug === slug)) slug = `${slugify(d.slug || d.name)}-${n++}`;
  d.slug = slug; d.updatedAt = Date.now();
  if (REMOTE) return remoteSave(d, og);
  await run('readwrite', (s) => s.put(d));
  return d;
}
/* Rascunho do editor: guardado no aparelho (inclui as imagens) e apagado ao salvar. */
export type Draft = Omit<Drop, 'updatedAt'> & { savedAt: number; dup?: boolean };
export const saveDraft = (key: string, d: Drop) => run('readwrite', (s) => s.put({ ...d, savedAt: Date.now() }, key), DRAFTS).catch(() => undefined);
export const loadDraft = (key: string) => run<Draft | undefined>('readonly', (s) => s.get(key), DRAFTS).catch(() => undefined);
export const clearDraft = (key: string) => run('readwrite', (s) => s.delete(key), DRAFTS).catch(() => undefined);

export function newDrop(): Drop {
  return {
    id: crypto.randomUUID(), slug: '', name: '', subtitle: '', date: new Date().toISOString().slice(0, 10),
    artist: '', items: [], tags: [], w: 200, h: 300, d: 60, finish: 'matte', openMode: 'top',
    inner: '#15090c', tissue: '#8c1d2f', artMode: 'dieline', art: {}, published: false, updatedAt: Date.now(),
  };
}

let seeding: Promise<void> | null = null;
function ensureSeed() {
  return (seeding ??= (async () => {
    const n = await run<number>('readonly', (s) => s.count());
    if (n > 0) return;
    const base = newDrop();
    const mk = async (o: Partial<Drop>, dark: boolean, seed: number): Promise<Drop> => {
      const d = { ...base, id: crypto.randomUUID(), ...o } as Drop;
      d.art = { dieline: await demoDieline(d.w, d.h, d.d, d.name, dark, seed) };
      d.published = true; return d;
    };
    const drops = [
      await mk({ name: 'Mutações', slug: 'mutacoes', date: '2026-10-10', w: 200, h: 300, d: 60, openMode: 'book', finish: 'satin', items: ['Camiseta oversized', 'Sticker pack', 'Cartão numerado'], tags: ['horror', 'anime', 'corpo'] }, true, 7),
      await mk({ name: 'Ensaio', slug: 'ensaio', date: '2026-06-21', w: 160, h: 240, d: 90, openMode: 'top', finish: 'matte', inner: '#101014', tissue: '#6b6b78', items: ['Moletom', 'Pin'], tags: ['insetos', 'ocultismo'] }, false, 21),
      await mk({ name: 'Circuito', slug: 'circuito', date: '2026-02-02', w: 220, h: 320, d: 40, openMode: 'book', finish: 'gloss', inner: '#0c0c0c', tissue: '#cfcfcf', items: ['Camiseta', 'Patch'], tags: ['cyber', 'gótico'] }, false, 99),
      await mk({ name: 'Relicário', slug: 'relicario', date: '2025-11-08', w: 180, h: 180, d: 70, openMode: 'top', finish: 'satin', items: ['Camiseta', 'Chaveiro'], tags: ['ocultismo'] }, true, 31),
      await mk({ name: 'Vigília', slug: 'vigilia', date: '2025-08-15', w: 240, h: 340, d: 50, openMode: 'book', finish: 'matte', items: ['Jaqueta'], tags: ['horror'] }, false, 63),
      await mk({ name: 'Cicatriz', slug: 'cicatriz', date: '2025-04-01', w: 150, h: 210, d: 55, openMode: 'top', finish: 'gloss', items: ['Boné', 'Pin'], tags: ['anime'] }, true, 77),
    ];
    for (const d of drops) await run('readwrite', (s) => s.put(d));
  })());
}
