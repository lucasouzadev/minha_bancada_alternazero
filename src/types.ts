export type Face = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';
export const FACES: Face[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];
export const FACE_LABEL: Record<Face, string> = {
  front: 'Frente', back: 'Verso', left: 'Lateral esquerda',
  right: 'Lateral direita', top: 'Topo', bottom: 'Fundo',
};
export type Finish = 'matte' | 'satin' | 'gloss';
export type OpenMode = 'top' | 'book';
export type ArtMode = 'dieline' | 'faces';

export interface Drop {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  date: string;       // YYYY-MM-DD
  artist: string;
  items: string[];    // o que vem na caixa
  tags: string[];
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
