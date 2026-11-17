import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** Camada WebGL em tela cheia onde 1 px de tela = 1/ppc cm no plano z=0. */
export class GL {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 1, 1000);
  D = 90; W = 1; H = 1; ppc = 1;
  onResize?: () => void;
  private ro: ResizeObserver;

  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pm.dispose();
    const key = new THREE.DirectionalLight(0xffffff, 0.95); key.position.set(2, 4, 6);
    const fill = new THREE.DirectionalLight(0xc9d2ff, 0.25); fill.position.set(-4, 1, 3);
    this.scene.add(key, fill);
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(canvas);
    this.resize();
  }
  resize() {
    const W = this.canvas.clientWidth || innerWidth, H = this.canvas.clientHeight || innerHeight;
    this.W = W; this.H = H;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(W, H, false);
    this.camera.aspect = W / H; this.camera.position.set(0, 0, this.D); this.camera.updateProjectionMatrix();
    this.ppc = (H / 2) / (this.D * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    this.onResize?.();
  }
  toWorld(px: number, py: number) { return { x: (px - this.W / 2) / this.ppc, y: -(py - this.H / 2) / this.ppc }; }
  render() { this.renderer.render(this.scene, this.camera); }
  dispose() { this.ro.disconnect(); this.renderer.dispose(); this.renderer.forceContextLoss(); }
}
