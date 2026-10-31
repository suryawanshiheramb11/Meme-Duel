// Keyboard Warrior Stickman - animated notebook-paper standee (hero or enemy).
// Owns the fighter's physics (knockback, launch, landing) and paints its pose onto a
// canvas texture every frame, so limbs actually move and strikes actually connect.
import * as THREE from 'three';
import {
  CANVAS_SIZE,
  PX_PER_UNIT,
  GROUND_Y,
  POSES,
  ENEMY_VARIANTS,
  createPoseState,
  blendPose,
  drawStickman,
  createScratch,
  pxToWorld
} from './stickmanRig.js';

const PLANE_SIZE = CANVAS_SIZE / PX_PER_UNIT; // world units
const MESH_CENTER_Y = (GROUND_Y - CANVAS_SIZE / 2) / PX_PER_UNIT;
const GRAVITY = 30;
const FRICTION = 7;

// Seconds between redraws of a calm fighter, by quality level (0 low, 1 medium, 2 high)
const IDLE_REDRAW = [1 / 30, 1 / 45, 0];

const SNAP_POSES = new Set(['jab', 'jab2', 'punch', 'kick', 'launcher', 'slam', 'hurt', 'kame', 'windup']);
const SHOUT_POSES = new Set(['launcher', 'slam', 'kame', 'charge', 'charge2', 'punch', 'kick']);

const makeCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

export class PaperStandee {
  constructor(isHero = true, scene) {
    this.isHero = isHero;
    this.scene = scene;

    // Transform & physics
    this.x = isHero ? -1.2 : 1.4;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = isHero ? 1 : -1;
    this.isAirborne = false;
    this.hover = false; // hero floats alongside a juggled enemy
    this.walking = false;
    this.walkSpeed = 0;
    this.slideTarget = null; // lunges and dashes glide here, ignoring friction
    this.slideSpeed = 26;
    this.auraBoost = 0;
    this.onLand = null;

    // Vitals
    this.health = 100;
    this.maxHealth = 100;
    this.invulnTimer = 0;

    // Look
    this.form = 'base';
    this.variant = isHero ? 'cap' : 'glasses';
    this.bigHair = false;

    // Animation
    this.pose = 'guard';
    this.poseTimer = 0;
    this.lockTimer = 0; // blocks pose changes during scripted moves (beam, power-up)
    this.state = createPoseState('guard');
    this.time = Math.random() * 10;
    this.walkPhase = 0;
    this.flash = 0;
    this.strikeAlt = 0;
    this.anchors = null;
    this.guarding = false; // holding guard: blocks most damage, deals less
    this.guardTimer = 0; // brief shield flash after a block
    this.quality = 2; // set by the performance monitor
    this.drawAccum = 0;

    this.canvas = makeCanvas(CANVAS_SIZE, CANVAS_SIZE);
    this.scratch = createScratch(makeCanvas);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;

    this.group = new THREE.Group();
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      alphaTest: 0.04,
      side: THREE.DoubleSide
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE), this.material);
    this.mesh.position.y = MESH_CENTER_Y;
    this.group.add(this.mesh);

    // Soft contact shadow under the feet
    const sc = makeCanvas(128, 64);
    const sg = sc.getContext('2d');
    const grad = sg.createRadialGradient(64, 32, 0, 64, 32, 58);
    grad.addColorStop(0, 'rgba(0,0,0,0.7)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = grad;
    sg.fillRect(0, 0, 128, 64);
    this.shadowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 0.7),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false })
    );
    this.shadowMesh.rotation.x = -Math.PI / 2;
    this.shadowMesh.position.y = 0.02;
    this.scene.add(this.shadowMesh);

    this.scene.add(this.group);
    this.randomizeVariant();
    this.render(0);
    this.syncTransform();
  }

  // ----------------------------------------------------------- state changes
  randomizeVariant() {
    if (this.isHero) return;
    const pool = ENEMY_VARIANTS.filter((v) => v !== this.variant);
    this.variant = pool[Math.floor(Math.random() * pool.length)];
  }

  setPose(name, duration = 0.25, force = false) {
    if (!force && this.lockTimer > 0) return;
    if (!force && this.pose === 'knockdown' && this.health <= 0) return;
    if (!POSES[name]) name = name === 'idle' ? 'guard' : 'guard';
    this.pose = name;
    this.poseTimer = duration;
  }

  lock(seconds) {
    this.lockTimer = Math.max(this.lockTimer, seconds);
  }

  slideTo(x, speed = 26) {
    this.slideTarget = x;
    this.slideSpeed = speed;
  }

  // Cycle jab / jab2 / punch / kick so a typing streak reads as a flurry.
  attackPose(kind) {
    if (kind === 'kick' || kind === 'crit') return 'kick';
    if (kind === 'heavy') return 'punch';
    this.strikeAlt = (this.strikeAlt + 1) % 3;
    return this.strikeAlt === 2 ? 'punch' : this.strikeAlt === 1 ? 'jab2' : 'jab';
  }

  attack(kind = 'light') {
    const pose = this.attackPose(kind);
    this.setPose(this.isAirborne ? (pose === 'kick' ? 'kick' : pose) : pose, 0.2);
    return pose;
  }

  launchIntoAir(power = 11) {
    this.vy = power;
    this.isAirborne = true;
    this.setPose(this.isHero ? 'jump' : 'air', 1.2, true);
  }

  jump(power = 9) {
    this.vy = power;
    this.isAirborne = true;
    this.setPose('jump', 1.0, true);
  }

  groundSlam() {
    this.hover = false;
    this.vy = -28;
    this.isAirborne = true;
    this.setPose('slam', 0.6, true);
  }

  // knock = distance (world units) the fighter slides back
  takeHit(damage = 10, opts = {}) {
    const { launch = 0, knock = 0.3, stun = 0.26, quiet = false, stagger = true } = opts;
    if (this.invulnTimer > 0) return { hit: false, ko: false };
    this.health = Math.max(0, this.health - damage);
    this.flash = quiet ? 0.4 : 1;
    this.vx += -this.facing * knock * FRICTION;

    if (this.health <= 0) {
      this.ko(launch || 5);
      return { hit: true, ko: true };
    }
    if (launch) {
      this.launchIntoAir(launch);
    } else if (!this.isAirborne && stagger) {
      this.setPose('hurt', stun, true);
    }
    return { hit: true, ko: false };
  }

  ko(launch = 5) {
    this.health = 0;
    this.lockTimer = 0;
    this.hover = false;
    this.vy = launch;
    this.isAirborne = true;
    this.setPose('knockdown', 99, true);
  }

  revive() {
    this.health = this.maxHealth;
    this.lockTimer = 0;
    this.poseTimer = 0;
    this.vx = 0;
    this.vy = 0;
    this.y = 0;
    this.slideTarget = null;
    this.isAirborne = false;
    this.hover = false;
    this.pose = 'guard';
    this.flash = 0;
  }

  // ----------------------------------------------------------- per-frame
  update(delta) {
    this.time += delta;
    if (this.lockTimer > 0) this.lockTimer -= delta;
    if (this.invulnTimer > 0) this.invulnTimer -= delta;
    if (this.guardTimer > 0) this.guardTimer -= delta;
    this.flash = Math.max(0, this.flash - delta * 5);

    // Scripted glide (lunge / dash), then knockback slide with friction
    if (this.slideTarget !== null) {
      const d = this.slideTarget - this.x;
      const step = this.slideSpeed * delta;
      if (Math.abs(d) <= step) {
        this.x = this.slideTarget;
        this.slideTarget = null;
      } else {
        this.x += Math.sign(d) * step;
      }
    }
    this.x += this.vx * delta;
    this.vx *= Math.exp(-FRICTION * delta * (this.isAirborne ? 0.35 : 1));

    // Vertical: float, or gravity
    if (this.hover) {
      this.vy = 0;
    } else if (this.isAirborne) {
      this.y += this.vy * delta;
      const impact = -this.vy;
      this.vy -= GRAVITY * delta;
      // Only land while falling: during a hit-stop freeze (delta 0) a freshly launched
      // fighter still sits at y=0 and must not count as landed.
      if (this.y <= 0 && this.vy <= 0) {
        this.y = 0;
        this.vy = 0;
        this.isAirborne = false;
        const dead = this.health <= 0;
        if (dead) this.setPose('knockdown', 99, true);
        else if (this.pose === 'air' || this.pose === 'jump' || this.pose === 'slam') this.setPose('guard', 0, true);
        if (this.onLand) this.onLand(impact, dead);
      }
    }

    // Pose timer returns to guard
    if (this.poseTimer > 0) {
      this.poseTimer -= delta;
      if (this.poseTimer <= 0 && this.pose !== 'knockdown') this.pose = 'guard';
    }

    this.render(delta);
    this.syncTransform();
  }

  buildTarget() {
    let poseName = this.pose;
    if (this.isAirborne && (poseName === 'guard' || poseName === 'walk')) {
      poseName = this.isHero || this.hover ? 'jump' : 'air';
    }
    const target = { ...POSES[poseName] };
    const t = this.time;

    if (poseName === 'guard') {
      if (this.walking && !this.isAirborne) {
        const p = this.walkPhase;
        const f = Math.sin(p);
        const lift = Math.max(0, Math.cos(p));
        const lift2 = Math.max(0, -Math.cos(p));
        Object.assign(target, POSES.walk);
        target.fT = 8 + 38 * f;
        target.fS = target.fT - 8 - 40 * lift;
        target.gT = 8 - 38 * f;
        target.gS = target.gT - 8 - 40 * lift2;
        target.aU = 42 - 30 * f;
        target.bU = 22 + 30 * f;
      } else {
        const b = Math.sin(t * 5.2);
        target.lean += b * 2;
        target.fT += b * 2.5;
        target.gT -= b * 2;
        target.aF += b * 4;
      }
    }

    if (poseName === 'charge' || poseName === 'charge2') {
      target.lean += Math.sin(t * 70) * 1.4;
      target.aU += Math.sin(t * 55) * 3;
    }
    if (poseName === 'air') {
      target.rot = Math.max(-85, Math.min(55, -this.vy * 5));
    }
    if (poseName === 'jump' && !this.hover) {
      target.lean += Math.max(-20, Math.min(20, -this.vy * 1.5));
    }
    return target;
  }

  render(delta) {
    // A fighter in the middle of a strike, hit, flash or jump redraws every frame. A calm one
    // (guard / walking) can skip frames on slower devices; the skipped time is applied next draw.
    this.drawAccum += delta;
    const busy = this.pose !== 'guard' || this.flash > 0.01 || this.isAirborne || this.slideTarget !== null || this.guardTimer > 0;
    if (!busy && this.drawAccum < IDLE_REDRAW[this.quality]) return;
    const dt = this.drawAccum;
    this.drawAccum = 0;

    if (this.walking && !this.isAirborne) this.walkPhase += dt * (6 + Math.abs(this.walkSpeed) * 2.4);

    const target = this.buildTarget();
    const sharp = SNAP_POSES.has(this.pose) ? 56 : this.pose === 'knockdown' ? 24 : 20;
    blendPose(this.state, this.pose, Math.max(dt, 0.0001), sharp, target);

    let face = 'normal';
    if (this.pose === 'hurt') face = 'hurt';
    else if (this.pose === 'knockdown') face = 'ko';
    else if (SHOUT_POSES.has(this.pose)) face = 'shout';

    this.anchors = drawStickman(
      this.canvas,
      this.state,
      {
        isHero: this.isHero,
        variant: this.variant,
        form: this.isHero ? this.form : 'base',
        face,
        time: this.time,
        flash: this.flash,
        bigHair: this.bigHair,
        shield: this.guarding || this.guardTimer > 0,
        glow: this.quality >= 1
      },
      makeCanvas,
      this.scratch
    );
    this.texture.needsUpdate = true;
  }

  syncTransform() {
    this.group.position.set(this.x, 0, 0);
    this.mesh.position.y = MESH_CENTER_Y + this.y;
    this.mesh.scale.x = this.facing;

    const alt = Math.max(0, this.y);
    const s = Math.max(0.3, 1 - alt * 0.13);
    this.shadowMesh.position.x = this.x;
    this.shadowMesh.scale.set(s, s, s);
    this.shadowMesh.material.opacity = Math.max(0.15, 0.9 - alt * 0.14);
  }

  // Back-compat with the old billboard API
  updatePosition() {
    this.syncTransform();
  }

  // World-space point on the body (feet origin = fighter.x, ground). name: head|handF|handB|footF|footB|sh|hip
  anchor(name) {
    const p = this.anchors && this.anchors[name];
    if (!p) return { x: this.x, y: this.y + 1.1 };
    const [wx, wy] = pxToWorld(p[0], p[1], this.facing);
    return { x: this.x + wx, y: this.y + wy };
  }
}
