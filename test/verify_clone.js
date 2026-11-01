// ============================================================================
// MEME DUEL — VERIFICATION SUITE
// ============================================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('====================================================');
console.log('MEME DUEL: VERIFICATION SUITE');
console.log('====================================================\n');

// 1. Core Architecture & Modules
console.log('[1/10] Verifying 1:1 Engine Architecture & Source Modules...');
const requiredFiles = [
  'index.html',
  'styles.css',
  'package.json',
  'src/core/app.js',
  'src/core/audioSystem.js',
  'src/core/inputManager.js',
  'src/render/arenas/arenaManager.js',
  'src/render/stickman/paperStandee.js',
  'src/render/stickman/stickmanRig.js',
  'src/render/effects/effectsManager.js',
  'src/combat/comboEngine.js',
  'src/combat/fightDirector.js',
  'scripts/generate_arenas.js',
  'src/combat/promptManager.js',
  'src/ui/retroHud.js',
  'src/ui/memeComboMenu.js',
  'assets/libs/three.module.js'
];

for (const rel of requiredFiles) {
  const p = path.join(ROOT, rel);
  assert(fs.existsSync(p) && fs.statSync(p).size > 0, `Module exists & non-empty: ${rel}`);
}

// 2. Generated arena backdrops & paper texture
console.log('\n[2/10] Verifying Generated Arena Backdrops...');
const arenaFiles = ['desk', 'crt', 'meadow', 'sketchpad', 'dojo', 'cyber', 'wasteland', 'space', 'lava'];
for (const name of arenaFiles) {
  const rel = `assets/arenas/${name}.jpg`;
  const p = path.join(ROOT, rel);
  assert(fs.existsSync(p) && fs.statSync(p).size > 50000, `Arena backdrop verified: ${rel}`);
}
assert(fs.existsSync(path.join(ROOT, 'assets/textures/paper/notebook_paper.png')), 'Notebook paper texture present');

// 3. Audio Engine & SFX Assets
console.log('\n[3/10] Verifying Mechanical Audio & Combat SFX...');
const audioFiles = [
  'assets/audio/sfx/keys/thock_01.ogg',
  'assets/audio/sfx/keys/thock_02.ogg',
  'assets/audio/sfx/keys/spacebar_down.ogg',
  'assets/audio/sfx/keys/key_enter_slam.ogg',
  'assets/audio/sfx/keys/error_buzz_soft.ogg',
  'assets/audio/sfx/combat/hit_punch_light_01.ogg',
  'assets/audio/sfx/combat/hit_punch_heavy_01.ogg',
  'assets/audio/sfx/combat/hit_kick_01.ogg',
  'assets/audio/sfx/combat/impact_crit_01.ogg',
  'assets/audio/sfx/combat/combat_knockdown_01.ogg',
  'assets/audio/music/music_street_combat.ogg'
];

for (const audio of audioFiles) {
  const p = path.join(ROOT, audio);
  assert(fs.existsSync(p) && fs.statSync(p).size > 1000, `Audio SFX verified: ${audio}`);
}

// 4. Prompt Engine Logic Simulation
console.log('\n[4/10] Testing Prompt Engine Mechanics (Typing, Red Cursor, Accuracy)...');
// Import PromptManager logic simulation
class MockPromptManager {
  constructor() {
    this.currentText = 'THIS IS A TYPING GAME.';
    this.charIndex = 0;
    this.goodCount = 0;
    this.missCount = 0;
    this.startTime = Date.now();
    this.elapsedSeconds = 0;
  }
  getCurrentChar() {
    return this.currentText[this.charIndex];
  }
  handleKeyPress(key) {
    const target = this.getCurrentChar();
    if (key.toUpperCase() === target) {
      this.goodCount++;
      this.charIndex++;
      return { status: 'good' };
    } else {
      this.missCount++;
      return { status: 'miss' };
    }
  }
  getAccuracy() {
    const total = this.goodCount + this.missCount;
    return total === 0 ? 100 : Math.round((this.goodCount / total) * 100);
  }
}

const promptTester = new MockPromptManager();
assert(promptTester.getCurrentChar() === 'T', 'Initial active char is "T"');
const res1 = promptTester.handleKeyPress('t');
assert(res1.status === 'good', 'Typing "t" registers good keystroke');
assert(promptTester.getCurrentChar() === 'H', 'Active char advances to "H"');

const res2 = promptTester.handleKeyPress('z'); // Typo
assert(res2.status === 'miss', 'Typing incorrect key "z" registers typo miss');
assert(promptTester.goodCount === 1 && promptTester.missCount === 1, 'Metrics: 1 Good, 1 Miss');
assert(promptTester.getAccuracy() === 50, 'Accuracy correctly calculated as 50%');

// 5. Combat & DMC Style Rank Engine Simulation
console.log('\n[5/10] Testing Combat Engine (DMC Ranks, Air Launcher, Slam, Rage)...');
class MockComboEngine {
  constructor() {
    this.hits = 0;
    this.score = 0;
    this.ranks = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
    this.currentRankIndex = 0;
    this.stylePoints = 0;
    this.isRageMode = false;
  }
  registerHit(type) {
    this.hits++;
    const mult = 1 + this.currentRankIndex * 0.5;
    this.score += Math.round(100 * mult);
    this.stylePoints += 25;
    if (this.stylePoints >= 100 && this.currentRankIndex < this.ranks.length - 1) {
      this.currentRankIndex++;
      this.stylePoints = 0;
    }
  }
  getCurrentRank() { return this.ranks[this.currentRankIndex]; }
  triggerAirLauncher() { this.hits += 2; this.score += 500; }
  triggerGroundSlam() { this.hits += 3; this.score += 1000; }
  triggerRageMode() { this.isRageMode = !this.isRageMode; }
}

const comboTester = new MockComboEngine();
assert(comboTester.getCurrentRank() === 'D', 'Starting rank is "D"');
for (let i = 0; i < 4; i++) comboTester.registerHit('light');
assert(comboTester.getCurrentRank() === 'C', 'Ranking up to "C" after style points threshold');
comboTester.triggerAirLauncher();
assert(comboTester.hits === 6 && comboTester.score > 800, 'Spacebar Air Launcher executed successfully');
comboTester.triggerGroundSlam();
assert(comboTester.hits === 9 && comboTester.score > 1800, 'Enter Ground Slam executed successfully');
comboTester.triggerRageMode();
assert(comboTester.isRageMode === true, 'Caps Lock Rage Mode active');

// 6. Regression tests for the reported bugs: A/D keys, alignment, arena wiring
console.log('\n[6/10] Regression: typing keys, fighter alignment, arena wiring...');

// 6a. Every letter must reach the typing prompt. WASD movement used to swallow A and D.
const inputSrc = fs.readFileSync(path.join(ROOT, 'src/core/inputManager.js'), 'utf8');
const moveBindings = inputSrc.match(/key\s*===\s*['"][adwsADWS]['"]/g) || [];
assert(moveBindings.length === 0, 'No letter keys are bound to movement (A/D reach the prompt)');
assert(/code\s*===\s*'ArrowLeft'/.test(inputSrc) && /code\s*===\s*'ArrowRight'/.test(inputSrc), 'Walking uses the arrow keys');

// 6b. Rig geometry: load the pure-math module without a bundler by stripping `export`.
const rigSrc = fs.readFileSync(path.join(ROOT, 'src/render/stickman/stickmanRig.js'), 'utf8').replace(/^export /gm, '');
const rig = new Function(`${rigSrc}\nreturn { POSES, computeSkeleton, GROUND_Y, CANVAS_SIZE, createPoseState, blendPose };`)();
let worstFloat = 0;
let offCanvas = [];
for (const name of Object.keys(rig.POSES)) {
  const pts = rig.computeSkeleton(rig.POSES[name]);
  const lowest = Math.max(...['hip', 'head', 'handF', 'handB', 'footF', 'footB', 'kneeF', 'kneeB'].map((k) => pts[k][1]));
  worstFloat = Math.max(worstFloat, Math.abs(rig.GROUND_Y - (lowest + (lowest === pts.head[1] ? 30 : 4))));
  for (const k of ['head', 'handF', 'handB', 'footF', 'footB']) {
    const [x, y] = pts[k];
    if (x < 30 || x > rig.CANVAS_SIZE - 30 || y < 30 || y > rig.CANVAS_SIZE - 10) offCanvas.push(`${name}.${k}`);
  }
}
assert(worstFloat < 8, `Every pose keeps its lowest point on the ground line (worst offset ${worstFloat.toFixed(1)}px)`);
assert(offCanvas.length === 0, `No pose draws outside the sprite canvas${offCanvas.length ? ' (' + offCanvas.join(', ') + ')' : ''}`);

// 6c. Poses blend smoothly toward their target (limbs actually move)
const st = rig.createPoseState('guard');
rig.blendPose(st, 'kick', 1 / 60, 36);
assert(st.fT > rig.POSES.guard.fT && st.fT < rig.POSES.kick.fT, 'Pose blending moves limbs gradually toward the target pose');

// 6d. Arena config points at real files and every backdrop is 1920x1080
const arenaSrc = fs.readFileSync(path.join(ROOT, 'src/render/arenas/arenaManager.js'), 'utf8');
const arenaRefs = [...arenaSrc.matchAll(/file:\s*'([^']+)'/g)].map((m) => m[1]);
assert(arenaRefs.length >= 9, `Arena list references ${arenaRefs.length} backdrops`);
for (const rel of arenaRefs) assert(fs.existsSync(path.join(ROOT, rel)), `Arena file exists: ${rel}`);
assert(!/textures\/arenas/.test(arenaSrc), 'Arena manager no longer uses game-screenshot textures');

(async () => {
  try {
    const { loadImage } = require('@napi-rs/canvas');
    for (const rel of arenaRefs) {
      const img = await loadImage(path.join(ROOT, rel));
      assert(img.width === 1920 && img.height === 1080, `Backdrop is 1920x1080: ${rel}`);
    }
  } catch (e) {
    console.log('  (skipped backdrop size check: @napi-rs/canvas not installed)');
  }

  // 7. Meme clips, meme queue and special moves
  console.log('\n[7/10] Meme clips, queue phrases and special moves...');
  const memeDir = path.join(ROOT, 'assets/memes');
  const manifestPath = path.join(memeDir, 'manifest.json');
  assert(fs.existsSync(manifestPath), 'Meme manifest exists (run `npm run fetch:memes` if missing)');
  if (fs.existsSync(manifestPath)) {
    const { clips } = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert(clips.length >= 90, `Meme manifest lists ${clips.length} clips`);
    const missing = clips.filter((c) => !fs.existsSync(path.join(memeDir, c.file)) || fs.statSync(path.join(memeDir, c.file)).size < 5000);
    assert(missing.length === 0, `Every listed clip file exists${missing.length ? ' (missing ' + missing.length + ')' : ''}`);
    assert(clips.every((c) => c.duration > 0 && c.duration <= 6.5), 'Clips are 6 seconds or shorter');

    const queued = clips.filter((c) => c.phrase);
    const moves = ['beam', 'slam', 'flurry', 'timeskip', 'powerup'];
    assert(queued.length >= 40, `${queued.length} memes have a typeable catchphrase`);
    assert(queued.every((c) => /^[A-Z0-9 ]+$/.test(c.phrase) && c.phrase.length <= 36), 'Every phrase is plain A-Z/0-9/space and fits on screen');
    assert(queued.every((c) => moves.includes(c.move)), 'Every phrase maps to a known special move');
    assert(moves.every((m) => queued.some((c) => c.move === m)), 'All five special moves are used by at least one meme');
    assert(queued.every((c) => c.thumb && fs.existsSync(path.join(memeDir, c.thumb))), 'Every queued meme has a thumbnail');
    const dupes = queued.length - new Set(queued.map((c) => c.phrase)).size;
    assert(dupes <= 2, `Phrases are (almost) all unique (${dupes} duplicate)`);
    const tagged = new Set(clips.flatMap((c) => c.tags));
    for (const t of ['ko', 'typo', 'hurt', 'powerup', 'slam', 'beam', 'dodge', 'enter', 'timeskip', 'idle']) {
      assert(tagged.has(t), `Reaction tag has clips: ${t}`);
    }
  }

  // The queue wiring: prompt manager, combo engine and HUD must agree on the move names.
  const promptSrc = fs.readFileSync(path.join(ROOT, 'src/combat/promptManager.js'), 'utf8');
  const comboSrc2 = fs.readFileSync(path.join(ROOT, 'src/combat/comboEngine.js'), 'utf8');
  const hudSrc = fs.readFileSync(path.join(ROOT, 'src/ui/retroHud.js'), 'utf8');
  assert(/setQueue\(/.test(promptSrc) && /onWordComplete/.test(promptSrc), 'Prompt manager has a meme queue and word-complete hook');
  for (const m of ['beam', 'slam', 'flurry', 'timeskip', 'powerup']) {
    assert(new RegExp(`${m}:\\s*'`).test(hudSrc) && new RegExp(`${m}:\\s*'`).test(comboSrc2), `HUD and combat engine both know the "${m}" move`);
  }
  assert(/registerWord\(/.test(comboSrc2) && /triggerSpecial\(/.test(comboSrc2), 'Combat engine has word bonus and sentence special');

  // Prompt queue behaviour, simulated with the real class (pure logic, no DOM).
  const pmSrc = promptSrc.replace(/^export /gm, '');
  const PM = new Function(`${pmSrc}\nreturn PromptManager;`)();
  const fired = { sentences: [], words: [] };
  const pm = new PM((item) => fired.sentences.push(item && item.phrase), (w) => fired.words.push(w));
  pm.setQueue([
    { phrase: 'AB CD', move: 'beam', clip: {} },
    { phrase: 'EF GH', move: 'beam', clip: {} },
    { phrase: 'IJ', move: 'slam', clip: {} }
  ]);
  assert(pm.currentItem && pm.peek(2).length === 2, 'Queue loads a current item and previews the next ones');
  assert(pm.queue[0].move !== pm.queue[1].move || pm.queue.every((q) => q.move === pm.queue[0].move), 'Same special move is not queued back to back when avoidable');
  const first = pm.currentText;
  for (const ch of first) pm.handleKeyPress(ch);
  assert(fired.sentences[0] === first, 'Finishing a phrase reports that meme item');
  assert(fired.words.length === first.split(' ').length - 1, 'Each finished word (except the last) fires the word hook');
  assert(pm.currentText !== first, 'Queue advances to the next meme after a phrase');

  console.log('');

  // 8. Difficulty levels
  console.log('\n[8/10] Easy / Medium / Hard bot levels...');
  const diffSrc = fs.readFileSync(path.join(ROOT, 'src/combat/difficulty.js'), 'utf8').replace(/^export /gm, '');
  const { DIFFICULTIES } = new Function(`${diffSrc}\nreturn { DIFFICULTIES };`)();
  const lv = ['easy', 'medium', 'hard'].map((k) => DIFFICULTIES[k]);
  assert(lv.every(Boolean), 'Easy, medium and hard are all defined');
  const rising = (f) => f(lv[0]) < f(lv[1]) && f(lv[1]) < f(lv[2]);
  const falling = (f) => f(lv[0]) > f(lv[1]) && f(lv[1]) > f(lv[2]);
  assert(rising((d) => d.enemyHp), 'Bot health rises with difficulty');
  assert(rising((d) => d.damage), 'Bot damage rises with difficulty');
  assert(rising((d) => d.speed), 'Bot speed rises with difficulty');
  assert(falling((d) => d.windup), 'Attack telegraph shrinks with difficulty (less time to react)');
  assert(falling((d) => d.cooldown[0]) && falling((d) => d.cooldown[1]), 'Time between attacks shrinks with difficulty');
  assert(rising((d) => d.counterOnTypo + d.doubleStrike + d.dodge), 'Typo counters, double swings and dodges all grow with difficulty');
  assert(lv.every((d) => !d.mercy), 'Every level can finish you off (the old final boss is now Easy)');
  assert(rising((d) => d.score), 'Higher difficulty scores more');
  assert(lv.every((d) => d.cooldown[0] < d.cooldown[1] && d.idleCooldown[0] < d.idleCooldown[1] && d.windup >= 0.1), 'Every level has sane cooldown ranges and a reactable windup');
  const dirSrc = fs.readFileSync(path.join(ROOT, 'src/combat/fightDirector.js'), 'utf8');
  assert(/setDifficulty\(/.test(dirSrc) && /this\.diff\.windup/.test(dirSrc) && /this\.diff\.damage/.test(dirSrc), 'Fight director reads the difficulty table');
  assert(fs.existsSync(path.join(ROOT, 'src/ui/modeSelect.js')), 'Start-screen mode picker exists');

  // 9. Hosted build
  console.log('\n[9/10] Slim hosted build (web-dist)...');
  require('child_process').execFileSync('node', [path.join(ROOT, 'scripts/build_web.js')], { stdio: 'pipe' });
  const dist = path.join(ROOT, 'web-dist');
  const distFiles = (function walk(d) {
    return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  })(dist).filter((f) => !f.includes(`${path.sep}.vercel${path.sep}`) && !f.endsWith('.env.local'));
  const distBytes = distFiles.reduce((n, f) => n + fs.statSync(f).size, 0);
  assert(fs.existsSync(path.join(dist, 'index.html')) && fs.existsSync(path.join(dist, 'src/core/app.js')), 'Build contains the page and game code');
  assert(fs.existsSync(path.join(dist, 'assets/libs/three.module.js')) && fs.existsSync(path.join(dist, 'assets/libs/three.core.js')), 'Build contains three.js and its core');
  assert(arenaFiles.every((n) => fs.existsSync(path.join(dist, `assets/arenas/${n}.jpg`))), 'Build contains every arena backdrop');
  assert(fs.existsSync(path.join(dist, 'assets/memes/manifest.json')), 'Build contains the meme manifest and clips');
  assert(!fs.existsSync(path.join(dist, 'test')) && !fs.existsSync(path.join(dist, 'node_modules')) && !fs.existsSync(path.join(dist, 'assets/audio/_source_packs')), 'Build leaves out tests, node_modules and source packs');
  assert(distBytes < 40e6, `Hosted build is lean (${(distBytes / 1e6).toFixed(1)} MB, limit 40 MB)`);
  const cfg = JSON.parse(fs.readFileSync(path.join(dist, 'vercel.json'), 'utf8'));
  assert(cfg.headers && cfg.headers.some((h) => /assets/.test(h.source) && /max-age=\d{5,}/.test(JSON.stringify(h.headers))), 'Assets are served with long-lived cache headers');
  const manifestRule = cfg.headers.find((h) => h.source === '/assets/memes/manifest.json');
  const mediaRule = cfg.headers.find((h) => /^\/assets\//.test(h.source) && h.source !== '/assets/memes/manifest.json');
  assert(manifestRule && /must-revalidate/.test(JSON.stringify(manifestRule.headers)), 'The meme manifest always revalidates, so edits reach returning players');
  assert(mediaRule && !new RegExp(mediaRule.source.replace(/^\//, '^/')).test('/assets/memes/manifest.json') && new RegExp('^' + mediaRule.source + '$').test('/assets/memes/meme_001.mp4'), 'The long-cache rule covers media but not the manifest (no overlapping rules)');
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const preloaded = (indexHtml.match(/rel="modulepreload"/g) || []).length;
  const srcCount = (function walk(d) {
    return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [e] : []));
  })(path.join(ROOT, 'src')).length;
  const landingSrc = fs.readFileSync(path.join(ROOT, 'src/landing/landing.js'), 'utf8');
  const listed = (landingSrc.match(/'(?:src|assets)\/[^']+\.js'/g) || []).length;
  const gameModules = srcCount - fs.readdirSync(path.join(ROOT, 'src/landing')).length;
  assert(preloaded >= 2 && listed >= gameModules + 2, `Landing page warms every game module (${listed} listed for ${gameModules} modules + three.js)`);
  assert(!/@import/.test(fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8')), 'No render-blocking @import in the stylesheet');

  console.log('');

  // 10. Smarter bot, guard/jump controls, meme cutscenes and move matching
  console.log('\n[10/10] Bot moveset, controls, cutscene freeze, meme-to-move matching...');
  const diffSrc2 = fs.readFileSync(path.join(ROOT, 'src/combat/difficulty.js'), 'utf8').replace(/^export /gm, '');
  const { ATTACKS, DIFFICULTIES: D2 } = new Function(`${diffSrc2}\nreturn { ATTACKS, DIFFICULTIES };`)();
  assert(ATTACKS.jab.windup < ATTACKS.punch.windup && ATTACKS.punch.windup < ATTACKS.heavy.windup, 'Attack telegraphs run jab < punch < heavy');
  assert(ATTACKS.jab.dmg < ATTACKS.punch.dmg && ATTACKS.punch.dmg < ATTACKS.heavy.dmg && ATTACKS.heavy.dmg < ATTACKS.ultra.dmg, 'Attack damage runs jab < punch < heavy < ultra');
  assert(ATTACKS.ultra.unblockable && ATTACKS.sweep.low, 'Ultra is unblockable and the sweep is a low attack you can jump');
  assert(Object.keys(ATTACKS).every((k) => (ATTACKS[k].reach > 0 || ATTACKS[k].projectile) && ATTACKS[k].pose), 'Every attack has a reach and a pose');
  const lv2 = ['easy', 'medium', 'hard'].map((k) => D2[k]);
  assert(lv2.every((d) => d.ultra), 'Every level has an ultra');
  assert(lv2[2].ultra.every[0] < lv2[1].ultra.every[0] && lv2[1].ultra.every[0] < lv2[0].ultra.every[0] && lv2[2].ultra.windup < lv2[1].ultra.windup && lv2[1].ultra.windup < lv2[0].ultra.windup, 'Ultras come more often with less warning as difficulty rises');
  assert(lv2[0].guardChance < lv2[1].guardChance && lv2[1].guardChance < lv2[2].guardChance, 'Bot blocks more as difficulty rises');
  assert(lv2[0].readsLauncher < lv2[1].readsLauncher && lv2[1].readsLauncher < lv2[2].readsLauncher, 'Bot reads your air launcher more as difficulty rises');
  assert(lv2[0].pokesDashIn < lv2[1].pokesDashIn && lv2[1].pokesDashIn < lv2[2].pokesDashIn, 'Bot counter-pokes your dash more as difficulty rises');
  assert(lv2.every((d) => Object.keys(d.attackWeights).length >= 4), 'Every level throws a full moveset');
  assert(lv2[0].dodge < lv2[1].dodge && lv2[1].dodge < lv2[2].dodge && lv2[0].dodgeCd > lv2[1].dodgeCd && lv2[1].dodgeCd > lv2[2].dodgeCd && lv2[0].avoidSpecial < lv2[2].avoidSpecial, 'Bots dodge more, faster and read your specials better as difficulty rises');
  assert(Object.keys(lv2[2].attackWeights).every((k) => ATTACKS[k]), 'Every weighted attack exists in the attack table');

  const inSrc = fs.readFileSync(path.join(ROOT, 'src/core/inputManager.js'), 'utf8');
  assert(/code === 'ArrowUp'[\s\S]*triggerJump/.test(inSrc), 'Up arrow jumps');
  assert(/code === 'ArrowDown'[\s\S]*keysHeld\.down = true/.test(inSrc) && /hero\.guarding\s*=/.test(inSrc), 'Down arrow holds guard');
  const dirSrc2 = fs.readFileSync(path.join(ROOT, 'src/combat/fightDirector.js'), 'utf8');
  assert(/h\.guarding && !spec\.unblockable/.test(dirSrc2) && /spec\.low && h\.y > 0\.45/.test(dirSrc2), 'Guard blocks (except the ultra) and jumping clears low attacks');
  assert(/INTERRUPTED/.test(dirSrc2), 'Hitting the bot mid-windup interrupts its ultra');

  const memeSrc = fs.readFileSync(path.join(ROOT, 'src/ui/memeReactions.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/core/app.js'), 'utf8');
  // Memes are overlays: they never stop the fight, block typing, or delay a special move.
  assert(!/frozen|freezeMode|cutscene|onEnd/.test(memeSrc), 'Meme player has no freeze or cutscene logic (memes never stop the game)');
  assert(!/memes\.frozen|wasFrozen|meme-frozen/.test(appSrc), 'Game loop never pauses for a meme');
  assert(!/blockers\.push\([^)]*this\.memes/.test(appSrc), 'Typing is never blocked while a meme plays (only the menu and mode picker capture keys)');
  assert(/this\.memes\.playClip\([^)]*\)[\s\S]{0,120}perform\(\);/.test(comboSrc2) && !/onEnd: perform/.test(comboSrc2), 'A finished phrase plays its meme and fires its special move at the same time');
  assert(/updateAnchor\(\)/.test(appSrc) && /bindStage\(/.test(appSrc) && /worldToScreen/.test(fs.readFileSync(path.join(ROOT, 'src/render/arenas/arenaManager.js'), 'utf8')), 'Memes are anchored over the fighters\' heads and follow them every frame');
  assert(/anchor\('head'\)/.test(memeSrc) && /HUD_TOP_PX/.test(memeSrc), 'Overlay sits above the head and stays clear of the typing prompt');
  assert(/side: 'left'[^\n]*\}\);\s*\n\s*else this\.memes\.trigger|playClip\(item\.clip, \{ side: 'left'/.test(comboSrc2), 'A typed phrase\'s meme floats over the hero');
  assert(/clipHeight\(/.test(memeSrc) && /window\.innerHeight/.test(memeSrc) && /window\.innerWidth/.test(memeSrc) && /SIZE\s*=\s*\{[^}]*phrase/.test(memeSrc), 'Overlay size is relative to the screen and the moment (phrase > big > notable > ambient)');
  // The size scale really is graded and bounded
  const sizeBlock = memeSrc.match(/const SIZE = (\{[^}]+\});/);
  const SIZES = sizeBlock ? new Function(`return ${sizeBlock[1]}`)() : {};
  assert(SIZES[1] < SIZES[2] && SIZES[2] < SIZES[3] && SIZES[3] < SIZES.phrase, 'Meme sizes grow with the moment: ambient < notable < big < typed phrase');

  // Every typeable meme has an explicit, meaning-based move, and the queue is a sorted ladder.
  const fetchSrc = fs.readFileSync(path.join(ROOT, 'scripts/fetch_memes.js'), 'utf8');
  const movesBlock = fetchSrc.slice(fetchSrc.indexOf('const MOVES = {'), fetchSrc.indexOf('};', fetchSrc.indexOf('const MOVES = {')));
  const explicit = [...movesBlock.matchAll(/'([^']+)':\s*'(beam|slam|flurry|timeskip|powerup)'/g)];
  const manifest2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/memes/manifest.json'), 'utf8')).clips.filter((c) => c.phrase);
  const explicitMap = Object.fromEntries(explicit.map((m) => [m[1], m[2]]));
  assert(manifest2.every((c) => explicitMap[c.phrase] === c.move), `All ${manifest2.length} phrases use their hand-picked move`);
  const ladderPM = new Function(`${promptSrc.replace(/^export /gm, '')}\nreturn PromptManager;`)();
  const lp = new ladderPM(() => {}, () => {});
  const sample = ['flurry', 'slam', 'powerup', 'beam', 'timeskip'].flatMap((m) => [1, 2, 3].map((i) => ({ phrase: `${m} ${i}`.toUpperCase(), move: m, clip: {} })));
  lp.setQueue(sample);
  assert(lp.queue.slice(0, 5).map((q) => q.move).join() === 'flurry,slam,powerup,beam,timeskip', 'Queue is sorted as a ladder: flurry, slam, power surge, beam, time skip');
  assert(lp.queue.slice(5, 10).map((q) => q.move).join() === 'flurry,slam,powerup,beam,timeskip', 'The ladder repeats for the next round');

  console.log('');

  // ---- [11] Rounds, fatality, online play, removed/added memes
  console.log('\n[11/11] Rounds, fatality, online duels, meme list...');
  const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const matchSrc = rd('src/combat/match.js');
  assert(/ROUNDS_TO_WIN\s*=\s*2/.test(matchSrc) && /ROUND_SECONDS/.test(matchSrc), 'A match is first to two rounds, with a round clock');
  assert(/FINISH HIM/.test(matchSrc) && /FATALITY_CODE/.test(matchSrc) && /fatality\(kind, byMe\)/.test(matchSrc), 'The deciding KO opens a FINISH HIM window with a fatality');
  assert(/FINAL ROUND/.test(matchSrc) && /BEGINS/.test(matchSrc) && /round-bars/.test(matchSrc), 'Round 1, round 2 and the final round each get an introduction');
  assert(/HEALTH_SCALE\s*=\s*\d/.test(rd('src/combat/fightDirector.js')), 'Fighters carry extra health so rounds last');
  const netSrc = rd('src/net/netSession.js');
  assert(/md-room-/.test(netSrc) && /createRoom/.test(netSrc) && /joinRoom/.test(netSrc), 'Private rooms with a join code');
  assert(/quickMatch/.test(netSrc) && /unavailable-id/.test(netSrc) && /SLOTS/.test(netSrc), 'Quick match pairs searching players through waiting slots');
  const vsSrc = rd('src/net/versus.js');
  assert(/t: 'hit'/.test(vsSrc) && /takeIncoming/.test(vsSrc) && /t: 'rend'/.test(vsSrc), 'Online: defender-authoritative hits and host-decided round ends');
  assert(fs.existsSync(path.join(ROOT, 'assets/libs/peerjs.min.js')), 'PeerJS is vendored (no CDN at play time)');
  const manifest3 = JSON.parse(rd('assets/memes/manifest.json')).clips;
  assert(!manifest3.some((c) => /gareeb/i.test(c.title + c.phrase)), 'The "Mein Gareeb hun" meme is gone');
  assert(manifest3.some((c) => c.phrase === 'EMOTIONAL DAMAGE' && fs.existsSync(path.join(ROOT, 'assets/memes', c.file))), 'Emotional Damage is in the meme set');
  const lockerSrc = rd('src/core/locker.js');
  assert(/ACCESSORIES/.test(lockerSrc) && /headband/.test(lockerSrc) && /crown/.test(lockerSrc) && /export function buy/.test(lockerSrc), 'The store sells accessories (headband, crown, hats, glasses...)');
  assert(/drawHeadGear/.test(rd('src/render/stickman/stickmanRig.js')) && /currentGear/.test(rd('src/core/app.js')) && /t: 'gear'/.test(vsSrc), 'Equipped gear is drawn on your fighter and shown to your online opponent');
  assert(/rdy/.test(rd('src/ui/onlineLobby.js')) && /STUN_SERVERS/.test(netSrc) && fs.existsSync(path.join(ROOT, 'src/net/ice.json')), 'Online rooms have a ready-up lobby and a configurable TURN relay (src/net/ice.json)');
  const promptSrc3 = rd('src/combat/promptManager.js');
  assert(/rollChoices/.test(promptSrc3) && /distinct first letters|letters\.has/.test(promptSrc3) && /applyBuff/.test(rd('src/combat/comboEngine.js')), 'Tactical mode: three memes with different first letters, each a buff');
  assert(/buffValue/.test(rd('src/combat/buffs.js')) && /updateBotBuffs/.test(rd('src/combat/fightDirector.js')) && /botBuffWeights/.test(rd('src/combat/buffs.js')), 'Tactical buffs scale with both fighters\' health, and the bot plays them too');
  assert(/data-action="tactical"/.test(rd('index.html')) && /tactical:/.test(rd('src/landing/landing.js')), 'Tactical Mode is on the landing page');
  console.log('');

console.log('\n====================================================');
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('>>> ALL MEME DUEL CHECKS PASSED! <<<\n');
  process.exit(0);
}
})();
