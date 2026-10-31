// Procedural arena background generator.
// Paints original 1920x1080 backdrops (no third-party art) into assets/arenas/.
// Every scene keeps its ground line at HORIZON so fighters always stand on the floor.
//
//   node scripts/generate_arenas.js           # all arenas
//   node scripts/generate_arenas.js dojo lava # just these
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');

const W = 1920;
const H = 1080;
const HORIZON = Math.round(H * 0.62); // y where the floor begins
const OUT = path.join(__dirname, '..', 'assets', 'arenas');

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- helpers
function vGrad(ctx, y0, y1, stops, x0 = 0, x1 = W) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
}

function glow(ctx, x, y, r, color, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace('A', alpha));
  g.addColorStop(1, color.replace('A', 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function cloud(ctx, x, y, w, h, rand, color = '255,255,255', alpha = 0.85) {
  const puffs = 9;
  for (let i = 0; i < puffs; i++) {
    const px = x + (rand() - 0.5) * w;
    const py = y + (rand() - 0.5) * h * 0.6;
    const r = (0.25 + rand() * 0.3) * h * 1.4;
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, `rgba(${color},${alpha})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(px - r, py - r, r * 2, r * 2);
  }
}

function ridge(ctx, baseY, amp, color, rand, { step = 24, rough = 0.5, tilt = 0, top = null } = {}) {
  const phase = [rand() * 9, rand() * 9, rand() * 9];
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W + step; x += step) {
    const n =
      Math.sin(x * 0.0021 + phase[0]) * 0.55 +
      Math.sin(x * 0.0067 + phase[1]) * 0.3 +
      Math.sin(x * 0.019 + phase[2]) * 0.15 * rough * 2 +
      (rand() - 0.5) * rough * 0.35;
    ctx.lineTo(x, baseY - n * amp + (x / W) * tilt);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  if (top) {
    vGrad(ctx, baseY - amp, H, top);
    ctx.fillStyle = ctx.fillStyle; // gradient already set by vGrad
  }
  ctx.fillStyle = color;
  ctx.fill();
}

function stars(ctx, n, rand, yMax) {
  for (let i = 0; i < n; i++) {
    const x = rand() * W;
    const y = rand() * yMax;
    const r = rand() < 0.04 ? 2.6 : rand() * 1.4 + 0.3;
    ctx.fillStyle = `rgba(255,255,255,${0.35 + rand() * 0.65})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (r > 2) glow(ctx, x, y, 14, 'rgba(180,210,255,A)', 0.5);
  }
}

function shadowEllipse(ctx, x, y, rx, ry, alpha = 0.45) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  ctx.translate(-x, -y);
  ctx.fillStyle = g;
  ctx.fillRect(x - rx, y - rx, rx * 2, rx * 2);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function grain(ctx, rand, amount = 7) {
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function vignette(ctx, strength = 0.55) {
  const g = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, H * 1.05);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// A soft band so the floor line reads as a depth change, not a hard cut.
function horizonHaze(ctx, color, height = 90) {
  vGrad(ctx, HORIZON - height, HORIZON + 20, [
    [0, `rgba(${color},0)`],
    [1, `rgba(${color},0.35)`]
  ]);
}

// ---------------------------------------------------------------- scenes
const scenes = {};

scenes.desk = (ctx, rand) => {
  // Blurred daylight window behind the desk
  vGrad(ctx, 0, HORIZON, [[0, '#9dc7b0'], [0.5, '#c9e4cf'], [1, '#e9f2dc']]);
  for (let i = 0; i < 26; i++) {
    glow(ctx, rand() * W, rand() * HORIZON, 90 + rand() * 170, 'rgba(255,255,235,A)', 0.35 + rand() * 0.4);
  }
  // Window frame uprights
  [380, 960, 1540].forEach((x) => {
    const g = ctx.createLinearGradient(x - 50, 0, x + 50, 0);
    g.addColorStop(0, '#2a1a12');
    g.addColorStop(0.5, '#4a3022');
    g.addColorStop(1, '#241610');
    ctx.fillStyle = g;
    ctx.fillRect(x - 46, 0, 92, HORIZON + 10);
  });
  ctx.fillStyle = '#2a1a12';
  ctx.fillRect(0, 150, W, 34);

  // Desk surface
  vGrad(ctx, HORIZON, H, [[0, '#7b563c'], [0.35, '#6a4630'], [1, '#4a2f20']]);
  for (let i = 0; i < 240; i++) {
    const y = HORIZON + Math.pow(rand(), 1.4) * (H - HORIZON);
    ctx.strokeStyle = `rgba(${rand() < 0.5 ? '35,20,12' : '150,105,70'},${0.06 + rand() * 0.14})`;
    ctx.lineWidth = 1 + rand() * 2.2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= W; x += 120) ctx.lineTo(x, y + Math.sin(x * 0.004 + i) * 5 * (y / H));
    ctx.stroke();
  }
  vGrad(ctx, HORIZON - 6, HORIZON + 14, [[0, 'rgba(0,0,0,0.0)'], [0.5, 'rgba(20,10,5,0.55)'], [1, 'rgba(0,0,0,0)']]);

  // Desk lamp (left)
  shadowEllipse(ctx, 330, HORIZON + 30, 150, 28, 0.5);
  ctx.fillStyle = '#17181c';
  ctx.beginPath();
  ctx.ellipse(330, HORIZON + 14, 96, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#17181c';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(330, HORIZON + 8);
  ctx.lineTo(300, 330);
  ctx.lineTo(430, 190);
  ctx.stroke();
  ctx.fillStyle = '#1d1f25';
  ctx.beginPath();
  ctx.moveTo(380, 170);
  ctx.quadraticCurveTo(470, 90, 610, 170);
  ctx.lineTo(560, 270);
  ctx.quadraticCurveTo(470, 250, 410, 250);
  ctx.closePath();
  ctx.fill();
  glow(ctx, 520, 280, 260, 'rgba(255,214,140,A)', 0.55);
  ctx.fillStyle = 'rgba(255,225,170,0.9)';
  ctx.beginPath();
  ctx.ellipse(500, 260, 74, 14, 0.1, 0, Math.PI * 2);
  ctx.fill();

  // Books (left-mid)
  const books = [['#8a2b2b', 270, 44], ['#2b5b8a', 250, 40], ['#c89b32', 285, 36]];
  let by = HORIZON + 4;
  shadowEllipse(ctx, 760, HORIZON + 20, 170, 26, 0.4);
  books.forEach(([c, w, h]) => {
    by -= h;
    ctx.fillStyle = c;
    roundRect(ctx, 760 - w / 2, by, w, h, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(760 - w / 2 + 12, by + 8, w - 24, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(760 - w / 2, by + h - 8, w, 8);
  });

  // Pencil cup (right)
  shadowEllipse(ctx, 1560, HORIZON + 36, 130, 22, 0.5);
  const cx = 1560;
  ['#e8a43a', '#3a7bd5', '#c93a3a', '#3a3a3a', '#58b368'].forEach((c, i) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = 12;
    ctx.lineCap = 'butt';
    const a = -0.5 + i * 0.28;
    ctx.beginPath();
    ctx.moveTo(cx + (i - 2) * 14, 520);
    ctx.lineTo(cx + (i - 2) * 14 + Math.sin(a) * 190, 520 - Math.cos(a) * 190);
    ctx.stroke();
  });
  const mg = ctx.createLinearGradient(cx - 80, 0, cx + 80, 0);
  mg.addColorStop(0, '#5aa7b8');
  mg.addColorStop(0.45, '#8fd0dc');
  mg.addColorStop(1, '#3f8797');
  ctx.fillStyle = mg;
  roundRect(ctx, cx - 82, 500, 164, HORIZON + 30 - 500, 12);
  ctx.fill();
  ctx.fillStyle = '#b9ecf5';
  ctx.beginPath();
  ctx.ellipse(cx, 500, 82, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2d6672';
  ctx.beginPath();
  ctx.ellipse(cx, 502, 66, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eraser + sticky note on the desk top
  ctx.fillStyle = '#2d4f8a';
  roundRect(ctx, 1120, H - 96, 120, 52, 8);
  ctx.fill();
  ctx.fillStyle = '#e9e9ef';
  ctx.fillRect(1120, H - 86, 120, 20);
  ctx.save();
  ctx.translate(180, H - 130);
  ctx.rotate(-0.12);
  ctx.fillStyle = '#ffe66b';
  ctx.fillRect(0, 0, 150, 130);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  for (let i = 0; i < 4; i++) ctx.fillRect(16, 26 + i * 24, 90 - i * 10, 5);
  ctx.restore();
  horizonHaze(ctx, '240,230,200', 50);
};

scenes.crt = (ctx, rand) => {
  vGrad(ctx, 0, H, [[0, '#04080d'], [1, '#09121a']]);
  // Monitor bezel
  const bx = 240, by = 70, bw = W - 480, bh = HORIZON - 40;
  const bez = ctx.createLinearGradient(0, by, 0, by + bh);
  bez.addColorStop(0, '#cfc7b3');
  bez.addColorStop(1, '#a89f8a');
  ctx.fillStyle = bez;
  roundRect(ctx, bx, by, bw, bh, 46);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRect(ctx, bx + 26, by + 26, bw - 52, bh - 52, 36);
  ctx.fill();
  // Screen
  const sx = bx + 54, sy = by + 54, sw = bw - 108, sh = bh - 108;
  ctx.save();
  roundRect(ctx, sx, sy, sw, sh, 60);
  ctx.clip();
  vGrad(ctx, sy, sy + sh, [[0, '#06210f'], [1, '#0b3a1c']], sx, sx + sw);
  glow(ctx, W / 2, sy + sh * 0.5, sw * 0.55, 'rgba(60,255,120,A)', 0.28);
  ctx.font = '26px "Courier New", Menlo, monospace';
  for (let row = 0; row < 18; row++) {
    const y = sy + 48 + row * 38;
    let line = '';
    const len = 14 + Math.floor(rand() * 60);
    for (let c = 0; c < len; c++) line += '01$#<>/{}=;'[Math.floor(rand() * 11)];
    ctx.fillStyle = `rgba(110,255,150,${0.25 + rand() * 0.5})`;
    ctx.fillText(line, sx + 40, y);
  }
  ctx.fillStyle = 'rgba(120,255,160,0.9)';
  ctx.fillText('C:\\KEYBOARD_WARRIOR> _', sx + 40, sy + sh - 40);
  for (let y = sy; y < sy + sh; y += 4) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(sx, y, sw, 2);
  }
  ctx.restore();
  // Floor: neon grid in perspective
  vGrad(ctx, HORIZON, H, [[0, '#1a0f33'], [1, '#07050f']]);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, HORIZON, W, H - HORIZON);
  ctx.clip();
  ctx.lineWidth = 2;
  for (let i = -30; i <= 30; i++) {
    ctx.strokeStyle = 'rgba(0,240,255,0.5)';
    ctx.beginPath();
    ctx.moveTo(W / 2 + i * 40, HORIZON);
    ctx.lineTo(W / 2 + i * 190, H);
    ctx.stroke();
  }
  for (let j = 0; j < 14; j++) {
    const t = j / 14;
    const y = HORIZON + Math.pow(t, 1.9) * (H - HORIZON);
    ctx.strokeStyle = `rgba(255,60,200,${0.25 + t * 0.5})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();
  glow(ctx, W / 2, HORIZON, 700, 'rgba(90,255,150,A)', 0.2);
  horizonHaze(ctx, '60,255,150', 60);
};

scenes.meadow = (ctx, rand) => {
  vGrad(ctx, 0, HORIZON + 40, [[0, '#2f7fe0'], [0.55, '#78b9f5'], [1, '#d8efff']]);
  glow(ctx, 330, 170, 420, 'rgba(255,250,210,A)', 0.8);
  for (let i = 0; i < 9; i++) {
    cloud(ctx, rand() * W, 80 + rand() * 340, 360 + rand() * 280, 90 + rand() * 60, rand);
  }
  ridge(ctx, HORIZON - 120, 130, '#5d9e49', rand, { rough: 0.2 });
  ridge(ctx, HORIZON - 40, 100, '#49903a', rand, { rough: 0.25, tilt: -30 });
  ridge(ctx, HORIZON + 10, 70, '#3b8230', rand, { rough: 0.3 });
  vGrad(ctx, HORIZON, H, [[0, '#3d8a2d'], [0.4, '#2f7623'], [1, '#1f5a18']]);
  // grass blades + flowers
  for (let i = 0; i < 2600; i++) {
    const x = rand() * W;
    const y = HORIZON + Math.pow(rand(), 0.8) * (H - HORIZON);
    const hgt = 6 + (y - HORIZON) * 0.06 + rand() * 12;
    ctx.strokeStyle = `rgba(${40 + rand() * 60},${120 + rand() * 80},${30 + rand() * 40},0.6)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 6, y - hgt);
    ctx.stroke();
  }
  const petals = ['#ffffff', '#ffe14d', '#ff7aa8', '#b48cff'];
  for (let i = 0; i < 160; i++) {
    const x = rand() * W;
    const y = HORIZON + 30 + rand() * (H - HORIZON - 30);
    ctx.fillStyle = petals[Math.floor(rand() * petals.length)];
    ctx.beginPath();
    ctx.arc(x, y, 2.5 + (y - HORIZON) * 0.012, 0, Math.PI * 2);
    ctx.fill();
  }
  horizonHaze(ctx, '220,245,255', 70);
};

scenes.sketchpad = (ctx, rand) => {
  ctx.fillStyle = '#c0c0c8';
  ctx.fillRect(0, 0, W, H);
  // Title bar
  const tb = ctx.createLinearGradient(0, 0, W, 0);
  tb.addColorStop(0, '#0a246a');
  tb.addColorStop(1, '#3a6ea5');
  ctx.fillStyle = tb;
  ctx.fillRect(0, 0, W, 54);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText('untitled - Sketchpad', 24, 37);
  ['_', '□', 'x'].forEach((g, i) => {
    ctx.fillStyle = '#c0c0c8';
    ctx.fillRect(W - 150 + i * 48, 10, 40, 34);
    ctx.fillStyle = '#111';
    ctx.fillText(g, W - 140 + i * 48, 36);
  });
  ctx.fillStyle = '#d8d8de';
  ctx.fillRect(0, 54, W, 40);
  ctx.fillStyle = '#111';
  ctx.font = '24px sans-serif';
  ['File', 'Edit', 'View', 'Image', 'Colors', 'Help'].forEach((m, i) => ctx.fillText(m, 24 + i * 110, 83));
  // Toolbox
  ctx.fillStyle = '#c0c0c8';
  ctx.fillRect(0, 94, 130, H - 94);
  for (let i = 0; i < 16; i++) {
    const x = 14 + (i % 2) * 54;
    const y = 112 + Math.floor(i / 2) * 58;
    ctx.fillStyle = '#e8e8ee';
    ctx.fillRect(x, y, 48, 48);
    ctx.strokeStyle = '#7a7a82';
    ctx.strokeRect(x, y, 48, 48);
    ctx.fillStyle = '#333';
    ctx.fillRect(x + 12, y + 12, 24, 4 + (i % 3) * 6);
  }
  // Canvas
  const cx0 = 140, cy0 = 102, cw = W - 160, ch = H - 102 - 130;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx0, cy0, cw, ch);
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 3;
  ctx.strokeRect(cx0, cy0, cw, ch);
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx0, cy0, cw, ch);
  ctx.clip();
  // Crayon doodles
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const doodle = (color, pts, w = 8) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  };
  ctx.fillStyle = '#ffd400';
  ctx.beginPath();
  ctx.arc(1620, 260, 90, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    doodle('#ffb800', [[1620 + Math.cos(a) * 112, 260 + Math.sin(a) * 112], [1620 + Math.cos(a) * 170, 260 + Math.sin(a) * 170]], 7);
  }
  doodle('#2b8be0', [[300, 330], [340, 290], [400, 300], [440, 270], [500, 300], [540, 330], [300, 330]], 9);
  doodle('#2b8be0', [[760, 220], [800, 180], [870, 190], [920, 160], [980, 200], [1010, 230], [760, 220]], 9);
  doodle('#c0392b', [[1000, 470], [1000, 380], [1100, 320], [1200, 380], [1200, 470], [1000, 470]], 8);
  doodle('#8e44ad', [[1060, 470], [1060, 420], [1110, 420], [1110, 470]], 6);
  for (let i = 0; i < 9; i++) {
    const x = 220 + i * 190 + rand() * 40;
    doodle('#27ae60', [[x, HORIZON + 6], [x + 10, HORIZON - 30], [x + 20, HORIZON + 6], [x + 34, HORIZON - 40], [x + 46, HORIZON + 6]], 6);
  }
  doodle('#1a1a1a', [[cx0, HORIZON + 4], [cx0 + 400, HORIZON - 4], [cx0 + 900, HORIZON + 6], [cx0 + 1400, HORIZON - 2], [W - 20, HORIZON + 4]], 7);
  for (let i = 0; i < 14; i++) {
    const y = HORIZON + 40 + i * 24;
    doodle(i % 2 ? '#6c8a3a' : '#7fa044', [[cx0 + 20, y], [cx0 + 80 + rand() * 1500, y + rand() * 12 - 6]], 5);
  }
  ctx.restore();
  // Palette strip + status bar
  ctx.fillStyle = '#c0c0c8';
  ctx.fillRect(0, H - 128, W, 128);
  const swatches = ['#000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080', '#fff', '#c0c0c0', '#f00', '#ff0', '#0f0', '#0ff', '#00f', '#f0f', '#ff8040', '#804000', '#ff80c0', '#80ffff'];
  swatches.forEach((c, i) => {
    const x = 150 + (i % 10) * 54;
    const y = H - 112 + Math.floor(i / 10) * 54;
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 48, 48);
    ctx.strokeStyle = '#555';
    ctx.strokeRect(x, y, 48, 48);
  });
  ctx.fillStyle = '#111';
  ctx.font = '24px sans-serif';
  ctx.fillText('For Help, click Help Topics on the Help Menu.', 760, H - 52);
};

scenes.dojo = (ctx, rand) => {
  vGrad(ctx, 0, HORIZON, [[0, '#2b1236'], [0.35, '#a1355a'], [0.7, '#f08a4b'], [1, '#ffd48a']]);
  glow(ctx, W / 2, HORIZON - 150, 520, 'rgba(255,230,160,A)', 0.8);
  ctx.fillStyle = '#ffe9b0';
  ctx.beginPath();
  ctx.arc(W / 2, HORIZON - 150, 190, 0, Math.PI * 2);
  ctx.fill();
  ridge(ctx, HORIZON - 60, 150, 'rgba(70,24,60,0.85)', rand, { rough: 0.7, step: 18 });
  ridge(ctx, HORIZON + 10, 90, 'rgba(34,12,38,0.95)', rand, { rough: 0.6, step: 18 });
  // Cherry blossoms
  for (let i = 0; i < 140; i++) {
    const x = W - 80 - rand() * 520;
    const y = 40 + rand() * 260;
    ctx.fillStyle = `rgba(255,${150 + rand() * 70},${190 + rand() * 50},${0.5 + rand() * 0.5})`;
    ctx.beginPath();
    ctx.arc(x, y, 5 + rand() * 12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#2a140f';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(W + 20, 130);
  ctx.quadraticCurveTo(W - 300, 160, W - 560, 70);
  ctx.stroke();
  // Pillars & lintel
  [90, W - 90].forEach((x) => {
    const g = ctx.createLinearGradient(x - 60, 0, x + 60, 0);
    g.addColorStop(0, '#3b1c14');
    g.addColorStop(0.5, '#6a3524');
    g.addColorStop(1, '#2b130e');
    ctx.fillStyle = g;
    ctx.fillRect(x - 60, 0, 120, HORIZON + 14);
  });
  ctx.fillStyle = '#2a120d';
  ctx.fillRect(0, 0, W, 70);
  // Hanging lanterns
  [480, 1440].forEach((x) => {
    ctx.strokeStyle = '#1a0c08';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, 70);
    ctx.lineTo(x, 170);
    ctx.stroke();
    glow(ctx, x, 250, 190, 'rgba(255,170,70,A)', 0.55);
    ctx.fillStyle = '#e8542a';
    roundRect(ctx, x - 44, 170, 88, 130, 34);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,230,160,0.7)';
    roundRect(ctx, x - 26, 190, 52, 90, 22);
    ctx.fill();
  });
  // Wooden floor
  vGrad(ctx, HORIZON, H, [[0, '#7a4a2a'], [0.5, '#5d371f'], [1, '#34200f']]);
  for (let i = 0; i < 12; i++) {
    const t = i / 12;
    const y = HORIZON + Math.pow(t, 1.6) * (H - HORIZON);
    ctx.strokeStyle = 'rgba(20,10,4,0.55)';
    ctx.lineWidth = 2 + t * 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  for (let i = -14; i <= 14; i++) {
    ctx.strokeStyle = 'rgba(20,10,4,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 + i * 80, HORIZON);
    ctx.lineTo(W / 2 + i * 220, H);
    ctx.stroke();
  }
  glow(ctx, W / 2, HORIZON + 40, 760, 'rgba(255,170,90,A)', 0.28);
  horizonHaze(ctx, '255,190,120', 60);
};

scenes.cyber = (ctx, rand) => {
  vGrad(ctx, 0, HORIZON, [[0, '#07031a'], [0.5, '#2a0f55'], [1, '#c2358f']]);
  stars(ctx, 120, rand, HORIZON * 0.5);
  glow(ctx, 1450, 210, 340, 'rgba(255,120,220,A)', 0.55);
  ctx.fillStyle = '#ffd1f0';
  ctx.beginPath();
  ctx.arc(1450, 210, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(200,90,170,0.35)';
  ctx.beginPath();
  ctx.arc(1410, 180, 34, 0, Math.PI * 2);
  ctx.arc(1500, 250, 22, 0, Math.PI * 2);
  ctx.fill();
  const neon = ['#00f0ff', '#ff3df0', '#ffe14d', '#7dff6a'];
  const skyline = (baseY, minH, maxH, color, lit) => {
    let x = -20;
    while (x < W + 40) {
      const w = 70 + rand() * 130;
      const h = minH + rand() * (maxH - minH);
      ctx.fillStyle = color;
      ctx.fillRect(x, baseY - h, w, h + 400);
      if (lit) {
        for (let wy = baseY - h + 18; wy < baseY - 14; wy += 26) {
          for (let wx = x + 10; wx < x + w - 14; wx += 22) {
            if (rand() < 0.38) {
              ctx.fillStyle = rand() < 0.7 ? 'rgba(255,225,140,0.85)' : `${neon[Math.floor(rand() * 2)]}`;
              ctx.fillRect(wx, wy, 10, 14);
            }
          }
        }
        if (rand() < 0.3) {
          const nc = neon[Math.floor(rand() * neon.length)];
          glow(ctx, x + w / 2, baseY - h + 60, 120, nc.startsWith('#') ? hexToRgba(nc, 'A') : 'rgba(255,255,255,A)', 0.6);
          ctx.fillStyle = nc;
          ctx.fillRect(x + w / 2 - 6, baseY - h + 24, 12, 90);
        }
      }
      x += w + 6;
    }
  };
  skyline(HORIZON - 40, 160, 420, '#190a3a', false);
  skyline(HORIZON + 20, 120, 360, '#0d0524', true);
  // Rooftop floor
  vGrad(ctx, HORIZON, H, [[0, '#1b1530'], [0.4, '#120d22'], [1, '#07040f']]);
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 5;
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.moveTo(0, HORIZON + 4);
  ctx.lineTo(W, HORIZON + 4);
  ctx.stroke();
  ctx.shadowBlur = 0;
  for (let i = 0; i < 16; i++) {
    const t = i / 16;
    const y = HORIZON + Math.pow(t, 1.7) * (H - HORIZON);
    ctx.strokeStyle = `rgba(255,61,240,${0.1 + t * 0.2})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const x = 160 + rand() * (W - 320);
    const y = HORIZON + 90 + rand() * 260;
    const nc = neon[Math.floor(rand() * neon.length)];
    const g = ctx.createRadialGradient(x, y, 0, x, y, 170);
    g.addColorStop(0, hexToRgba(nc, 0.35));
    g.addColorStop(1, hexToRgba(nc, 0));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.22);
    ctx.translate(-x, -y);
    ctx.fillStyle = g;
    ctx.fillRect(x - 170, y - 170, 340, 340);
    ctx.restore();
  }
  horizonHaze(ctx, '255,90,220', 110);
};

function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

scenes.wasteland = (ctx, rand) => {
  vGrad(ctx, 0, HORIZON, [[0, '#2a0f2e'], [0.3, '#8d2c3c'], [0.65, '#f0763a'], [1, '#ffd08a']]);
  glow(ctx, 1320, HORIZON - 110, 640, 'rgba(255,220,150,A)', 0.85);
  ctx.fillStyle = '#fff2c4';
  ctx.beginPath();
  ctx.arc(1320, HORIZON - 110, 120, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 6; i++) cloud(ctx, rand() * W, 90 + rand() * 280, 440, 70, rand, '255,160,120', 0.35);
  // Floating rocks
  for (let i = 0; i < 6; i++) {
    const x = 160 + rand() * (W - 320);
    const y = 120 + rand() * 260;
    const s = 24 + rand() * 54;
    ctx.fillStyle = '#3a1a26';
    ctx.beginPath();
    ctx.moveTo(x - s, y);
    ctx.lineTo(x - s * 0.4, y - s * 0.7);
    ctx.lineTo(x + s * 0.6, y - s * 0.5);
    ctx.lineTo(x + s, y + s * 0.1);
    ctx.lineTo(x + s * 0.2, y + s * 0.9);
    ctx.lineTo(x - s * 0.7, y + s * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  ridge(ctx, HORIZON - 70, 190, '#7a2e3a', rand, { rough: 1.1, step: 14 });
  ridge(ctx, HORIZON - 10, 150, '#4a1c2a', rand, { rough: 1.2, step: 14 });
  // Mesa pillars
  [[260, 330], [1640, 280], [980, 250]].forEach(([x, h]) => {
    ctx.fillStyle = '#35151f';
    ctx.beginPath();
    ctx.moveTo(x - 70, HORIZON + 6);
    ctx.lineTo(x - 54, HORIZON - h);
    ctx.lineTo(x + 54, HORIZON - h + 10);
    ctx.lineTo(x + 76, HORIZON + 6);
    ctx.closePath();
    ctx.fill();
  });
  // Cracked ground
  vGrad(ctx, HORIZON, H, [[0, '#9a5a3c'], [0.4, '#6e3d2a'], [1, '#3a1d14']]);
  ctx.lineCap = 'round';
  for (let i = 0; i < 55; i++) {
    let x = rand() * W;
    let y = HORIZON + 10 + rand() * (H - HORIZON - 10);
    ctx.strokeStyle = `rgba(20,8,6,${0.35 + rand() * 0.4})`;
    ctx.lineWidth = 1.5 + (y - HORIZON) * 0.01;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (rand() - 0.5) * 120;
      y += rand() * 60;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const x = 200 + rand() * (W - 400);
    const y = HORIZON + 80 + rand() * 280;
    ctx.fillStyle = 'rgba(25,10,8,0.5)';
    ctx.beginPath();
    ctx.ellipse(x, y, 120 + rand() * 80, 24 + rand() * 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  horizonHaze(ctx, '255,190,130', 120);
};

scenes.space = (ctx, rand) => {
  vGrad(ctx, 0, H, [[0, '#02030c'], [1, '#0a0a24']]);
  const neb = [['rgba(140,60,255,A)', 380, 260], ['rgba(40,160,255,A)', 1500, 180], ['rgba(255,70,160,A)', 900, 420]];
  neb.forEach(([c, x, y]) => glow(ctx, x, y, 620, c, 0.28));
  stars(ctx, 520, rand, H);
  // Ringed planet
  const px = 1380, py = 300, pr = 190;
  const pg = ctx.createRadialGradient(px - 60, py - 60, 20, px, py, pr);
  pg.addColorStop(0, '#f6c88a');
  pg.addColorStop(0.6, '#c2693d');
  pg.addColorStop(1, '#4a1f20');
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 7; i++) {
    ctx.strokeStyle = `rgba(110,50,30,${0.15 + rand() * 0.2})`;
    ctx.lineWidth = 8 + rand() * 12;
    ctx.beginPath();
    ctx.arc(px, py + (i - 3) * 40, pr * (0.9 - Math.abs(i - 3) * 0.06), 0.1, Math.PI - 0.1);
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(-0.28);
  ctx.scale(1, 0.24);
  [330, 290, 255].forEach((rr, i) => {
    ctx.strokeStyle = `rgba(255,${210 - i * 30},${160 - i * 30},${0.55 - i * 0.12})`;
    ctx.lineWidth = 22 - i * 5;
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.restore();
  // Moon
  glow(ctx, 330, 190, 200, 'rgba(200,220,255,A)', 0.35);
  ctx.fillStyle = '#c9d4e6';
  ctx.beginPath();
  ctx.arc(330, 190, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(90,100,130,0.4)';
  [[310, 176, 14], [352, 214, 10], [340, 160, 8]].forEach(([x, y, r]) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  });
  // Orbital platform
  vGrad(ctx, HORIZON, H, [[0, '#4a5775'], [0.3, '#2f3a54'], [1, '#141a2b']]);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, HORIZON, W, H - HORIZON);
  ctx.clip();
  for (let i = -26; i <= 26; i++) {
    ctx.strokeStyle = 'rgba(120,200,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 + i * 60, HORIZON);
    ctx.lineTo(W / 2 + i * 210, H);
    ctx.stroke();
  }
  for (let j = 0; j < 10; j++) {
    const y = HORIZON + Math.pow(j / 10, 1.8) * (H - HORIZON);
    ctx.strokeStyle = 'rgba(120,200,255,0.25)';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = '#6fd7ff';
  ctx.lineWidth = 6;
  ctx.shadowColor = '#6fd7ff';
  ctx.shadowBlur = 28;
  ctx.beginPath();
  ctx.moveTo(0, HORIZON + 3);
  ctx.lineTo(W, HORIZON + 3);
  ctx.stroke();
  ctx.shadowBlur = 0;
  horizonHaze(ctx, '110,200,255', 90);
};

scenes.lava = (ctx, rand) => {
  vGrad(ctx, 0, HORIZON, [[0, '#14040a'], [0.45, '#5b1210'], [1, '#d4501c']]);
  for (let i = 0; i < 8; i++) cloud(ctx, rand() * W, 60 + rand() * 300, 560, 110, rand, '40,14,14', 0.55);
  // Volcano
  ctx.fillStyle = '#1b0709';
  ctx.beginPath();
  ctx.moveTo(380, HORIZON + 10);
  ctx.lineTo(870, 210);
  ctx.lineTo(1000, 190);
  ctx.lineTo(1510, HORIZON + 10);
  ctx.closePath();
  ctx.fill();
  glow(ctx, 935, 200, 330, 'rgba(255,120,40,A)', 0.7);
  ctx.strokeStyle = '#ff7a1c';
  ctx.shadowColor = '#ff5a00';
  ctx.shadowBlur = 22;
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    let x = 905 + i * 22;
    let y = 215;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 7; k++) {
      x += (rand() - 0.4) * 70 + (i - 2) * 22;
      y += 55 + rand() * 30;
      ctx.lineTo(x, Math.min(y, HORIZON));
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ridge(ctx, HORIZON - 20, 130, '#220b0c', rand, { rough: 0.9, step: 16 });
  // Lava river band behind the floor edge
  vGrad(ctx, HORIZON - 40, HORIZON + 12, [[0, 'rgba(255,110,30,0)'], [0.6, 'rgba(255,150,50,0.95)'], [1, 'rgba(255,90,20,0.9)']]);
  // Basalt floor with glowing cracks
  vGrad(ctx, HORIZON + 10, H, [[0, '#2a1412'], [0.5, '#1d0d0c'], [1, '#0e0505']]);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = '#ff6a00';
  ctx.shadowBlur = 16;
  for (let i = 0; i < 38; i++) {
    let x = rand() * W;
    let y = HORIZON + 20 + rand() * (H - HORIZON - 20);
    ctx.strokeStyle = `rgba(255,${100 + rand() * 90},30,${0.55 + rand() * 0.4})`;
    ctx.lineWidth = 2 + (y - HORIZON) * 0.012;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (rand() - 0.5) * 140;
      y += (rand() - 0.2) * 50;
      ctx.lineTo(x, Math.min(H, y));
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  glow(ctx, W / 2, HORIZON, 900, 'rgba(255,100,30,A)', 0.2);
  horizonHaze(ctx, '255,120,50', 80);
};

// ---------------------------------------------------------------- main
function render(name) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const rand = rng(name.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  scenes[name](ctx, rand);
  vignette(ctx, name === 'sketchpad' ? 0.12 : 0.5);
  grain(ctx, rand, name === 'sketchpad' ? 3 : 7);
  const file = path.join(OUT, `${name}.jpg`);
  fs.writeFileSync(file, canvas.toBuffer('image/jpeg', 90));
  console.log(`  wrote ${path.relative(process.cwd(), file)} (${Math.round(fs.statSync(file).size / 1024)} KB)`);
}

fs.mkdirSync(OUT, { recursive: true });
const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : Object.keys(scenes);
console.log(`Generating ${names.length} arena backdrop(s), horizon at y=${HORIZON} (${(HORIZON / H).toFixed(2)})`);
names.forEach((n) => {
  if (!scenes[n]) throw new Error(`Unknown arena "${n}". Known: ${Object.keys(scenes).join(', ')}`);
  render(n);
});
