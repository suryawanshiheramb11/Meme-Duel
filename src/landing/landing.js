// Meme Duel landing page.
// Light on purpose: it loads before the game does. The game itself (three.js and every game module) is
// only fetched when a button asks for it, and is warmed up in the background once the page is idle so
// the click feels instant.
import {
  CANVAS_SIZE,
  GROUND_Y,
  ENEMY_VARIANTS,
  createPoseState,
  blendPose,
  drawStickman,
  createScratch
} from '../render/stickman/stickmanRig.js';

// Everything the game loads, so it can be fetched in parallel while you read the page.
const GAME_MODULES = [
  'assets/libs/three.module.js',
  'assets/libs/three.core.js',
  'src/core/app.js',
  'src/core/audioSystem.js',
  'src/core/inputManager.js',
  'src/core/perfMonitor.js',
  'src/combat/promptManager.js',
  'src/combat/comboEngine.js',
  'src/combat/fightDirector.js',
  'src/combat/difficulty.js',
  'src/combat/secrets.js',
  'src/render/arenas/arenaManager.js',
  'src/render/effects/effectsManager.js',
  'src/render/stickman/stickmanRig.js',
  'src/render/stickman/paperStandee.js',
  'src/ui/memeReactions.js',
  'src/ui/memeComboMenu.js',
  'src/ui/modeSelect.js',
  'src/ui/retroHud.js',
  'src/ui/onlineLobby.js',
  'src/net/netSession.js',
  'src/net/versus.js'
];

const MOVE_NAMES = { beam: 'Beam finisher', slam: 'Meteor slam', flurry: 'Meme flurry', timeskip: 'Time skip', powerup: 'Power surge' };
const $ = (sel, root = document) => root.querySelector(sel);

document.body.classList.add('landing-active');

// ------------------------------------------------------------------ starting the game
let booting = false;
const invite = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

async function startGame(mode, extra = {}) {
  if (booting) return;
  booting = true;
  document.querySelectorAll('.menu-btn').forEach((b) => (b.disabled = true));
  window.__memeDuel = { mode, ...extra };
  stopStage();
  document.body.classList.remove('landing-active');
  document.body.classList.add('game-started');
  try {
    await import('../core/app.js');
  } catch (err) {
    console.error('The game failed to start:', err);
    document.body.classList.remove('game-started');
    document.body.classList.add('landing-active');
    booting = false;
    document.querySelectorAll('.menu-btn').forEach((b) => (b.disabled = false));
    alert('The game could not load. Check your connection and try again.');
  }
}

function warmUpGame() {
  if (navigator.connection && navigator.connection.saveData) return;
  for (const path of GAME_MODULES) {
    const link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = path.startsWith('assets') ? `./${path}` : `./${path}`;
    document.head.appendChild(link);
  }
}
(window.requestIdleCallback || ((fn) => setTimeout(fn, 1500)))(warmUpGame, { timeout: 4000 });

// ------------------------------------------------------------------ dialogs
function openDialog(id) {
  const dlg = $(`#${id}`);
  if (dlg && !dlg.open) dlg.showModal();
  return dlg;
}
document.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', () => btn.closest('dialog').close()));
document.querySelectorAll('.ld-dialog').forEach((dlg) => {
  // clicking the dark backdrop closes it too
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
  dlg.addEventListener('close', () => {
    const v = $('video', dlg);
    if (v) v.pause();
  });
});

// ------------------------------------------------------------------ meme gallery
let galleryBuilt = false;
async function buildGallery() {
  if (galleryBuilt) return;
  galleryBuilt = true;
  const grid = $('#gal-grid');
  try {
    const res = await fetch('assets/memes/manifest.json');
    const { clips } = await res.json();
    const items = clips.filter((c) => c.phrase && c.thumb);
    $('#gal-count').textContent = `${items.length} memes you can type`;
    const chips = ['all', ...Object.keys(MOVE_NAMES)];
    const filters = $('#gal-filters');
    filters.innerHTML = chips
      .map((m) => `<button class="gal-chip${m === 'all' ? ' on' : ''}" data-move="${m}">${m === 'all' ? 'All' : MOVE_NAMES[m]}</button>`)
      .join('');
    const render = (move) => {
      grid.innerHTML = items
        .filter((c) => move === 'all' || c.move === move)
        .map(
          (c) => `<button class="gal-card" data-file="${c.file}" data-phrase="${c.phrase}">
            <img src="assets/memes/${c.thumb}" alt="" loading="lazy" />
            <span class="t">${c.phrase}</span><span class="m">${MOVE_NAMES[c.move] || c.move}</span></button>`
        )
        .join('');
    };
    render('all');
    filters.addEventListener('click', (e) => {
      const chip = e.target.closest('.gal-chip');
      if (!chip) return;
      filters.querySelectorAll('.gal-chip').forEach((c) => c.classList.toggle('on', c === chip));
      render(chip.dataset.move);
    });
    grid.addEventListener('click', (e) => {
      const card = e.target.closest('.gal-card');
      if (!card) return;
      const player = $('#gal-player');
      const video = $('video', player);
      video.src = `assets/memes/${card.dataset.file}`;
      $('.cap', player).textContent = card.dataset.phrase;
      player.classList.add('on');
      video.play().catch(() => {});
    });
  } catch (err) {
    grid.innerHTML = '<p>The meme list could not be loaded.</p>';
  }
}

// ------------------------------------------------------------------ menu
const actions = {
  bot: () => startGame('bot'),
  online: () => startGame('online', invite ? { room: invite } : {}),
  how: () => openDialog('dlg-how'),
  memes: () => {
    openDialog('dlg-memes');
    buildGallery();
  }
};
document.querySelectorAll('.menu-btn[data-action]').forEach((btn) => btn.addEventListener('click', () => actions[btn.dataset.action]()));

// number keys are shortcuts for the four buttons, arrows move between them
window.addEventListener('keydown', (e) => {
  if (!document.body.classList.contains('landing-active') || document.querySelector('dialog[open]')) return;
  const buttons = [...document.querySelectorAll('.ld-menu .menu-btn')];
  const n = Number(e.key);
  if (n >= 1 && n <= buttons.length) {
    e.preventDefault();
    buttons[n - 1].click();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const i = buttons.indexOf(document.activeElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
    buttons[i < 0 ? 0 : next].focus();
  }
});

if (invite) {
  $('#ld-invite').textContent = `You've been invited to room ${invite}.`;
  $('#ld-invite').hidden = false;
  $('[data-action="online"] .mb-sub').textContent = `Join room ${invite}`;
}

// ------------------------------------------------------------------ the live preview
// Two paper fighters drawn by the game's own rig, playing a looping scrap. It's the real engine, so
// what you see here is what the game looks like.
const stage = {
  canvas: $('#ld-canvas'),
  raf: 0,
  last: 0,
  t: 0,
  bg: new Image(),
  thumb: null,
  thumbs: [],
  caption: '',
  scale: 1.5,
  fighters: null
};

function makeFighter(isHero, variant) {
  const px = Math.round(CANVAS_SIZE * stage.scale);
  const mk = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
  return { isHero, variant, canvas: mk(px, px), scratch: createScratch(mk, stage.scale), state: createPoseState('guard'), pose: 'guard', form: 'base', x: 0, y: 0, rot: 0, flash: 0, mk };
}

function loadStageAssets() {
  stage.bg.src = 'assets/arenas/wasteland.jpg';
  fetch('assets/memes/manifest.json')
    .then((r) => r.json())
    .then(({ clips }) => {
      stage.thumbs = clips.filter((c) => c.phrase && c.thumb);
      pickThumb();
    })
    .catch(() => {});
}

function pickThumb() {
  if (!stage.thumbs.length) return;
  const c = stage.thumbs[Math.floor(Math.random() * stage.thumbs.length)];
  const img = new Image();
  img.src = `assets/memes/${c.thumb}`;
  stage.thumb = img;
  stage.caption = c.phrase;
}

// The choreography, as [seconds, action]. Poses blend smoothly between entries.
const LOOP = 9.4;
function choreography(t, f) {
  const { hero, foe } = f;
  const at = (a, b) => t >= a && t < b;
  hero.form = at(3.1, 6.7) ? 'ssj' : 'base';
  hero.pose = 'guard';
  foe.pose = 'guard';
  hero.x = 0.33;
  foe.x = 0.64;
  foe.y = 0;
  foe.rot = 0;
  hero.flash = 0;
  foe.flash = 0;

  if (at(0.8, 1.0)) hero.pose = 'jab';
  if (at(1.1, 1.3)) hero.pose = 'jab2';
  if (at(1.4, 1.65)) hero.pose = 'punch';
  if (at(1.9, 2.25)) hero.pose = 'kick';
  if (at(0.85, 1.15) || at(1.15, 1.45) || at(1.45, 1.8) || at(1.95, 2.4)) foe.pose = 'hurt';
  if (at(0.85, 2.4)) foe.x = 0.64 + Math.min(0.06, (t - 0.85) * 0.045);
  if (at(0.85, 0.95) || at(1.15, 1.25) || at(1.45, 1.55) || at(1.95, 2.05)) foe.flash = 0.85;

  if (at(3.1, 3.8)) hero.pose = 'charge2';
  if (at(3.8, 4.5)) hero.pose = 'kame';
  if (at(3.8, 4.1)) foe.pose = 'hurt';
  if (at(4.1, 4.6)) {
    foe.pose = 'air';
    const k = (t - 4.1) / 0.5;
    foe.x = 0.66 + k * 0.2;
    foe.y = Math.sin(k * Math.PI) * 0.18;
  }
  if (t >= 4.6 && t < 7.8) {
    foe.pose = 'knockdown';
    foe.x = 0.86;
  }
  if (at(5.2, 7.4)) hero.pose = 'victory';
  if (at(7.8, 8.4)) {
    foe.pose = 'guard';
    foe.x = 0.86 - ((t - 7.8) / 0.6) * 0.22;
  }
  if (t >= 8.4) foe.x = 0.64;
}

function stageFrame(now) {
  stage.raf = requestAnimationFrame(stageFrame);
  if (document.hidden) return;
  const dt = Math.min(0.05, (now - stage.last) / 1000 || 0.016);
  stage.last = now;
  stage.t += dt;
  if (stage.t >= LOOP) {
    stage.t -= LOOP;
    pickThumb();
  }
  const f = stage.fighters;
  choreography(stage.t, f);

  const c = stage.canvas;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(c.clientWidth * dpr);
  const h = Math.round(c.clientHeight * dpr);
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);

  // backdrop, cropped to fill
  if (stage.bg.complete && stage.bg.naturalWidth) {
    const s = Math.max(w / stage.bg.naturalWidth, h / stage.bg.naturalHeight);
    g.drawImage(stage.bg, (w - stage.bg.naturalWidth * s) / 2, (h - stage.bg.naturalHeight * s) / 2, stage.bg.naturalWidth * s, stage.bg.naturalHeight * s);
  } else {
    g.fillStyle = '#3a1f1a';
    g.fillRect(0, 0, w, h);
  }

  const size = h * 1.05; // each fighter's square canvas, in stage pixels
  const floorY = h * 0.86;
  for (const fighter of [f.hero, f.foe]) {
    blendPose(fighter.state, fighter.pose, dt, fighter.pose === 'jab' || fighter.pose === 'jab2' || fighter.pose === 'punch' || fighter.pose === 'kick' ? 56 : 18);
    drawStickman(
      fighter.canvas,
      fighter.state,
      {
        isHero: fighter.isHero,
        variant: fighter.variant,
        form: fighter.form,
        face: fighter.pose === 'hurt' ? 'hurt' : fighter.pose === 'knockdown' ? 'ko' : 'normal',
        time: stage.t,
        flash: fighter.flash,
        bigHair: true,
        glow: true
      },
      fighter.mk,
      fighter.scratch
    );
    const cx = fighter.x * w;
    const top = floorY - (GROUND_Y / CANVAS_SIZE) * size - fighter.y * h;
    // soft contact shadow
    g.fillStyle = 'rgba(0,0,0,0.38)';
    g.beginPath();
    g.ellipse(cx, floorY + 4, size * 0.16, size * 0.028, 0, 0, Math.PI * 2);
    g.fill();
    // the enemy faces left
    g.save();
    g.translate(cx, 0);
    if (!fighter.isHero) g.scale(-1, 1);
    g.drawImage(fighter.canvas, -size / 2, top, size, size);
    g.restore();
  }

  drawStageEffects(g, w, h, size, floorY);
}

function drawStageEffects(g, w, h, size, floorY) {
  const t = stage.t;
  const heroX = stage.fighters.hero.x * w;
  const foeX = stage.fighters.foe.x * w;
  const handY = floorY - size * 0.26;

  // impact bursts on the strikes
  [[0.9, 0.35], [1.2, 0.35], [1.5, 0.4], [2.0, 0.6]].forEach(([when, scale]) => {
    const k = (t - when) / 0.16;
    if (k < 0 || k > 1) return;
    g.save();
    g.translate((heroX + foeX) / 2, handY - size * 0.05);
    g.strokeStyle = `rgba(255,255,255,${1 - k})`;
    g.lineWidth = Math.max(2, h * 0.006);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r0 = h * (0.03 + 0.05 * k) * (1 + scale);
      const r1 = r0 + h * (0.05 + (i % 3) * 0.025) * (1 + scale);
      g.beginPath();
      g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      g.stroke();
    }
    g.restore();
  });

  // beam: charge orb, then a bar of light across the stage
  if (t >= 3.1 && t < 3.8) {
    const k = (t - 3.1) / 0.7;
    const r = h * (0.01 + 0.05 * k * k);
    g.save();
    g.globalCompositeOperation = 'lighter';
    const grad = g.createRadialGradient(heroX + size * 0.02, handY, 0, heroX + size * 0.02, handY, r * 2.4);
    grad.addColorStop(0, 'rgba(255,240,170,1)');
    grad.addColorStop(1, 'rgba(255,200,40,0)');
    g.fillStyle = grad;
    g.fillRect(heroX - r * 3, handY - r * 3, r * 6, r * 6);
    g.restore();
  }
  if (t >= 3.8 && t < 4.7) {
    const k = Math.min(1, (t - 3.8) / 0.08) * (t < 4.4 ? 1 : 1 - (t - 4.4) / 0.3);
    const th = h * 0.09 * k;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const grad = g.createLinearGradient(0, handY - th, 0, handY + th);
    grad.addColorStop(0, 'rgba(255,190,40,0)');
    grad.addColorStop(0.5, 'rgba(255,250,210,1)');
    grad.addColorStop(1, 'rgba(255,190,40,0)');
    g.fillStyle = grad;
    g.fillRect(heroX + size * 0.07, handY - th, w, th * 2);
    g.restore();
    if (t < 3.95) {
      g.fillStyle = `rgba(255,245,200,${0.55 * (1 - (t - 3.8) / 0.15)})`;
      g.fillRect(0, 0, w, h);
    }
  }

  // floating callouts in the game's lettering
  const say = (text, a, b, x, y, color) => {
    if (t < a || t > b) return;
    const k = Math.min(1, (t - a) / 0.12);
    g.save();
    g.font = `700 ${Math.round(h * 0.085 * (0.7 + 0.3 * k))}px Teko, Impact, sans-serif`;
    g.textAlign = 'center';
    g.lineWidth = Math.max(4, h * 0.012);
    g.strokeStyle = '#0a0a0e';
    g.fillStyle = color;
    g.globalAlpha = Math.min(1, (b - t) / 0.35);
    g.strokeText(text, x, y - (t - a) * h * 0.04);
    g.fillText(text, x, y - (t - a) * h * 0.04);
    g.restore();
  };
  say('FINISHER!', 1.95, 2.9, foeX, h * 0.34, '#ffb02e');
  say('BEAM FINISHER', 3.2, 4.1, heroX + size * 0.2, h * 0.3, '#9be8ff');
  say('K.O.!', 4.65, 5.7, foeX, h * 0.5, '#ff3344');

  // a meme pops up over the hero's head, like in the game
  if (t >= 3.8 && t < 6.5 && stage.thumb && stage.thumb.complete) {
    const k = Math.min(1, (t - 3.8) / 0.2);
    const ease = 1 - Math.pow(1 - k, 3);
    const bw = h * 0.5 * ease;
    const bh = bw * 0.5625;
    const bx = Math.min(w - bw - 12, Math.max(12, heroX - bw / 2));
    const by = floorY - size * 0.62 - bh;
    g.save();
    g.globalAlpha = Math.min(1, (6.5 - t) / 0.3);
    g.fillStyle = '#0d0f14';
    g.fillRect(bx - 5, by - 5, bw + 10, bh + 10);
    g.drawImage(stage.thumb, bx, by, bw, bh);
    g.fillStyle = 'rgba(220,30,60,0.92)';
    g.font = `700 ${Math.max(11, Math.round(h * 0.04))}px Teko, Impact, sans-serif`;
    const label = stage.caption;
    const tw = Math.min(bw - 8, g.measureText(label).width + 14);
    g.fillRect(bx + 4, by + 4, tw, h * 0.052);
    g.fillStyle = '#fff';
    g.textBaseline = 'middle';
    g.fillText(label, bx + 11, by + 4 + h * 0.026, bw - 20);
    // pointer toward the head
    g.fillStyle = '#cfd6e4';
    g.beginPath();
    g.moveTo(heroX - 8, by + bh + 5);
    g.lineTo(heroX + 8, by + bh + 5);
    g.lineTo(heroX, by + bh + 16);
    g.fill();
    g.restore();
  }
}

function startStage() {
  loadStageAssets();
  stage.fighters = { hero: makeFighter(true, 'cap'), foe: makeFighter(false, ENEMY_VARIANTS[1]) };
  stage.last = performance.now();
  stage.raf = requestAnimationFrame(stageFrame);
}
function stopStage() {
  cancelAnimationFrame(stage.raf);
}

if (stage.canvas) {
  // fonts first, so the callouts use the game's lettering from the first frame
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).finally(startStage);
}
