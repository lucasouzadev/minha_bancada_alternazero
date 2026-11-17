import * as THREE from 'three';
import type { Face, Finish, OpenMode } from './types';

export interface BoxOpts {
  w: number; h: number; d: number; // mm
  finish: Finish; openMode: OpenMode;
  inner: string; tissue: string;
  textures: Partial<Record<Face, THREE.Texture>>;
}
export interface BuiltBox {
  group: THREE.Group;
  setOpen(v: number): void; // 0..1
  size: THREE.Vector3;      // cm
  frameSize: THREE.Vector3; // cm, inclui a tampa aberta
  dispose(): void;
}

const CM = 0.1; // mm -> cm

export function buildBox(o: BoxOpts): BuiltBox {
  const w = o.w * CM, h = o.h * CM, d = o.d * CM;
  const t = Math.max(0.05, Math.min(0.14, Math.min(w, h, d) * 0.03));

  const innerMat = new THREE.MeshStandardMaterial({ color: o.inner, roughness: 0.95 });
  const outer = (face: Face) => {
    const tex = o.textures[face];
    const m = o.finish === 'gloss'
      ? new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.06 })
      : new THREE.MeshStandardMaterial({ map: tex, roughness: o.finish === 'satin' ? 0.62 : 0.9 });
    if (!tex) m.color.set('#262626');
    return m;
  };
  // índices de BoxGeometry: +x,-x,+y,-y,+z,-z
  const panel = (sx: number, sy: number, sz: number, outerIdx: number, face: Face) => {
    const mats: THREE.Material[] = Array(6).fill(innerMat);
    mats[outerIdx] = outer(face);
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mats);
    return m;
  };

  const content = new THREE.Group();
  const body = new THREE.Group();
  content.add(body);

  const back = panel(w, h, t, 5, 'back');   back.position.z = -(d / 2 - t / 2);
  const left = panel(t, h, d - 2 * t, 1, 'left');   left.position.x = -(w / 2 - t / 2);
  const right = panel(t, h, d - 2 * t, 0, 'right'); right.position.x = (w / 2 - t / 2);
  const bottom = panel(w - 2 * t, t, d - 2 * t, 3, 'bottom'); bottom.position.y = -(h / 2 - t / 2);
  body.add(back, left, right, bottom);

  // papel de seda / conteúdo
  const tissueMat = new THREE.MeshStandardMaterial({ color: o.tissue, roughness: 1 });
  const cd = (d - 2 * t) * 0.62;
  const tissue = new THREE.Mesh(new THREE.BoxGeometry(w - 2 * t - 0.06, h - 2 * t - 0.06, cd), tissueMat);
  tissue.position.z = -(d / 2 - t) + cd / 2;
  body.add(tissue);

  const lid = new THREE.Group();
  let setOpen: (v: number) => void;

  if (o.openMode === 'book') {
    // capa = frente, dobradiça na lateral esquerda
    const front = panel(w, h, t, 4, 'front');
    front.position.set(w / 2, 0, 0);
    lid.position.set(-w / 2, 0, d / 2 - t / 2);
    lid.add(front);
    const top = panel(w - 2 * t, t, d - 2 * t, 2, 'top'); top.position.y = h / 2 - t / 2;
    body.add(top);
    setOpen = (v) => { lid.rotation.y = -v * 2.15; content.position.x = v * w * 0.36; };
  } else {
    // tampa = topo, dobradiça na aresta de trás
    const front = panel(w, h, t, 4, 'front'); front.position.z = d / 2 - t / 2;
    body.add(front);
    const top = panel(w - 2 * t, t, d - 2 * t, 2, 'top');
    top.position.set(0, 0, (d - 2 * t) / 2);
    lid.position.set(0, h / 2 - t / 2, -(d / 2 - t));
    lid.add(top);
    setOpen = (v) => { lid.rotation.x = -v * 1.95; };
  }
  content.add(lid);
  setOpen(0);
  const group = new THREE.Group();
  group.add(content);

  return {
    group, setOpen, size: new THREE.Vector3(w, h, d),
    frameSize: o.openMode === 'book' ? new THREE.Vector3(w * 1.9, h, d) : new THREE.Vector3(w, h + d * 1.05, d),
    dispose() {
      group.traverse((n) => {
        const m = n as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((mt) => mt.dispose());
      });
    },
  };
}
