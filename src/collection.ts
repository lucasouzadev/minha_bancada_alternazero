const KEY = 'caixa3d.owned';
const MAX = 500;
export const getOwned = (): Set<string> => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, MAX) : []);
  } catch { return new Set(); }
};
export function toggleOwned(slug: string): boolean {
  const s = getOwned(); const has = s.has(slug);
  has ? s.delete(slug) : s.add(slug);
  // navegação privada / armazenamento cheio: a marcação vale só nesta visita, sem quebrar a página
  try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch { /* sem armazenamento */ }
  return !has;
}
export const collectionUrl = (owned: Iterable<string>) =>
  `${location.origin}/colecao?c=${encodeURIComponent([...owned].join(','))}`;
