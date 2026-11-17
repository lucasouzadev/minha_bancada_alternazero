const KEY = 'caixa3d.owned';
export const getOwned = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); }
};
export function toggleOwned(slug: string): boolean {
  const s = getOwned(); const has = s.has(slug);
  has ? s.delete(slug) : s.add(slug);
  localStorage.setItem(KEY, JSON.stringify([...s])); return !has;
}
export const collectionUrl = (owned: Iterable<string>) =>
  `${location.origin}/colecao?c=${encodeURIComponent([...owned].join(','))}`;
