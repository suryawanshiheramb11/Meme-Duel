// Keyboard Warrior Stickman - visual effects: power-up auras, beam finisher, hit sparks,
// shockwaves, afterimages, ambient weather and floating combat text.
// Everything is additive-blended sprites/planes built from procedurally drawn textures,
// so there are no image dependencies and it all renders in a single WebGL pass.
import * as THREE from 'three';

const ADD = THREE.AdditiveBlending;
const TAU = Math.PI * 2;
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildTextures() {
  const T = {};
  T.glow = canvasTex(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  });
  T.spark = canvasTex(128, 128, (g) => {
    g.translate(64, 64);
    g.fillStyle = '#fff';
    const star = (len, w) => {
      g.beginPath();
      g.moveTo(0, -len);
      g.quadraticCurveTo(w, -w, len, 0);
      g.quadraticCurveTo(w, w, 0, len);
      g.quadraticCurveTo(-w, w, -len, 0);
      g.quadraticCurveTo(-w, -w, 0, -len);
      g.fill();
    };
    star(62, 5);
    g.rotate(Math.PI / 4);
    star(38, 4);
    g.rotate(-Math.PI / 4);
    const r = g.createRadialGradient(0, 0, 0, 0, 0, 26);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(-30, -30, 60, 60);
  });
  T.ring = canvasTex(256, 256, (g) => {
    const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    r.addColorStop(0, 'rgba(255,255,255,0)');
    r.addColorStop(0.62, 'rgba(255,255,255,0)');
    r.addColorStop(0.82, 'rgba(255,255,255,1)');
    r.addColorStop(0.93, 'rgba(255,255,255,0.35)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 256, 256);
  });
  T.flame = canvasTex(256, 512, (g, w, h) => {
    const layer = document.createElement('canvas');
    layer.width = w;
    layer.height = h;
    const lg = layer.getContext('2d');
    lg.globalCompositeOperation = 'lighter';
    let seed = 99;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // Tall tongues in the middle, short ones at the edges, each ending in a point.
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const bx = w / 2 + (t - 0.5) * w * 0.6 + (r() - 0.5) * 18;
      const bw = w * (0.07 + r() * 0.07);
      const reach = 1 - Math.abs(t - 0.5) * 1.5;
      const ty = h * (0.03 + (1 - reach * (0.55 + r() * 0.45)) * 0.55);
      const tx = bx + (r() - 0.5) * 56;
      const grad = lg.createLinearGradient(0, ty, 0, h);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.3, 'rgba(255,255,255,0.6)');
      grad.addColorStop(1, 'rgba(255,255,255,0.22)');
      lg.fillStyle = grad;
      lg.beginPath();
      lg.moveTo(bx - bw, h);
      lg.quadraticCurveTo(bx - bw * 1.5, h * 0.62, tx, ty);
      lg.quadraticCurveTo(bx + bw * 1.5, h * 0.55, bx + bw, h);
      lg.closePath();
      lg.fill();
    }
    g.filter = 'blur(2px)';
    g.drawImage(layer, 0, 0);
    g.filter = 'none';
    // soft horizontal falloff so the edges never end hard
    g.globalCompositeOperation = 'destination-in';
    const m = g.createLinearGradient(0, 0, w, 0);
    m.addColorStop(0, 'rgba(0,0,0,0)');
    m.addColorStop(0.3, 'rgba(0,0,0,1)');
    m.addColorStop(0.7, 'rgba(0,0,0,1)');
    m.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = m;
    g.fillRect(0, 0, w, h);
  });
  T.beam = canvasTex(512, 128, (g, w, h) => {
    const v = g.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, 'rgba(255,255,255,0)');
    v.addColorStop(0.3, 'rgba(255,255,255,0.45)');
    v.addColorStop(0.5, 'rgba(255,255,255,1)');
    v.addColorStop(0.7, 'rgba(255,255,255,0.45)');
    v.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-in';
    const hz = g.createLinearGradient(0, 0, w, 0);
    hz.addColorStop(0, 'rgba(0,0,0,0)');
    hz.addColorStop(0.06, 'rgba(0,0,0,1)');
    hz.addColorStop(0.9, 'rgba(0,0,0,1)');
    hz.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = hz;
    g.fillRect(0, 0, w, h);
  });
  T.streak = canvasTex(256, 32, (g, w, h) => {
    const hz = g.createLinearGradient(0, 0, w, 0);
    hz.addColorStop(0, 'rgba(255,255,255,0)');
    hz.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = hz;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-in';
    const v = g.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(0.5, 'rgba(0,0,0,1)');
    v.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
  });
  T.dust = canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,0.85)');
    r.addColorStop(0.6, 'rgba(255,255,255,0.35)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  });
  T.chip = canvasTex(32, 32, (g) => {
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(4, 26);
    g.lineTo(10, 4);
    g.lineTo(28, 12);
    g.lineTo(22, 28);
    g.closePath();
    g.fill();
  });
  T.crater = canvasTex(256, 128, (g) => {
    const r = g.createRadialGradient(128, 64, 0, 128, 64, 128);
    r.addColorStop(0, 'rgba(0,0,0,0.75)');
    r.addColorStop(0.55, 'rgba(0,0,0,0.45)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.save();
    g.translate(128, 64);
    g.scale(1, 0.5);
    g.translate(-128, -64 * 2);
    g.fillStyle = r;
    g.fillRect(0, 0, 256, 256);
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,0.8)';
    g.lineWidth = 2.5;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + rnd(-0.2, 0.2);
      let x = 128, y = 64;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += Math.cos(a) * rnd(10, 26) + rnd(-6, 6);
        y += Math.sin(a) * rnd(4, 12) + rnd(-3, 3);
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
  return T;
}

const AURA = {
  ssj:  { color: 0xffc02a, inner: 0xfff0a0, glow: 0xffe27a, lightning: null,      label: 'GOLDEN RAGE' },
  blue: { color: 0x2fb0ff, inner: 0xbdeeff, glow: 0x9be8ff, lightning: '#8fe6ff', label: 'BLUE SURGE' },
  ui:   { color: 0xc9d4ff, inner: 0xffffff, glow: 0xffffff, lightning: '#ffffff', label: 'SILVER INSTINCT' }
};
export const FORM_LABELS = { base: 'BASE', ssj: 'GOLDEN RAGE', blue: 'BLUE SURGE', ui: 'SILVER INSTINCT' };
export const FORM_COLORS = { base: '#8899aa', ssj: '#ffd23a', blue: '#4fc3ff', ui: '#e6ecff' };

// ------------------------------------------------------------------ particles
class ParticlePool {
  constructor(scene, max = 520) {
    this.scene = scene;
    this.max = max;
    this.live = [];
    this.free = [];
  }

  spawn(o) {
    if (this.live.length >= this.max) return null;
    let p = this.free.pop();
    if (!p) {
      const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false });
      p = { sprite: new THREE.Sprite(mat) };
      this.scene.add(p.sprite);
    }
    const s = p.sprite;
    s.visible = true;
    s.material.map = o.map;
    s.material.blending = o.add === false ? THREE.NormalBlending : ADD;
    s.material.color.set(o.color ?? 0xffffff);
    s.material.rotation = o.rot ?? 0;
    s.position.set(o.x, o.y, o.z ?? 0.25);
    Object.assign(p, {
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      gravity: o.gravity ?? 0,
      drag: o.drag ?? 0,
      spin: o.spin ?? 0,
      age: 0,
      life: o.life ?? 0.5,
      s0: o.size0 ?? 0.2,
      s1: o.size1 ?? 0,
      aspect: o.aspect ?? 1,
      alpha: o.alpha ?? 1,
      fadeIn: o.fadeIn ?? 0
    });
    this.live.push(p);
    return p;
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.sprite.visible = false;
        this.live.splice(i, 1);
        this.free.push(p);
        continue;
      }
      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp;
      p.vy = p.vy * damp - p.gravity * dt;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.material.rotation += p.spin * dt;
      const size = p.s0 + (p.s1 - p.s0) * t;
      p.sprite.scale.set(size * p.aspect, size, 1);
      const fi = p.fadeIn > 0 ? Math.min(1, p.age / p.fadeIn) : 1;
      p.sprite.material.opacity = p.alpha * (1 - t) * fi;
    }
  }
}

// ------------------------------------------------------------------ aura
class AuraRig {
  constructor(fx, fighter) {
    this.fx = fx;
    this.f = fighter;
    this.level = 0;
    this.t = Math.random() * 10;
    this.flipT = 0;
    this.emitT = 0;
    this.lightT = 0;
    this.group = new THREE.Group();
    fx.scene.add(this.group);

    this.layers = [[2.8, 4.3, 0.8], [2.15, 3.5, 0.7], [1.45, 2.7, 0.65]].map(([w, h, a], i) => {
      const m = new THREE.SpriteMaterial({ map: fx.T.flame, transparent: true, depthWrite: false, blending: ADD, opacity: 0 });
      const s = new THREE.Sprite(m);
      s.center.set(0.5, 0.06);
      s.position.z = -0.12 - i * 0.01;
      this.group.add(s);
      return { s, w, h, a, flip: 1, seed: i * 2.1 };
    });

    this.head = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx.T.glow, transparent: true, depthWrite: false, blending: ADD, opacity: 0 }));
    this.head.position.z = -0.05;
    this.group.add(this.head);

    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 1.2),
      new THREE.MeshBasicMaterial({ map: fx.T.glow, transparent: true, depthWrite: false, blending: ADD, opacity: 0 })
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = 0.03;
    this.group.add(this.floor);

    this.lc = document.createElement('canvas');
    this.lc.width = this.lc.height = 256;
    this.ltex = new THREE.CanvasTexture(this.lc);
    this.ltex.colorSpace = THREE.SRGBColorSpace;
    this.lmesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 3.2),
      new THREE.MeshBasicMaterial({ map: this.ltex, transparent: true, depthWrite: false, blending: ADD, opacity: 0 })
    );
    this.lmesh.position.set(0, 1.16, 0.08);
    this.group.add(this.lmesh);
  }

  drawLightning(color) {
    const g = this.lc.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const arcs = 3 + Math.floor(Math.random() * 3);
    for (let n = 0; n < arcs; n++) {
      const ang = rnd(0, TAU);
      let x = 128 + Math.cos(ang) * rnd(18, 46);
      let y = rnd(60, 190);
      const dirx = Math.cos(ang);
      const pts = [[x, y]];
      const segs = 5 + Math.floor(Math.random() * 4);
      for (let k = 0; k < segs; k++) {
        x += dirx * rnd(6, 20) + rnd(-12, 12);
        y += rnd(-22, 22);
        pts.push([x, y]);
      }
      [[7, 0.25], [3.5, 0.6], [1.6, 1]].forEach(([w, a], pass) => {
        g.strokeStyle = pass === 2 ? '#ffffff' : color;
        g.globalAlpha = a;
        g.shadowColor = color;
        g.shadowBlur = pass === 0 ? 18 : 6;
        g.lineWidth = w;
        g.beginPath();
        pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
        g.stroke();
      });
    }
    g.globalAlpha = 1;
    g.shadowBlur = 0;
    this.ltex.needsUpdate = true;
  }

  update(dt) {
    const f = this.f;
    const style = AURA[f.form];
    const boost = f.auraBoost || 0;
    const want = style ? 1 + boost : 0;
    this.level += (want - this.level) * Math.min(1, dt * 5);
    this.t += dt;
    if (this.level < 0.02) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    const st = style || AURA.ssj;
    const L = this.level;
    this.group.position.set(f.x, f.y, 0);

    this.flipT -= dt;
    const doFlip = this.flipT <= 0;
    if (doFlip) this.flipT = 0.07;
    const q = this.fx.quality;
    this.layers.forEach((l, i) => {
      l.s.visible = i < [1, 2, 3][q];
      if (!l.s.visible) return;
      if (doFlip && Math.random() < 0.5) l.flip *= -1;
      const sx = l.w * L * (1 + 0.06 * Math.sin(this.t * 17 + l.seed)) * l.flip;
      const sy = l.h * L * (1 + 0.1 * Math.sin(this.t * 13 + l.seed * 2));
      l.s.scale.set(sx, sy, 1);
      l.s.material.color.set(i === 2 ? st.inner : st.color);
      l.s.material.opacity = Math.min(1, l.a * Math.min(1, L)) * (0.78 + 0.22 * Math.sin(this.t * 23 + l.seed));
    });

    const head = f.anchor('head');
    this.head.position.set(head.x - f.x, head.y - f.y + 0.1, -0.05);
    this.head.scale.setScalar(1.5 * L * (1 + 0.1 * Math.sin(this.t * 19)));
    this.head.material.color.set(st.glow);
    this.head.material.opacity = 0.85;

    this.floor.scale.setScalar(L * (1 + 0.08 * Math.sin(this.t * 11)));
    this.floor.material.color.set(st.color);
    this.floor.material.opacity = 0.7 * Math.min(1, L);

    this.emitT += dt * 20 * L * [0.25, 0.7, 1][q];
    while (this.emitT >= 1) {
      this.emitT -= 1;
      this.fx.particles.spawn({
        map: this.fx.T.glow,
        x: f.x + rnd(-0.55, 0.55),
        y: f.y + rnd(0, 0.5),
        z: 0.1,
        vx: rnd(-0.4, 0.4),
        vy: rnd(1.8, 3.8),
        life: rnd(0.7, 1.3),
        size0: rnd(0.09, 0.2),
        size1: 0,
        color: st.glow
      });
    }

    if (st.lightning && q >= 2) {
      this.lightT -= dt;
      if (this.lightT <= 0) {
        this.lightT = 0.065;
        this.drawLightning(st.lightning);
      }
      this.lmesh.material.opacity = Math.min(1, 0.95 * L);
      this.lmesh.visible = true;
    } else {
      this.lmesh.visible = false;
    }
  }
}

// ------------------------------------------------------------------ manager
export class EffectsManager {
  constructor(scene, camera, container) {
    this.scene = scene;
    this.camera = camera;
    this.container = container;
    this.T = buildTextures();
    this.particles = new ParticlePool(scene);
    this.auras = new Map();
    this.timed = []; // rings, craters, afterimages: { update(dt) -> keepAlive }
    this.beams = [];
    this.ambient = { type: 'none', items: [] };
    this.ambientCenter = 0;
    this.afterimagePool = [];
    this.quality = 2; // 0 low, 1 medium, 2 high; set by the performance monitor
    this.shakeFn = () => {};

    this.fxLayer = document.createElement('div');
    this.fxLayer.id = 'fx-layer';
    this.flashEl = document.createElement('div');
    this.flashEl.id = 'fx-flash';
    this.vignetteEl = document.createElement('div');
    this.vignetteEl.id = 'form-vignette';
    container.append(this.vignetteEl, this.fxLayer, this.flashEl);
  }

  setQuality(level) {
    this.quality = level;
    this.particles.max = [140, 300, 520][level];
    this.applyAmbientDensity();
  }

  applyAmbientDensity() {
    const keep = [0, 0.5, 1][this.quality];
    const n = this.ambient.items.length;
    this.ambient.items.forEach((it, i) => {
      it.sprite.visible = i < Math.ceil(n * keep);
    });
  }

  attachAura(fighter) {
    this.auras.set(fighter, new AuraRig(this, fighter));
  }

  setShake(fn) {
    this.shakeFn = fn;
  }

  // ----------------------------------------------------------- DOM overlays
  flash(color = '#ffffff', alpha = 0.6, seconds = 0.35) {
    const el = this.flashEl;
    el.style.transition = 'none';
    el.style.background = color;
    el.style.opacity = String(alpha);
    void el.offsetWidth;
    el.style.transition = `opacity ${seconds}s ease-out`;
    el.style.opacity = '0';
  }

  setVignette(color, alpha) {
    this.vignetteEl.style.boxShadow = `inset 0 0 140px 30px ${color}`;
    this.vignetteEl.style.opacity = String(alpha);
  }

  floatText(text, wx, wy, { color = '#ffffff', size = 34, cls = '' } = {}) {
    const v = new THREE.Vector3(wx, wy, 0).project(this.camera);
    const el = document.createElement('div');
    el.className = `fx-text ${cls}`;
    el.textContent = text;
    el.style.left = `${(v.x * 0.5 + 0.5) * this.container.clientWidth}px`;
    el.style.top = `${(-v.y * 0.5 + 0.5) * this.container.clientHeight}px`;
    el.style.color = color;
    el.style.fontSize = `${size}px`;
    this.fxLayer.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  // ----------------------------------------------------------- one-shot effects
  hitSpark(x, y, { size = 1, color = 0xffffff, count = 7 } = {}) {
    this.particles.spawn({
      map: this.T.spark, x, y, z: 0.4, rot: rnd(0, TAU), spin: rnd(-6, 6),
      life: 0.2, size0: 0.25 * size, size1: 1.7 * size, color
    });
    this.particles.spawn({ map: this.T.glow, x, y, z: 0.38, life: 0.18, size0: 0.4 * size, size1: 1.3 * size, color, alpha: 0.9 });
    for (let i = 0; i < count; i++) {
      const a = rnd(0, TAU);
      const sp = rnd(2.5, 6.5) * size;
      this.particles.spawn({
        map: this.T.glow, x, y, z: 0.36, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 1.2,
        gravity: 8, drag: 2, life: rnd(0.25, 0.5), size0: rnd(0.08, 0.16), size1: 0, color
      });
    }
  }

  dust(x, count = 6, dir = 0) {
    for (let i = 0; i < count; i++) {
      this.particles.spawn({
        map: this.T.dust, add: false, x: x + rnd(-0.3, 0.3), y: rnd(0.02, 0.14), z: 0.3,
        vx: rnd(-1.4, 1.4) + dir * 1.4, vy: rnd(0.4, 1.4), drag: 3, life: rnd(0.35, 0.7),
        size0: rnd(0.2, 0.35), size1: rnd(0.55, 0.9), color: 0xd9c8aa, alpha: 0.5
      });
    }
  }

  speedLines(x, y, dir) {
    for (let i = 0; i < 7; i++) {
      this.particles.spawn({
        map: this.T.streak, x: x - dir * rnd(0.2, 1.0), y: y + rnd(-0.9, 0.9), z: 0.2,
        vx: -dir * rnd(7, 12), life: rnd(0.14, 0.26), size0: 0.1, size1: 0.1, aspect: rnd(10, 18),
        color: 0xffffff, alpha: 0.8, rot: dir < 0 ? Math.PI : 0
      });
    }
  }

  addTimed(obj) {
    this.timed.push(obj);
  }

  // Flat ring that sweeps outward across the floor
  shockwave(x, size = 4, color = 0xffffff, seconds = 0.5) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.T.ring, transparent: true, depthWrite: false, blending: ADD, color })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.04, 0);
    this.scene.add(m);
    let t = 0;
    this.addTimed({
      update: (dt) => {
        t += dt;
        const k = t / seconds;
        if (k >= 1) {
          this.scene.remove(m);
          m.geometry.dispose();
          m.material.dispose();
          return false;
        }
        const e = 1 - Math.pow(1 - k, 3);
        m.scale.set(size * e + 0.3, size * 0.55 * e + 0.2, 1);
        m.material.opacity = 1 - k;
        return true;
      }
    });
  }

  // Upright ring (billboard) for transformations
  ringBurst(x, y, size = 5, color = 0xffffff, seconds = 0.55) {
    this.particles.spawn({
      map: this.T.ring, x, y, z: 0.3, life: seconds, size0: 0.4, size1: size, color, alpha: 1
    });
  }

  crater(x, seconds = 4) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 1.5),
      new THREE.MeshBasicMaterial({ map: this.T.crater, transparent: true, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.015, 0);
    this.scene.add(m);
    let t = 0;
    this.addTimed({
      update: (dt) => {
        t += dt;
        if (t >= seconds) {
          this.scene.remove(m);
          m.geometry.dispose();
          m.material.dispose();
          return false;
        }
        m.material.opacity = Math.min(1, (seconds - t) / 1.2);
        return true;
      }
    });
  }

  debris(x, count = 12, power = 1) {
    for (let i = 0; i < count; i++) {
      this.particles.spawn({
        map: this.T.chip, add: false, x: x + rnd(-0.8, 0.8), y: rnd(0.05, 0.3), z: 0.32,
        vx: rnd(-2.5, 2.5) * power, vy: rnd(3, 8) * power, gravity: 22, spin: rnd(-9, 9), rot: rnd(0, TAU),
        life: rnd(0.55, 1.0), size0: rnd(0.1, 0.24), size1: 0.06, color: 0x3a2a22, alpha: 1
      });
    }
  }

  // ghost copy of a fighter's current frame
  afterimage(fighter, tint = '#9be8ff', life = 0.38) {
    if (this.quality < 1) return;
    let a = this.afterimagePool.pop();
    if (!a) {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, 3.2),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: ADD })
      );
      a = { c, tex, mesh };
      this.scene.add(mesh);
    }
    const g = a.c.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    g.globalCompositeOperation = 'source-over';
    g.drawImage(fighter.canvas, 0, 0, 256, 256);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = tint;
    g.globalAlpha = 0.75;
    g.fillRect(0, 0, 256, 256);
    g.globalAlpha = 1;
    a.tex.needsUpdate = true;
    a.mesh.visible = true;
    a.mesh.position.set(fighter.x, 1.1625 + fighter.y, -0.04);
    a.mesh.scale.x = fighter.facing;
    let t = 0;
    this.addTimed({
      update: (dt) => {
        t += dt;
        if (t >= life) {
          a.mesh.visible = false;
          this.afterimagePool.push(a);
          return false;
        }
        a.mesh.material.opacity = 0.6 * (1 - t / life);
        return true;
      }
    });
  }

  powerUpBurst(fighter, form) {
    const st = AURA[form] || AURA.ssj;
    const hex = st.color;
    this.shockwave(fighter.x, 7, hex, 0.7);
    this.shockwave(fighter.x, 4.5, 0xffffff, 0.5);
    this.ringBurst(fighter.x, fighter.y + 1.1, 7, hex, 0.6);
    this.debris(fighter.x, 18, 1.2);
    this.crater(fighter.x, 5);
    for (let i = 0; i < 26; i++) {
      this.particles.spawn({
        map: this.T.glow, x: fighter.x + rnd(-0.7, 0.7), y: fighter.y + rnd(0, 0.4), z: 0.35,
        vx: rnd(-1.5, 1.5), vy: rnd(3, 9), drag: 0.6, life: rnd(0.6, 1.3), size0: rnd(0.1, 0.28), size1: 0, color: st.glow
      });
    }
    this.flash('#' + hex.toString(16).padStart(6, '0'), 0.55, 0.5);
  }

  // ----------------------------------------------------------- beam finisher
  startBeam({ hero, enemy, form, onFire, charge = 0.55, fire = 0.62, fade = 0.25 }) {
    const st = AURA[form] || { color: 0x55c8ff, inner: 0xffffff, glow: 0xbfeaff };
    const mk = (map) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, blending: ADD })
      );
      m.visible = false;
      m.position.z = 0.2;
      this.scene.add(m);
      return m;
    };
    const mkSprite = (color) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.T.glow, transparent: true, depthWrite: false, blending: ADD, color }));
      s.position.z = 0.3;
      s.visible = false;
      this.scene.add(s);
      return s;
    };
    const b = {
      t: 0, charge, fire, fade, fired: false, hero, enemy, onFire,
      body: mk(this.T.beam), core: mk(this.T.beam),
      orb: mkSprite(st.glow), tip: mkSprite(st.inner), hit: mkSprite(st.glow),
      color: st.color, inner: st.inner, glowHex: st.glow
    };
    b.body.material.color.set(st.color);
    b.core.material.color.set(0xffffff);
    this.beams.push(b);
  }

  updateBeams(dt) {
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t += dt;
      const dir = b.hero.facing;
      const hf = b.hero.anchor('handF');
      const hb = b.hero.anchor('handB');
      const ox = (hf.x + hb.x) / 2;
      const oy = (hf.y + hb.y) / 2;

      if (b.t < b.charge) {
        const k = b.t / b.charge;
        b.orb.visible = true;
        b.orb.position.set(ox + dir * 0.05, oy, 0.35);
        b.orb.scale.setScalar((0.15 + 1.25 * k * k) * (1 + 0.1 * Math.sin(b.t * 60)));
        b.orb.material.opacity = 0.95;
        if (Math.random() < 0.9) {
          const a = rnd(0, TAU);
          const r = rnd(1.0, 1.7);
          this.particles.spawn({
            map: this.T.glow, x: ox + Math.cos(a) * r, y: oy + Math.sin(a) * r, z: 0.34,
            vx: -Math.cos(a) * r / 0.28, vy: -Math.sin(a) * r / 0.28, life: 0.28,
            size0: 0.14, size1: 0.02, color: b.glowHex
          });
        }
        this.shakeFn(0.012);
      } else if (!b.fired) {
        b.fired = true;
        if (b.onFire) b.onFire();
        this.flash('#' + b.color.toString(16).padStart(6, '0'), 0.45, 0.3);
        this.shakeFn(0.55);
        b.orb.visible = false;
      }

      const fireEnd = b.charge + b.fire;
      if (b.t >= b.charge && b.t < fireEnd + b.fade) {
        const grow = Math.min(1, (b.t - b.charge) / 0.07);
        const out = b.t > fireEnd ? 1 - (b.t - fireEnd) / b.fade : 1;
        const k = grow * out;
        const len = 18;
        const thick = 1.55 * k * (1 + 0.07 * Math.sin(b.t * 55));
        b.body.visible = b.core.visible = true;
        b.body.position.set(ox + dir * (len / 2), oy, 0.2);
        b.body.scale.set(len, thick, 1);
        b.core.position.set(ox + dir * (len / 2), oy, 0.22);
        b.core.scale.set(len, thick * 0.42, 1);
        b.tip.visible = true;
        b.tip.position.set(ox, oy, 0.34);
        b.tip.scale.setScalar(2.4 * k);
        b.tip.material.opacity = 0.9;
        const ex = Math.max(b.hero.x + 1, Math.min(b.enemy.x, b.hero.x + 9));
        b.hit.visible = true;
        b.hit.position.set(ex, oy, 0.34);
        b.hit.scale.setScalar(2.1 * k * (1 + 0.15 * Math.sin(b.t * 70)));
        b.hit.material.opacity = 0.85;
        if (out > 0.2) {
          const px = ox + dir * rnd(0.5, 9);
          this.particles.spawn({
            map: this.T.spark, x: px, y: oy + rnd(-0.5, 0.5), z: 0.4, rot: rnd(0, TAU),
            vx: rnd(-1, 1), vy: rnd(-1, 1), life: 0.22, size0: rnd(0.2, 0.5), size1: 0, color: b.inner
          });
        }
        this.shakeFn(0.03);
      }

      if (b.t >= fireEnd + b.fade) {
        [b.body, b.core].forEach((m) => {
          this.scene.remove(m);
          m.geometry.dispose();
          m.material.dispose();
        });
        [b.orb, b.tip, b.hit].forEach((s) => {
          this.scene.remove(s);
          s.material.dispose();
        });
        this.beams.splice(i, 1);
      }
    }
  }

  // ----------------------------------------------------------- ambient weather
  setAmbient(type) {
    this.ambient.items.forEach((s) => {
      this.scene.remove(s.sprite);
      s.sprite.material.dispose();
    });
    this.ambient = { type, items: [] };
    const cfg = {
      embers: { n: 60, map: this.T.glow, color: 0xff8a2a, add: true },
      petals: { n: 45, map: this.T.dust, color: 0xffb3cf, add: false },
      rain: { n: 110, map: this.T.streak, color: 0x9fd0ff, add: false },
      dust: { n: 40, map: this.T.dust, color: 0xe0c8a4, add: false },
      motes: { n: 50, map: this.T.glow, color: 0xfff2c8, add: true },
      stars: { n: 45, map: this.T.spark, color: 0xcfe0ff, add: true }
    }[type];
    if (!cfg) return;
    for (let i = 0; i < cfg.n; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: cfg.map, color: cfg.color, transparent: true, depthWrite: false,
          blending: cfg.add ? ADD : THREE.NormalBlending
        })
      );
      sprite.position.z = rnd(-2.5, 1.2);
      this.scene.add(sprite);
      this.ambient.items.push({ sprite, ox: rnd(-10, 10), y: rnd(0, 6), seed: rnd(0, 10), speed: rnd(0.5, 1.2) });
    }
    this.applyAmbientDensity();
  }

  updateAmbient(dt, camX) {
    const { type, items } = this.ambient;
    const t = performance.now() / 1000;
    for (const it of items) {
      const s = it.sprite;
      if (!s.visible) continue;
      s.position.x = camX + it.ox;
      switch (type) {
        case 'embers':
          it.y += dt * (0.5 + it.speed);
          it.ox += Math.sin(t * 2 + it.seed) * dt * 0.6;
          s.scale.setScalar(0.07 + 0.07 * it.speed);
          s.material.opacity = 0.45 + 0.45 * Math.sin(t * 6 + it.seed);
          break;
        case 'petals':
          it.y -= dt * (0.6 * it.speed);
          it.ox += (Math.sin(t * 1.4 + it.seed) * 0.8 + 0.5) * dt;
          s.scale.setScalar(0.1);
          s.material.opacity = 0.75;
          break;
        case 'rain':
          it.y -= dt * 15 * it.speed;
          it.ox -= dt * 2;
          s.scale.set(0.5, 0.025, 1);
          s.material.rotation = -1.35;
          s.material.opacity = 0.35;
          break;
        case 'dust':
          it.ox += dt * 0.9 * it.speed;
          it.y += Math.sin(t + it.seed) * dt * 0.2;
          s.scale.setScalar(0.5 + 0.3 * it.speed);
          s.material.opacity = 0.12;
          break;
        case 'motes':
          it.y += Math.sin(t * 0.8 + it.seed) * dt * 0.25;
          it.ox += Math.cos(t * 0.6 + it.seed) * dt * 0.25;
          s.scale.setScalar(0.09);
          s.material.opacity = 0.35 + 0.35 * Math.sin(t * 2 + it.seed);
          break;
        case 'stars':
          s.scale.setScalar(0.1 + 0.08 * Math.sin(t * 3 + it.seed));
          s.material.opacity = 0.5 + 0.4 * Math.sin(t * 2 + it.seed * 3);
          break;
        default:
      }
      if (it.y > 6.5) it.y = 0;
      if (it.y < -0.2) it.y = 6.2;
      if (it.ox > 11) it.ox = -11;
      if (it.ox < -11) it.ox = 11;
      s.position.y = it.y;
    }
  }

  // ----------------------------------------------------------- frame update
  update(dt, camX = 0) {
    this.particles.update(dt);
    this.auras.forEach((a) => a.update(dt));
    for (let i = this.timed.length - 1; i >= 0; i--) {
      if (!this.timed[i].update(dt)) this.timed.splice(i, 1);
    }
    this.updateBeams(dt);
    this.updateAmbient(dt, camX);
  }
}
