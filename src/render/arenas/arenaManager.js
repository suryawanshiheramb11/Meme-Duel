// Keyboard Warrior Stickman - arena backdrops, camera rig and screen shake.
//
// Layout contract (this is what keeps everything aligned):
//  * every backdrop image is 16:9 with its floor starting at HORIZON_FRAC of the image height
//  * the camera looks straight ahead (no pitch) and is placed so fighters' feet land at
//    FEET_FRAC of the screen height, i.e. comfortably inside the floor area
//  * the backdrop is "cover" fitted to the camera frustum, so image fractions equal screen fractions
import * as THREE from 'three';

export const HORIZON_FRAC = 0.62;
export const FEET_FRAC = 0.76;

export const ARENAS = {
  wasteland:  { name: 'Rocky Wasteland',  file: 'assets/arenas/wasteland.jpg', ambient: 'dust' },
  dojo:       { name: 'Sunset Dojo',      file: 'assets/arenas/dojo.jpg',      ambient: 'petals' },
  cyber:      { name: 'Neon Rooftop',     file: 'assets/arenas/cyber.jpg',     ambient: 'rain' },
  lava:       { name: 'Volcano Pit',      file: 'assets/arenas/lava.jpg',      ambient: 'embers' },
  space:      { name: 'Orbital Platform', file: 'assets/arenas/space.jpg',     ambient: 'stars' },
  meadow:     { name: 'Rolling Meadow',   file: 'assets/arenas/meadow.jpg',    ambient: 'motes' },
  desk:       { name: 'The Desk',         file: 'assets/arenas/desk.jpg',      ambient: 'motes' },
  crt:        { name: 'Retro CRT Grid',   file: 'assets/arenas/crt.jpg',       ambient: 'none' },
  sketchpad:  { name: 'Sketchpad',        file: 'assets/arenas/sketchpad.jpg', ambient: 'none' },
  greenscreen:{ name: 'Green Screen',     file: null,                          ambient: 'none', color: 0x00ff00 }
};

const TAN_HALF_FOV = Math.tan(THREE.MathUtils.degToRad(22.5));
const MIN_VISIBLE_WIDTH = 7.6; // world units that must always be on screen at the fighters' depth
const BG_Z = -6;

export class ArenaManager {
  constructor(canvasContainer) {
    this.container = canvasContainer;
    this.currentArenaKey = null;
    this.shakeIntensity = 0;
    this.shakeDecay = 5.0;
    this.zoomKick = 0;
    this.focusX = 0;
    this.camX = 0;
    this.camDist = 8.2;
    this.camY = 1.77;
    this.textureCache = new Map();
    this.onArenaChange = null;

    // Antialiasing is wasted work on high-DPI screens, where the pixel ratio already smooths edges
    this.renderer = new THREE.WebGLRenderer({
      antialias: (window.devicePixelRatio || 1) < 1.75,
      powerPreference: 'high-performance',
      alpha: false
    });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);

    this.textureLoader = new THREE.TextureLoader();
    this.bgMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, depthWrite: false });
    this.bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(16, 9), this.bgMat);
    this.bgMesh.position.z = BG_Z;
    this.bgMesh.renderOrder = -10;
    this.scene.add(this.bgMesh);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.switchArena('wasteland');
  }

  // Aspect-aware camera: wide screens keep the default distance, narrow ones pull back.
  layoutCamera() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.camDist = Math.max(8.2, MIN_VISIBLE_WIDTH / (2 * TAN_HALF_FOV * aspect));
    this.camY = (1 - 2 * FEET_FRAC) * -1 * TAN_HALF_FOV * this.camDist;
    this.aspect = aspect;
  }

  fitBackground() {
    const dist = this.camDist - BG_Z;
    const visH = 2 * dist * TAN_HALF_FOV;
    const visW = visH * this.aspect;
    const needW = visW + 1.6; // slack for camera pan + parallax
    const scale = Math.max(needW / 16, visH / 9);
    this.bgMesh.scale.set(scale, scale, 1);
    this.bgMesh.position.y = this.camY;
  }

  setPixelRatio(ratio) {
    if (Math.abs(ratio - this.pixelRatio) < 0.01) return;
    this.pixelRatio = ratio;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.layoutCamera();
    this.fitBackground();
  }

  worldHalfWidth() {
    return this.camDist * TAN_HALF_FOV * this.aspect;
  }

  switchArena(key) {
    const cfg = ARENAS[key] || ARENAS.wasteland;
    this.currentArenaKey = ARENAS[key] ? key : 'wasteland';
    if (cfg.file === null) {
      this.scene.background = new THREE.Color(cfg.color);
      this.bgMesh.visible = false;
    } else {
      this.scene.background = new THREE.Color(0x05070c);
      this.bgMesh.visible = true;
      this.loadTexture(cfg.file).then((tex) => {
        if (ARENAS[this.currentArenaKey].file !== cfg.file) return; // user switched again
        this.bgMat.map = tex;
        this.bgMat.needsUpdate = true;
      });
    }
    if (this.onArenaChange) this.onArenaChange(this.currentArenaKey, cfg);
  }

  loadTexture(file) {
    if (this.textureCache.has(file)) return this.textureCache.get(file);
    const p = new Promise((resolve, reject) => {
      this.textureLoader.load(
        file,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 4;
          resolve(tex);
        },
        undefined,
        reject
      );
    });
    this.textureCache.set(file, p);
    return p;
  }

  // Screen pixel position of a world point (used to float overlays above the fighters)
  worldToScreen(x, y, z = 0) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }

  triggerScreenShake(intensity = 0.3) {
    this.shakeIntensity = Math.min(1.2, this.shakeIntensity + intensity);
  }

  punchZoom(amount = 0.5) {
    this.zoomKick = Math.min(1.5, this.zoomKick + amount);
  }

  setFocus(x) {
    this.focusX = x;
  }

  update(delta) {
    // Ease toward the midpoint between fighters, clamped so the backdrop edge never shows.
    const target = THREE.MathUtils.clamp(this.focusX * 0.7, -3, 3);
    this.camX += (target - this.camX) * Math.min(1, delta * 4);

    this.zoomKick = Math.max(0, this.zoomKick - delta * 3.2);
    const dist = this.camDist - this.zoomKick * 0.6;

    let ox = 0, oy = 0, oz = 0;
    if (this.shakeIntensity > 0) {
      ox = (Math.random() - 0.5) * this.shakeIntensity * 0.4;
      oy = (Math.random() - 0.5) * this.shakeIntensity * 0.4;
      oz = (Math.random() - 0.5) * this.shakeIntensity * 0.2;
      this.shakeIntensity = Math.max(0, this.shakeIntensity - this.shakeDecay * delta);
    }
    const cx = this.camX + ox;
    const cy = this.camY + oy;
    this.camera.position.set(cx, cy, dist + oz);
    this.camera.lookAt(cx, cy, 0);

    this.bgMesh.position.x = this.camX * 0.85;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
