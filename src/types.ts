export type Face = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';
export const FACES: Face[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];
export const FACE_LABEL: Record<Face, string> = {
  front: 'Frente', back: 'Verso', left: 'Lateral esquerda',
  right: 'Lateral direita', top: 'Topo', bottom: 'Fundo',
};
export type Finish = 'matte' | 'satin' | 'gloss';
export type OpenMode = 'top' | 'book';
export type ArtMode = 'dieline' | 'faces';
export type Status = 'available' | 'soldout' | 'soon';
export const STATUS_LABEL: Record<Status, string> = { available: 'Disponível', soldout: 'Esgotado', soon: 'Em breve' };
/** Só links http(s): o link da loja vem de campo digitado, nunca vira javascript:/data:. */
export function safeUrl(u?: string): string | null {
  if (!u) return null;
  try { const x = new URL(u.trim()); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch { return null; }
}

/** Cor #rgb/#rrggbb ou o padrão: nada de texto livre indo para atributos style. */
export const safeHex = (c: unknown, fb = '#111111') => typeof c === 'string' && /^#([0-9a-f]{3}){1,2}$/i.test(c.trim()) ? c.trim() : fb;

const str = (v: unknown, max: number, fb = '') => typeof v === 'string' ? v.slice(0, max) : fb;
const num = (v: unknown, lo: number, hi: number, fb: number) => typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fb;
const pick = <T extends string>(v: unknown, ok: readonly T[], fb: T): T => (ok as readonly unknown[]).includes(v) ? v as T : fb;
const list = (v: unknown, n: number, max: number) => Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, n).map((x: string) => x.slice(0, max)) : [];

/**
 * Valida um drop vindo de fora (banco/rede): tipos, limites e enums.
 * O banco só aceita escrita de admin (RLS), mas a leitura é pública: isso fecha a porta para dados
 * malformados quebrarem a página ou virarem injeção (cores em style, links em href).
 */
export function normalizeDrop(raw: any): Omit<Drop, 'art'> {
  const r = raw && typeof raw === 'object' ? raw : {};
  const date = str(r.date, 10);
  return {
    id: str(r.id, 64), slug: str(r.slug, 120).replace(/[^a-z0-9-]/gi, ''),
    name: str(r.name, 120, 'Sem nome'), subtitle: str(r.subtitle, 160),
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10),
    artist: str(r.artist, 120), items: list(r.items, 40, 120), tags: list(r.tags, 30, 40),
    tagline: str(r.tagline, 280), concept: str(r.concept, 4000),
    status: pick(r.status, ['available', 'soldout', 'soon'] as const, 'available'),
    storeUrl: safeUrl(str(r.storeUrl, 2000)) ?? '',
    w: num(r.w, 10, 2000, 200), h: num(r.h, 10, 2000, 300), d: num(r.d, 5, 2000, 60),
    finish: pick(r.finish, ['matte', 'satin', 'gloss'] as const, 'matte'),
    openMode: pick(r.openMode, ['top', 'book'] as const, 'top'),
    inner: safeHex(r.inner), tissue: safeHex(r.tissue, '#f2f2f2'),
    artMode: pick(r.artMode, ['dieline', 'faces'] as const, 'dieline'),
    published: !!r.published, updatedAt: num(r.updatedAt, 0, 8.64e15, 0),
  };
}

export interface Drop {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  date: string;       // YYYY-MM-DD
  artist: string;
  items: string[];    // o que vem na caixa
  tags: string[];
  tagline?: string;   // frase de destaque
  concept?: string;   // conceito / história do drop
  status?: Status;    // disponível · esgotado · em breve
  storeUrl?: string;  // página do drop na loja
  w: number; h: number; d: number; // mm: largura, altura, profundidade
  finish: Finish;
  openMode: OpenMode;
  inner: string;      // cor interna
  tissue: string;     // cor do papel de seda
  artMode: ArtMode;
  art: Partial<Record<'dieline' | Face, Blob>>;
  /** Só no acervo (servidor): `art` traz miniaturas; isto baixa a arte cheia quando a caixa é aberta. */
  fullArt?: () => Promise<Partial<Record<'dieline' | Face, Blob>>>;
  published: boolean;
  updatedAt: number;
}
