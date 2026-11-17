import type { Face } from './types';

/** Retângulos (em mm) de cada face dentro da faca em cruz. */
export function dielineRects(w: number, h: number, d: number) {
  const rects: Record<Face, { x: number; y: number; w: number; h: number }> = {
    top:    { x: d,         y: 0,     w, h: d },
    left:   { x: 0,         y: d,     w: d, h },
    front:  { x: d,         y: d,     w, h },
    right:  { x: d + w,     y: d,     w: d, h },
    back:   { x: 2 * d + w, y: d,     w, h },
    bottom: { x: d,         y: d + h, w, h: d },
  };
  return { rects, totalW: 2 * w + 2 * d, totalH: h + 2 * d };
}
