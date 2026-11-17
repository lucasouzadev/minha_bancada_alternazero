import { buildTextures } from './art';
import { buildBox } from './box';
import { snapshot } from './stage';
import type { Drop } from './types';

/** Imagem 1200×630 (JPEG leve) usada no preview do WhatsApp. */
export async function makeOg(drop: Drop): Promise<Blob> {
  const tex = await buildTextures(drop, 4, 1024);
  const box = buildBox({ ...drop, textures: tex });
  box.group.rotation.set(0.08, -0.35, 0);
  const url = snapshot(box.group, box.size, 900);
  box.dispose(); Object.values(tex).forEach((t) => t!.dispose());
  const img = new Image(); img.src = url; await img.decode();
  const c = document.createElement('canvas'); c.width = 1200; c.height = 630;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0d0d0f'; g.fillRect(0, 0, 1200, 630);
  const s = 600; g.drawImage(img, (1200 - s) / 2, 15, s, s);
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.82));
}
