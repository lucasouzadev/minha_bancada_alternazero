import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export interface Stage {
  renderer: THREE.WebGLRenderer;
  setObject(obj: THREE.Object3D, size: THREE.Vector3, frameSize?: THREE.Vector3): void;
  onTick(fn: (dt: number) => void): void;
  controls: OrbitControls;
  dispose(): void;
}

function shadowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(0,0,0,.65)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function setupLights(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.7;
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(3, 5, 4);
  const rim = new THREE.DirectionalLight(0xbfc8ff, 0.5); rim.position.set(-5, 2, -4);
  scene.add(key, rim);
}

function frame(camera: THREE.PerspectiveCamera, size: THREE.Vector3, aspect: number) {
  const r = Math.max(size.x, size.y, size.z) * 0.5;
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const fitV = r / Math.sin(fov / 2);
  const fitH = r / Math.sin(Math.atan(Math.tan(fov / 2) * Math.min(1, aspect)));
  return Math.max(fitV, fitH) * 1.25;
}

export function createStage(host: HTMLElement, opts: { autoRotate?: boolean } = {}): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 500);
  setupLights(scene, renderer);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.enablePan = false;
  controls.autoRotate = !!opts.autoRotate; controls.autoRotateSpeed = 1.2;
  let idleTimer: number | undefined;
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(idleTimer); });
  controls.addEventListener('end', () => { if (opts.autoRotate) idleTimer = window.setTimeout(() => (controls.autoRotate = true), 3500); });

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; scene.add(shadow);

  let current: THREE.Object3D | null = null;
  let curSize = new THREE.Vector3(1, 1, 1);
  const ticks: ((dt: number) => void)[] = [];

  const resize = () => {
    if (!host.clientWidth || !host.clientHeight) return; // palco escondido (display:none): mantém o tamanho, volta pronto
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (current) fit();
    // setSize apaga o canvas; sem redesenhar aqui o próximo paint sai em branco (era o "pisca" a cada rolagem/teclado)
    controls.update(); renderer.render(scene, camera);
  };
  const fit = () => {
    const dist = frame(camera, curSize, camera.aspect);
    controls.minDistance = dist * 0.45; controls.maxDistance = dist * 2;
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(0.55, 0.3, 1);
    camera.position.copy(dir.normalize().multiplyScalar(dist)); controls.update();
  };
  const ro = new ResizeObserver(resize); ro.observe(host);

  const clock = new THREE.Clock(); let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const dt = clock.getDelta();
    ticks.forEach((f) => f(dt));
    controls.update(); renderer.render(scene, camera);
  };
  loop();

  return {
    renderer, controls,
    setObject(obj, size, frameSize) {
      if (current) scene.remove(current);
      current = obj; curSize = (frameSize ?? size).clone(); scene.add(obj);
      const m = Math.max(size.x, size.z);
      shadow.scale.set(m * 2.2, m * 2.2, 1); shadow.position.y = -size.y / 2 - 0.02;
      controls.target.set(0, 0, 0);
      camera.position.set(0.55, 0.3, 1); fit(); resize();
    },
    onTick(fn) { ticks.push(fn); },
    dispose() { cancelAnimationFrame(raf); ro.disconnect(); clearTimeout(idleTimer); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); },
  };
}

/* Miniaturas para a prateleira */
let snapR: THREE.WebGLRenderer | null = null;
let snapScene: THREE.Scene | null = null;
export function snapshot(obj: THREE.Object3D, size: THREE.Vector3, px = 480): string {
  if (!snapR) {
    snapR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    snapR.outputColorSpace = THREE.SRGBColorSpace;
    snapScene = new THREE.Scene(); setupLights(snapScene, snapR);
  }
  snapR.setSize(px, px, false);
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 500);
  const dist = frame(cam, size, 1) * 0.95;
  cam.position.set(0.55, 0.3, 1).normalize().multiplyScalar(dist); cam.lookAt(0, 0, 0);
  snapScene!.add(obj); snapR.render(snapScene!, cam); snapScene!.remove(obj);
  return snapR.domElement.toDataURL('image/png');
}
