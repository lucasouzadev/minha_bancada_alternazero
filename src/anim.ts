/** Mola amortecida: dá o "overshoot" suave da referência. */
export class Spring {
  v = 0; t: number;
  constructor(public x: number, public k = 120, public c = 15) { this.t = x; }
  step(dt: number) {
    const n = Math.ceil(dt / (1 / 120));
    const h = dt / n;
    for (let i = 0; i < n; i++) { this.v += (-this.k * (this.x - this.t) - this.c * this.v) * h; this.x += this.v * h; }
  }
  snap(v: number) { this.x = this.t = v; this.v = 0; }
  get done() { return Math.abs(this.x - this.t) < 0.002 * Math.max(1, Math.abs(this.t)) && Math.abs(this.v) < 0.02 * Math.max(1, Math.abs(this.t)); }
}
