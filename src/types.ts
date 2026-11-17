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
  published: boolean;
  updatedAt: number;
}
