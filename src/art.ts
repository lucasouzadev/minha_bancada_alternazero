import * as THREE from 'three';
import { dielineRects } from './layout';
import { FACES, type Drop, type Face } from './types';


async function toBitmap(b: Blob) { return createImageBitmap(b); }

function canvasTex(c: HTMLCanvasElement, aniso: number) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

/** Converte a arte do drop em texturas por face. */
export async function buildTextures(
  drop: Pick<Drop, 'artMode' | 'art' | 'w' | 'h' | 'd'>, aniso = 8, MAX_TEX = 2048,
): Promise<Partial<Record<Face, THREE.Texture>>> {
  const out: Partial<Record<Face, THREE.Texture>> = {};
  if (drop.artMode === 'dieline') {
    const blob = drop.art.dieline;
    if (!blob) return out;
    const bmp = await toBitmap(blob);
    const { rects, totalW, totalH } = dielineRects(drop.w, drop.h, drop.d);
    const sx = bmp.width / totalW, sy = bmp.height / totalH;
    for (const f of FACES) {
      const r = rects[f];
      const cw = Math.round(r.w * sx), ch = Math.round(r.h * sy);
      const k = Math.min(1, MAX_TEX / Math.max(cw, ch));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(cw * k)); c.height = Math.max(1, Math.round(ch * k));
      c.getContext('2d')!.drawImage(bmp, r.x * sx, r.y * sy, cw, ch, 0, 0, c.width, c.height);
      out[f] = canvasTex(c, aniso);
    }
    bmp.close();
  } else {
    for (const f of FACES) {
      const blob = drop.art[f];
      if (!blob) continue;
      const bmp = await toBitmap(blob);
      const k = Math.min(1, MAX_TEX / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
      out[f] = canvasTex(c, aniso);
      bmp.close();
    }
  }
  return out;
}

/** Reduz imagens enviadas (máx 4096px) e converte para webp. */
export const MAX_UPLOAD = 40 * 1024 * 1024;
export async function normalizeUpload(file: Blob): Promise<Blob> {
  // só imagens raster; SVG fica de fora (pode carregar script) e o arquivo original nunca é enviado
  if (file.size > MAX_UPLOAD || !/^image\/(png|jpe?g|webp|gif|avif|heic|heif|bmp)$/i.test(file.type || 'image/png')) throw new Error('formato');
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 4096 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((res, rej) => c.toBlob((b) => b && /^image\/(webp|png)$/.test(b.type) ? res(b) : rej(new Error('encode'))  /* Safari antigo devolve png */, 'image/webp', 0.92));
}

export async function imageSize(b: Blob) {
  const bmp = await createImageBitmap(b);
  const r = { w: bmp.width, h: bmp.height }; bmp.close(); return r;
}

/* ---------- Gabarito (guia da faca) ---------- */
export function templateCanvas(w: number, h: number, d: number): HTMLCanvasElement {
  const { rects, totalW, totalH } = dielineRects(w, h, d);
  const s = Math.min(6, 3600 / totalW);
  const c = document.createElement('canvas');
  c.width = Math.round(totalW * s); c.height = Math.round(totalH * s);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  const names: Record<Face, string> = { front: 'FRENTE', back: 'VERSO', left: 'LATERAL ESQ.', right: 'LATERAL DIR.', top: 'TOPO', bottom: 'FUNDO' };
  for (const f of FACES) {
    const r = rects[f];
    g.fillStyle = f === 'front' ? '#f1f1f1' : '#fafafa';
    g.fillRect(r.x * s, r.y * s, r.w * s, r.h * s);
    g.strokeStyle = '#e0245e'; g.lineWidth = 2; g.setLineDash([14, 8]);
    g.strokeRect(r.x * s, r.y * s, r.w * s, r.h * s);
    g.setLineDash([]);
    g.fillStyle = '#999'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const fs = Math.max(14, Math.min(r.w, r.h) * s * 0.12);
    g.font = `600 ${fs}px sans-serif`;
    g.fillText(names[f], (r.x + r.w / 2) * s, (r.y + r.h / 2) * s - fs * 0.6);
    g.font = `${fs * 0.7}px sans-serif`;
    g.fillText(`${r.w} × ${r.h} mm`, (r.x + r.w / 2) * s, (r.y + r.h / 2) * s + fs * 0.6);
  }
  return c;
}

/* ---------- Arte de exemplo (placeholder procedural) ---------- */
function rng(seed: number) { let a = seed >>> 0; return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296); }

export async function demoDieline(w: number, h: number, d: number, name: string, dark: boolean, seed: number): Promise<Blob> {
  const { rects, totalW, totalH } = dielineRects(w, h, d);
  const s = Math.min(3, 2600 / totalW);
  const c = document.createElement('canvas');
  c.width = Math.round(totalW * s); c.height = Math.round(totalH * s);
  const g = c.getContext('2d')!;
  const bg = dark ? '#0d0d10' : '#d9d7dc', ink = dark ? '#ecebe6' : '#111';
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  const R = rng(seed);
  for (const f of FACES) {
    const r = rects[f];
    g.save(); g.beginPath(); g.rect(r.x * s, r.y * s, r.w * s, r.h * s); g.clip();
    g.translate(r.x * s, r.y * s);
    const pw = r.w * s, ph = r.h * s;
    g.strokeStyle = ink; g.fillStyle = ink; g.globalAlpha = 0.9;
    // hachura
    g.lineWidth = 1;
    for (let i = 0; i < 70; i++) {
      const x = R() * pw, y = R() * ph, L = 20 + R() * 120, a = -0.6 + R() * 0.2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
    }
    // criaturas: corpo + patas
    const n = Math.max(3, Math.round((pw * ph) / 90000));
    for (let i = 0; i < n; i++) {
      const cx = R() * pw, cy = R() * ph, sz = 25 + R() * Math.min(pw, ph) * 0.22, rot = R() * 6.28;
      g.save(); g.translate(cx, cy); g.rotate(rot); g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(0, 0, sz * 0.5, sz * 0.28, 0, 0, 6.28); g.stroke();
      g.beginPath(); g.ellipse(sz * 0.55, 0, sz * 0.16, sz * 0.14, 0, 0, 6.28); g.fill();
      for (let k = -2; k <= 2; k++) {
        for (const sd of [-1, 1]) {
          g.beginPath(); g.moveTo(k * sz * 0.14, sd * sz * 0.26);
          g.quadraticCurveTo(k * sz * 0.2, sd * sz * 0.6, k * sz * 0.32, sd * sz * 0.7); g.stroke();
        }
      }
      g.restore();
    }
    // círculo ritual
    g.lineWidth = 2;
    const rr = Math.min(pw, ph) * 0.16, ox = pw * (0.3 + R() * 0.4), oy = ph * (0.25 + R() * 0.5);
    for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(ox, oy, rr * (1 - k * 0.22), 0, 6.28); g.stroke(); }
    g.restore();
    g.globalAlpha = 1;
  }
  // título na frente
  const fr = rects.front;
  g.fillStyle = dark ? '#0d0d10' : '#d9d7dc';
  const bh = fr.h * s * 0.14;
  g.fillRect(fr.x * s, (fr.y + fr.h * 0.5) * s - bh / 2, fr.w * s, bh);
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `italic 700 ${bh * 0.62}px Georgia, serif`;
  g.fillText(name.toUpperCase(), (fr.x + fr.w / 2) * s, (fr.y + fr.h * 0.5) * s, fr.w * s * 0.9);
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/webp', 0.9));
}
