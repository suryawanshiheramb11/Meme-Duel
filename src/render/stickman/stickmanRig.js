// Articulated stickman rig drawn onto a 2D canvas, die-cut from ruled notebook paper.
//
// All angles are degrees measured from "pointing straight down"; positive swings toward
// the way the fighter faces. The figure is always drawn facing right and flipped by the
// mesh, so poses never need mirroring. The lowest point of the body is pinned to
// GROUND_Y every frame, which keeps feet planted no matter which pose is active.

export const CANVAS_SIZE = 512;
export const GROUND_Y = 442;
export const PX_PER_UNIT = 160; // canvas pixels per world unit
const CX = CANVAS_SIZE / 2;
const PAD = 11; // paper margin around the ink (tight, like a figure cut out with scissors)

const L = { thigh: 62, shin: 62, torso: 76, neck: 6, head: 27, upper: 44, fore: 46 };

// Pose channels: lean/tilt (torso, head), aU/aF (front arm upper/fore), bU/bF (back arm),
// fT/fS (front leg thigh/shin), gT/gS (back leg), rot (whole body, clockwise)
export const POSES = {
  guard:    { lean: 6,  tilt: 0,   aU: 55,  aF: 175, bU: 25,  bF: 150, fT: 38,  fS: 12,  gT: -32, gS: -8,  rot: 0 },
  walk:     { lean: 10, tilt: 0,   aU: 40,  aF: 150, bU: 20,  bF: 140, fT: 30,  fS: 10,  gT: -25, gS: -10, rot: 0 },
  jab:      { lean: 14, tilt: 0,   aU: 90,  aF: 92,  bU: 25,  bF: 150, fT: 44,  fS: 14,  gT: -36, gS: -10, rot: 0 },
  jab2:     { lean: 14, tilt: 0,   aU: 55,  aF: 175, bU: 90,  bF: 92,  fT: 40,  fS: 12,  gT: -36, gS: -10, rot: 0 },
  punch:    { lean: 28, tilt: 4,   aU: 40,  aF: 140, bU: 92,  bF: 90,  fT: 62,  fS: 24,  gT: -52, gS: -26, rot: 0 },
  kick:     { lean: -14, tilt: 0,  aU: -30, aF: 60,  bU: 50,  bF: 170, fT: 92,  fS: 90,  gT: -4,  gS: -2,  rot: 0 },
  launcher: { lean: -6, tilt: -6,  aU: 150, aF: 168, bU: 20,  bF: 140, fT: 62,  fS: 10,  gT: -50, gS: -34, rot: 0 },
  slam:     { lean: 50, tilt: 8,   aU: 105, aF: 118, bU: 100, bF: 112, fT: 70,  fS: 22,  gT: -48, gS: -30, rot: 8 },
  windup:   { lean: -18, tilt: -4, aU: -50, aF: -20, bU: 30,  bF: 150, fT: 28,  fS: 6,   gT: -40, gS: -16, rot: 0 },
  hurt:     { lean: -26, tilt: -18, aU: -35, aF: -70, bU: -55, bF: -95, fT: 12,  fS: 34,  gT: -18, gS: 4,   rot: 0 },
  air:      { lean: -22, tilt: -10, aU: 150, aF: 170, bU: -150, bF: -170, fT: -38, fS: -72, gT: 52,  gS: 82,  rot: -35 },
  knockdown:{ lean: 0,  tilt: 0,   aU: -40, aF: -20, bU: -110, bF: -140, fT: 10, fS: 24,  gT: -14, gS: -4,  rot: -90 },
  dash:     { lean: 38, tilt: 4,   aU: -62, aF: -72, bU: -48, bF: -60, fT: 76,  fS: 48,  gT: -62, gS: -46, rot: 0 },
  charge:   { lean: 4,  tilt: -12, aU: 22,  aF: 24,  bU: -22, bF: -24, fT: 46,  fS: 26,  gT: -46, gS: -26, rot: 0 },
  charge2:  { lean: -8, tilt: 0,   aU: -40, aF: 40,  bU: -50, bF: 30,  fT: 40,  fS: 14,  gT: -40, gS: -12, rot: 0 },
  kame:     { lean: 16, tilt: 2,   aU: 90,  aF: 90,  bU: 92,  bF: 90,  fT: 52,  fS: 18,  gT: -50, gS: -22, rot: 0 },
  victory:  { lean: -4, tilt: 4,   aU: 160, aF: 175, bU: 30,  bF: 150, fT: 24,  fS: 4,   gT: -24, gS: -4,  rot: 0 },
  jump:     { lean: 6,  tilt: 0,   aU: 120, aF: 170, bU: -60, bF: -120, fT: 75,  fS: -15, gT: 30,  gS: -50, rot: 0 }
};

const CHANNELS = Object.keys(POSES.guard);

export function createPoseState(name = 'guard') {
  return { ...POSES[name] };
}

export function blendPose(state, targetName, dt, sharpness = 22, override = null) {
  const target = override || POSES[targetName] || POSES.guard;
  const k = 1 - Math.exp(-sharpness * dt);
  for (const ch of CHANNELS) state[ch] += (target[ch] - state[ch]) * k;
}

// ---------------------------------------------------------------- palette
export const FORM_STYLES = {
  base: null,
  ssj:  { fill: '#ffd23a', edge: '#a8741a', glow: 'rgba(255,210,60,0.95)',  eye: '#19c9a0' },
  blue: { fill: '#3fb8ff', edge: '#0a4aa8', glow: 'rgba(70,190,255,0.95)',  eye: '#7df3ff' },
  ui:   { fill: '#eef3ff', edge: '#7c8db8', glow: 'rgba(200,215,255,0.95)', eye: '#d9e2ff' }
};

export const ENEMY_VARIANTS = ['glasses', 'headband', 'mohawk', 'horns'];

// ---------------------------------------------------------------- geometry
const rad = (d) => (d * Math.PI) / 180;
const seg = (x, y, ang, len) => [x + Math.sin(rad(ang)) * len, y + Math.cos(rad(ang)) * len];

export function computeSkeleton(p) {
  const lean = rad(p.lean);
  const neck = [Math.sin(lean) * L.torso, -Math.cos(lean) * L.torso];
  const sh = [Math.sin(lean) * L.torso * 0.9, -Math.cos(lean) * L.torso * 0.9];
  const headAng = rad(p.lean + p.tilt);
  const headDist = L.neck + L.head;
  const head = [neck[0] + Math.sin(headAng) * headDist, neck[1] - Math.cos(headAng) * headDist];

  const elbowF = seg(sh[0], sh[1], p.aU, L.upper);
  const handF = seg(elbowF[0], elbowF[1], p.aF, L.fore);
  const elbowB = seg(sh[0], sh[1], p.bU, L.upper);
  const handB = seg(elbowB[0], elbowB[1], p.bF, L.fore);
  const kneeF = seg(0, 0, p.fT, L.thigh);
  const footF = seg(kneeF[0], kneeF[1], p.fS, L.shin);
  const kneeB = seg(0, 0, p.gT, L.thigh);
  const footB = seg(kneeB[0], kneeB[1], p.gS, L.shin);

  const pts = { hip: [0, 0], neck, sh, head, elbowF, handF, elbowB, handB, kneeF, footF, kneeB, footB };

  // Rotate about the hip, then pin the lowest point to the ground.
  const r = rad(p.rot || 0);
  const cos = Math.cos(r), sin = Math.sin(r);
  let maxY = -Infinity;
  for (const k of Object.keys(pts)) {
    const [x, y] = pts[k];
    pts[k] = [x * cos - y * sin, x * sin + y * cos];
    const reach = k === 'head' ? L.head + 3 : 4;
    maxY = Math.max(maxY, pts[k][1] + reach);
  }
  const dy = GROUND_Y - maxY;
  for (const k of Object.keys(pts)) pts[k] = [pts[k][0] + CX, pts[k][1] + dy];
  pts.headAngle = p.lean + p.tilt + (p.rot || 0);
  return pts;
}

// ---------------------------------------------------------------- paper textures
const paperTiles = new Map();
function getPaperTile(makeCanvas, k) {
  if (paperTiles.has(k)) return paperTiles.get(k);
  const c = makeCanvas(Math.round(CANVAS_SIZE * k), Math.round(CANVAS_SIZE * k));
  const g = c.getContext('2d');
  g.scale(k, k);
  g.fillStyle = '#ecedf1';
  g.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  // crumple: soft creases, kept subtle so the ink stays the sharpest thing on the figure
  let seed = 1337;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * CANVAS_SIZE, y = rnd() * CANVAS_SIZE;
    const a = rnd() * Math.PI, len = 30 + rnd() * 120;
    g.strokeStyle = rnd() < 0.5 ? 'rgba(120,125,140,0.12)' : 'rgba(255,255,255,0.4)';
    g.lineWidth = 1 + rnd() * 1.6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(110,115,130,${rnd() * 0.06})`;
    g.fillRect(rnd() * CANVAS_SIZE, rnd() * CANVAS_SIZE, 2 + rnd() * 3, 2 + rnd() * 3);
  }
  // ruled lines + margin
  g.strokeStyle = 'rgba(95,130,190,0.4)';
  g.lineWidth = 1.2;
  for (let y = 18; y < CANVAS_SIZE; y += 17) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(CANVAS_SIZE, y);
    g.stroke();
  }
  g.strokeStyle = 'rgba(230,90,110,0.34)';
  g.beginPath();
  g.moveTo(CX - 92, 0);
  g.lineTo(CX - 92, CANVAS_SIZE);
  g.stroke();
  paperTiles.set(k, c);
  return c;
}

// ---------------------------------------------------------------- drawing
function bodyPath(g, pts) {
  const line = (a, b) => {
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
  };
  g.beginPath();
  line(pts.hip, pts.neck);
  g.moveTo(pts.sh[0], pts.sh[1]);
  g.lineTo(pts.elbowB[0], pts.elbowB[1]);
  g.lineTo(pts.handB[0], pts.handB[1]);
  g.moveTo(pts.sh[0], pts.sh[1]);
  g.lineTo(pts.elbowF[0], pts.elbowF[1]);
  g.lineTo(pts.handF[0], pts.handF[1]);
  g.moveTo(pts.hip[0], pts.hip[1]);
  g.lineTo(pts.kneeB[0], pts.kneeB[1]);
  g.lineTo(pts.footB[0], pts.footB[1]);
  g.moveTo(pts.hip[0], pts.hip[1]);
  g.lineTo(pts.kneeF[0], pts.kneeF[1]);
  g.lineTo(pts.footF[0], pts.footF[1]);
}

// A scissor-cut outline: square limb ends, mitred corners and a faceted head, so the cut-out reads
// as sharp straight snips instead of a soft rounded blob.
function paperSilhouette(g, pts, extra) {
  g.lineCap = 'square';
  g.lineJoin = 'miter';
  g.miterLimit = 2.2;
  bodyPath(g, pts);
  g.lineWidth = 6 + 2 * (PAD + extra);
  g.stroke();
  // fatter torso so it reads as a cut-out figure, not a tracing
  g.beginPath();
  g.moveTo(pts.hip[0], pts.hip[1]);
  g.lineTo(pts.neck[0], pts.neck[1]);
  g.lineWidth = 58 + extra * 2;
  g.stroke();
  // head: an 11-sided snip around the circle
  const R = L.head + PAD + extra;
  const rot = rad(pts.headAngle) + 0.28;
  g.beginPath();
  for (let i = 0; i < 11; i++) {
    const a = rot + (i / 11) * Math.PI * 2;
    const rr = R * (i % 2 ? 1.04 : 0.97);
    const x = pts.head[0] + Math.cos(a) * rr;
    const y = pts.head[1] + Math.sin(a) * rr;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.closePath();
  g.fill();
}

function drawHair(g, style, time, big, glow) {
  // local coords: head centre at origin, up is -y, forward is +x
  const spikes = [
    [-76, 30], [-52, 46], [-28, 60], [-6, 74], [18, 66], [42, 52], [66, 36]
  ];
  g.save();
  if (glow) {
    g.shadowColor = style.glow;
    g.shadowBlur = big ? 34 : 24;
  }
  g.fillStyle = style.fill;
  g.strokeStyle = style.edge;
  g.lineWidth = 3;
  g.lineJoin = 'round';
  // hairline cap over the top of the head
  g.beginPath();
  g.arc(0, 0, L.head + 2, Math.PI * 1.08, Math.PI * 1.96);
  g.quadraticCurveTo(L.head * 0.6, -L.head * 0.35, 0, -L.head * 0.32);
  g.quadraticCurveTo(-L.head * 0.7, -L.head * 0.28, -L.head - 2, -L.head * 0.22);
  g.closePath();
  g.fill();
  g.stroke();
  spikes.forEach(([a, len], i) => {
    const sway = Math.sin(time * 9 + i * 1.7) * (big ? 5 : 3.5);
    const ang = rad(a + sway);
    const l = len * (big ? 1.1 : 1) + Math.sin(time * 13 + i) * 3;
    const bx = Math.sin(ang) * (L.head - 3);
    const by = -Math.cos(ang) * (L.head - 3);
    const spread = 0.22;
    const tx = Math.sin(ang + 0.1) * (L.head + l);
    const ty = -Math.cos(ang + 0.1) * (L.head + l);
    g.beginPath();
    g.moveTo(Math.sin(ang - spread) * (L.head - 2), -Math.cos(ang - spread) * (L.head - 2));
    g.lineTo(tx, ty);
    g.lineTo(Math.sin(ang + spread) * (L.head - 2), -Math.cos(ang + spread) * (L.head - 2));
    g.lineTo(bx, by);
    g.closePath();
    g.fill();
    g.stroke();
  });
  g.restore();
}

function drawFace(g, { isHero, variant, face, style, time, glow }) {
  g.lineCap = 'round';
  g.strokeStyle = '#0b0b0e';
  g.fillStyle = '#0b0b0e';
  g.lineWidth = 3.5;
  const ex = 9, ey = -3;
  if (face === 'ko') {
    [ex - 6, ex + 11].forEach((x) => {
      g.beginPath();
      g.moveTo(x - 4, ey - 4);
      g.lineTo(x + 4, ey + 4);
      g.moveTo(x + 4, ey - 4);
      g.lineTo(x - 4, ey + 4);
      g.stroke();
    });
  } else if (face === 'hurt') {
    g.beginPath();
    g.moveTo(ex - 10, ey - 4);
    g.lineTo(ex - 2, ey + 2);
    g.moveTo(ex + 6, ey + 2);
    g.lineTo(ex + 14, ey - 4);
    g.stroke();
  } else if (style) {
    [ex - 5, ex + 11].forEach((x) => {
      g.fillStyle = style.eye;
      if (glow) {
        g.shadowColor = style.eye;
        g.shadowBlur = 10;
      }
      g.beginPath();
      g.arc(x, ey, 4.6, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      g.stroke();
    });
    g.beginPath();
    g.moveTo(ex - 11, ey - 10);
    g.lineTo(ex - 1, ey - 5);
    g.moveTo(ex + 17, ey - 10);
    g.lineTo(ex + 7, ey - 5);
    g.stroke();
  } else {
    g.beginPath();
    g.arc(ex - 4, ey, 3.2, 0, Math.PI * 2);
    g.arc(ex + 10, ey, 3.2, 0, Math.PI * 2);
    g.fill();
  }
  // mouth
  g.lineWidth = 3;
  g.beginPath();
  if (face === 'shout') g.ellipse(ex + 3, 13, 6, 5, 0, 0, Math.PI * 2);
  else if (face === 'hurt' || face === 'ko') {
    g.moveTo(ex - 3, 15);
    g.quadraticCurveTo(ex + 3, 9, ex + 9, 15);
  } else {
    g.moveTo(ex - 3, 13);
    g.lineTo(ex + 9, 13);
  }
  g.stroke();

  if (!isHero) drawEnemyGear(g, variant, time);
}

function drawEnemyGear(g, variant, time) {
  g.strokeStyle = '#0b0b0e';
  g.fillStyle = '#0b0b0e';
  if (variant === 'glasses') {
    g.lineWidth = 3.5;
    g.fillStyle = 'rgba(255,255,255,0.65)';
    [[1, -9], [13, -9]].forEach(([x, y]) => {
      g.beginPath();
      g.rect(x, y, 11, 11);
      g.fill();
      g.stroke();
    });
    g.beginPath();
    g.moveTo(12, -4);
    g.lineTo(14, -4);
    g.stroke();
  } else if (variant === 'headband') {
    g.fillStyle = '#d6232a';
    g.fillRect(-L.head, -17, L.head * 2, 9);
    g.strokeRect(-L.head, -17, L.head * 2, 9);
    const wave = Math.sin(time * 10) * 5;
    g.beginPath();
    g.moveTo(-L.head, -13);
    g.quadraticCurveTo(-L.head - 22, -13 + wave, -L.head - 38, -4 + wave * 1.6);
    g.moveTo(-L.head, -11);
    g.quadraticCurveTo(-L.head - 20, -4 - wave, -L.head - 34, 8 - wave * 1.4);
    g.lineWidth = 5;
    g.strokeStyle = '#d6232a';
    g.stroke();
  } else if (variant === 'mohawk') {
    g.fillStyle = '#0b0b0e';
    for (let i = 0; i < 6; i++) {
      const a = rad(-44 + i * 18);
      const l = 20 + (i % 2) * 10;
      g.beginPath();
      g.moveTo(Math.sin(a - 0.13) * (L.head - 1), -Math.cos(a - 0.13) * (L.head - 1));
      g.lineTo(Math.sin(a) * (L.head + l), -Math.cos(a) * (L.head + l));
      g.lineTo(Math.sin(a + 0.13) * (L.head - 1), -Math.cos(a + 0.13) * (L.head - 1));
      g.closePath();
      g.fill();
    }
  } else if (variant === 'horns') {
    g.fillStyle = '#c0151f';
    g.lineWidth = 3;
    [-1, 1].forEach((s) => {
      g.beginPath();
      g.moveTo(s * 10, -L.head + 3);
      g.quadraticCurveTo(s * 26, -L.head - 6, s * 26, -L.head - 26);
      g.quadraticCurveTo(s * 14, -L.head - 8, s * 2, -L.head + 6);
      g.closePath();
      g.fill();
      g.stroke();
    });
  }
}

// ---- store accessories, drawn in the head's local frame (origin = head centre, up = -y, forward = +x)
function drawHeadGear(g, id, time) {
  const H = L.head;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = '#0b0b0e';
  g.lineWidth = 4;
  if (id === 'headband' || id === 'ninja') {
    const col = id === 'ninja' ? '#14141a' : '#d6232a';
    g.fillStyle = col;
    g.fillRect(-H, -17, H * 2, 9);
    g.strokeRect(-H, -17, H * 2, 9);
    const wave = Math.sin(time * 10) * 5;
    g.beginPath();
    g.moveTo(-H, -13);
    g.quadraticCurveTo(-H - 22, -13 + wave, -H - 38, -4 + wave * 1.6);
    g.moveTo(-H, -11);
    g.quadraticCurveTo(-H - 20, -4 - wave, -H - 34, 8 - wave * 1.4);
    g.lineWidth = 5;
    g.strokeStyle = id === 'ninja' ? '#14141a' : '#d6232a';
    g.stroke();
    if (id === 'ninja') {
      g.fillStyle = '#ecedf1';
      g.fillRect(6, -15, 9, 5);
    }
  } else if (id === 'crown') {
    g.fillStyle = '#ffd23a';
    g.beginPath();
    g.moveTo(-17, -H + 3);
    g.lineTo(-19, -H - 20);
    g.lineTo(-9, -H - 8);
    g.lineTo(0, -H - 24);
    g.lineTo(9, -H - 8);
    g.lineTo(19, -H - 20);
    g.lineTo(17, -H + 3);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#d6232a';
    g.beginPath();
    g.arc(0, -H - 3, 3.5, 0, Math.PI * 2);
    g.fill();
  } else if (id === 'tophat') {
    g.fillStyle = '#14141a';
    g.beginPath();
    g.ellipse(0, -H + 3, 31, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillRect(-17, -H - 33, 34, 36);
    g.strokeRect(-17, -H - 33, 34, 36);
    g.fillStyle = '#d6232a';
    g.fillRect(-17, -H - 8, 34, 8);
  } else if (id === 'party') {
    g.fillStyle = '#ffd23a';
    g.beginPath();
    g.moveTo(-15, -H + 4);
    g.lineTo(2, -H - 38);
    g.lineTo(17, -H + 2);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#d6232a';
    g.beginPath();
    g.moveTo(-8, -H - 10);
    g.lineTo(10, -H - 12);
    g.lineTo(13, -H - 2);
    g.lineTo(-11, -H);
    g.closePath();
    g.fill();
    g.fillStyle = '#ecedf1';
    g.beginPath();
    g.arc(2, -H - 40, 5, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  } else if (id === 'cowboy') {
    g.fillStyle = '#8a5a2b';
    g.beginPath();
    g.ellipse(0, -H + 4, 42, 8, -0.06, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(-17, -H + 3);
    g.lineTo(-13, -H - 18);
    g.quadraticCurveTo(0, -H - 12, 13, -H - 18);
    g.lineTo(17, -H + 3);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#14141a';
    g.fillRect(-16, -H - 4, 32, 5);
  } else if (id === 'halo') {
    g.strokeStyle = '#ffd23a';
    g.lineWidth = 6;
    const bob = Math.sin(time * 4) * 3;
    g.beginPath();
    g.ellipse(0, -H - 14 + bob, 21, 6, 0, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = '#0b0b0e';
    g.lineWidth = 1.5;
    g.beginPath();
    g.ellipse(0, -H - 14 + bob, 24, 8.5, 0, 0, Math.PI * 2);
    g.stroke();
  } else if (id === 'headphones') {
    g.strokeStyle = '#14141a';
    g.lineWidth = 7;
    g.beginPath();
    g.arc(-2, 0, H + 3, Math.PI * 1.02, Math.PI * 1.98);
    g.stroke();
    g.fillStyle = '#d6232a';
    g.strokeStyle = '#0b0b0e';
    g.lineWidth = 3.5;
    g.beginPath();
    g.ellipse(-4, 2, 9, 12, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
}

function drawFaceGear(g, id) {
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = '#0b0b0e';
  g.fillStyle = '#0b0b0e';
  g.lineWidth = 3.5;
  if (id === 'shades') {
    g.fillRect(-2, -11, 30, 13);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillRect(2, -9, 6, 3);
    g.fillRect(17, -9, 6, 3);
    g.fillStyle = '#0b0b0e';
    g.fillRect(-L.head, -9, L.head - 2, 4);
  } else if (id === 'nerd') {
    g.fillStyle = 'rgba(255,255,255,0.55)';
    [7, 21].forEach((x) => {
      g.beginPath();
      g.arc(x, -4, 7.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    });
    g.beginPath();
    g.moveTo(14.5, -4);
    g.lineTo(13.5, -4);
    g.moveTo(-0.5, -4);
    g.lineTo(-L.head, -8);
    g.stroke();
  } else if (id === 'monocle') {
    g.strokeStyle = '#d4a017';
    g.lineWidth = 3.5;
    g.beginPath();
    g.arc(21, -4, 9, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(21, 5);
    g.quadraticCurveTo(24, 22, 14, 40);
    g.stroke();
  } else if (id === 'eyepatch') {
    g.beginPath();
    g.arc(8, -4, 8.5, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(-L.head + 2, -18);
    g.moveTo(15, 0);
    g.lineTo(26, 6);
    g.stroke();
  } else if (id === 'mustache') {
    g.beginPath();
    g.moveTo(4, 9);
    g.quadraticCurveTo(10, 3, 16, 8);
    g.quadraticCurveTo(22, 3, 29, 10);
    g.quadraticCurveTo(22, 14, 16, 11);
    g.quadraticCurveTo(10, 15, 4, 9);
    g.closePath();
    g.fill();
  }
}

function drawCap(g, color) {
  g.fillStyle = color || '#ffffff';
  g.strokeStyle = '#0b0b0e';
  g.lineWidth = 4;
  g.beginPath();
  g.ellipse(0, -L.head + 6, 27, 13, -0.05, Math.PI, 0);
  g.quadraticCurveTo(14, -L.head + 10, -27, -L.head + 6);
  g.closePath();
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(10, -L.head + 6);
  g.quadraticCurveTo(30, -L.head + 4, 36, -L.head + 12);
  g.stroke();
}

/**
 * Paint one frame of a fighter. Returns anchor points (canvas px) for effects.
 * opts: { isHero, variant, form, face, time, flash, bigHair }
 */
export function drawStickman(canvas, poseState, opts, makeCanvas, scratch) {
  const g = canvas.getContext('2d');
  const pts = computeSkeleton(poseState);
  const style = FORM_STYLES[opts.form] || null;

  // Everything below is drawn in 512-unit coordinates; k maps them onto a (usually denser) canvas
  const k = canvas.width / CANVAS_SIZE;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.setTransform(k, 0, 0, k, 0, 0);

  // 1. paper silhouette on an offscreen layer so the texture only lands on the cut-out
  const sil = scratch.sil;
  const sg = sil.getContext('2d');
  sg.setTransform(1, 0, 0, 1, 0, 0);
  sg.clearRect(0, 0, sil.width, sil.height);
  sg.setTransform(k, 0, 0, k, 0, 0);
  sg.globalCompositeOperation = 'source-over';
  sg.strokeStyle = '#ecedf1';
  sg.fillStyle = '#ecedf1';
  paperSilhouette(sg, pts, 0);
  sg.globalCompositeOperation = 'source-atop';
  sg.drawImage(getPaperTile(makeCanvas, k), 0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // 2. cut edge: a crisp dark rim with a hard offset, so the paper has thickness without any blur
  g.save();
  g.translate(2.5, 3.5);
  g.strokeStyle = '#262932';
  g.fillStyle = '#262932';
  paperSilhouette(g, pts, 2);
  g.restore();
  g.drawImage(sil, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // 3. ink
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = '#08080b';
  g.lineWidth = 5.4;
  bodyPath(g, pts);
  g.stroke();
  // head
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(pts.head[0], pts.head[1], L.head, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 5;
  g.stroke();

  // fists
  g.fillStyle = '#0b0b0e';
  [pts.handF, pts.handB].forEach((h) => {
    g.beginPath();
    g.arc(h[0], h[1], 6.5, 0, Math.PI * 2);
    g.fill();
  });

  // 4. face, headgear and hair share the head's local frame
  g.save();
  g.translate(pts.head[0], pts.head[1]);
  g.rotate(rad(pts.headAngle));
  // hair sits behind the face so its glow never washes out the eyes
  const glow = opts.glow !== false;
  if (opts.isHero && style) drawHair(g, style, opts.time, opts.bigHair, glow);
  drawFace(g, { isHero: opts.isHero, variant: opts.variant, face: opts.face, style, time: opts.time, glow });
  const gear = opts.gear;
  if (opts.isHero && !style && !(gear && gear.head)) drawCap(g, opts.capColor);
  if (gear && gear.head) drawHeadGear(g, gear.head, opts.time);
  if (gear && gear.face) drawFaceGear(g, gear.face);
  g.restore();

  // guard shield: a glowing arc held out in front
  if (opts.shield) {
    g.save();
    g.beginPath();
    g.arc(pts.hip[0] + 4, pts.hip[1] - 92, 92, -0.95, 0.95);
    g.closePath();
    g.fillStyle = 'rgba(120, 200, 255, 0.16)';
    g.fill();
    g.lineWidth = 7;
    g.strokeStyle = 'rgba(140, 215, 255, 0.95)';
    g.lineCap = 'round';
    g.beginPath();
    g.arc(pts.hip[0] + 4, pts.hip[1] - 92, 92, -0.95, 0.95);
    g.stroke();
    g.restore();
  }

  // 5. hit flash
  if (opts.flash > 0.01) {
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = `rgba(255,255,255,${Math.min(0.9, opts.flash)})`;
    g.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    g.restore();
  }
  return pts;
}

export function createScratch(makeCanvas, scale = 1) {
  const px = Math.round(CANVAS_SIZE * scale);
  return { sil: makeCanvas(px, px) };
}

// canvas px (figure facing right) -> world offset from the fighter's feet origin
export function pxToWorld(px, py, facing) {
  return [((px - CX) / PX_PER_UNIT) * facing, (GROUND_Y - py) / PX_PER_UNIT];
}
