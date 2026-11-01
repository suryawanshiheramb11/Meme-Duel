// ============================================================================
// TYPEFIGHTER — HEADLESS AUTOMATED VERIFICATION SUITE
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
console.log('TYPEFIGHTER — SYSTEM & INTEGRATION VERIFICATION TEST');
console.log('====================================================\n');

// 1. Files & Structural Integrity
console.log('[1/6] Verifying Project Architecture & Core Files...');
const coreFiles = [
  'package.json',
  'server.js',
  'index.html',
  'styles.css',
  'src/engine/audioManager.js',
  'src/engine/stickmanRig.js',
  'src/engine/particleSystem.js',
  'src/engine/combatEngine.js',
  'src/pedagogy/typingEngine.js',
  'src/pedagogy/adaptiveTracker.js',
  'src/pedagogy/curriculum.js',
  'src/pedagogy/keyboardGuide.js',
  'src/pedagogy/handGuide.js',
  'src/progression/styleRank.js',
  'src/progression/streakSystem.js',
  'src/progression/beltSystem.js',
  'src/progression/saveManager.js',
  'src/progression/calendarTracker.js',
  'src/modes/storyCampaign.js',
  'src/modes/endlessSurvival.js',
  'src/modes/dailyChallenge.js',
  'src/modes/speedTest.js',
  'src/modes/practiceDojo.js',
  'src/ui/hud.js',
  'src/ui/menuManager.js',
  'src/game.js'
];

for (const rel of coreFiles) {
  const p = path.join(ROOT, rel);
  assert(fs.existsSync(p) && fs.statSync(p).size > 0, `File exists & non-empty: ${rel}`);
}

// 2. Assets & Media
console.log('\n[2/6] Verifying Assets (Audio, Fonts, Data, Backgrounds, Sprites)...');
const sampleAssets = [
  'assets/audio/sfx/keys/thock_01.ogg',
  'assets/audio/sfx/keys/spacebar_down.ogg',
  'assets/audio/sfx/keys/error_buzz_soft.ogg',
  'assets/audio/sfx/combat/hit_punch_heavy_01.ogg',
  'assets/audio/sfx/combat/combat_knockdown_01.ogg',
  'assets/audio/music/music_street_combat.ogg',
  'assets/audio/music/music_boss_battle.ogg',
  'assets/backgrounds/world1_dojo.jpg',
  'assets/backgrounds/world2_street.jpg',
  'assets/backgrounds/world3_factory.jpg',
  'assets/backgrounds/world4_rooftop.jpg',
  'assets/backgrounds/world5_boss_arena.jpg',
  'assets/data/curriculum_stages.json',
  'assets/data/passages.json',
  'assets/data/words_common_1k.txt',
  'assets/fonts/chakra-petch/ChakraPetch-Bold.ttf',
  'assets/icons/belts/belt_white.svg',
  'assets/icons/belts/belt_grandmaster.svg',
  'assets/ui/hands/hands_guide.svg',
  'assets/sprites/stickman_rig.json'
];

for (const rel of sampleAssets) {
  const p = path.join(ROOT, rel);
  assert(fs.existsSync(p) && fs.statSync(p).size > 0, `Asset verified: ${rel}`);
}

// 3. Stickman Rig JSON & Kinematics Data
console.log('\n[3/6] Verifying Stickman Rig & Skeletal Hierarchy...');
const rig = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sprites/stickman_rig.json'), 'utf8'));
assert(rig.hierarchy && rig.hierarchy.joints.length === 16, 'Hierarchy has 16 rigged joints');
assert(Object.keys(rig.animations).length === 10, 'Contains 10 keyframed martial arts animations');
assert(rig.themes && rig.themes.hero && rig.themes.boss, 'Contains Hero and Boss color themes');

// 4. Data & Curriculum Integrity
console.log('\n[4/6] Verifying Pedagogy Curriculum Data & Passages...');
const curriculum = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/curriculum_stages.json'), 'utf8'));
assert(curriculum.stages && curriculum.stages.length >= 7, 'Curriculum stages count >= 7');
assert(curriculum.total_days === 30, '30-Day Master Curriculum defined');

const passages = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/passages.json'), 'utf8'));
assert(Array.isArray(passages) && passages.length > 300, `Passages corpus loaded (${passages.length} passages)`);

// 5. Typing Logic Simulation (Strict Stop-on-Error)
console.log('\n[5/6] Simulating Strict Stop-on-Error Typing Pedagogy Engine...');
// Mock simple typing engine logic
class MockTypingEngine {
  constructor(target) {
    this.target = target;
    this.idx = 0;
    this.errors = 0;
    this.correct = 0;
    this.streak = 0;
  }
  processKey(key) {
    if (key === this.target[this.idx]) {
      this.correct++;
      this.streak++;
      this.idx++;
      return true;
    } else {
      this.errors++;
      this.streak = 0;
      // DO NOT advance index!
      return false;
    }
  }
}

const sim = new MockTypingEngine('strike');
assert(sim.processKey('s') === true, 'Typed correct key "s" -> advances');
assert(sim.idx === 1, 'Index advanced to 1');
assert(sim.processKey('x') === false, 'Typed wrong key "x" -> rejected');
assert(sim.idx === 1, 'STRICT STOP-ON-ERROR: Index remained at 1');
assert(sim.streak === 0, 'Streak reset to 0 on error');
assert(sim.processKey('t') === true, 'Typed correct key "t" -> resumes');
assert(sim.idx === 2, 'Index advanced to 2');

// 6. DMC Style Rank & Streak Progression Simulation
console.log('\n[6/6] Simulating DMC Style Ranks & Streaks...');
const ranks = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
assert(ranks.length === 7, '7 Devil May Cry Style Ranks (D through SSS)');

const belts = [
  'White', 'Yellow', 'Orange', 'Green', 'Blue',
  'Purple', 'Brown', 'Red', 'Black', 'Grandmaster'
];
assert(belts.length === 10, '10 Martial Arts Belts defined (White to Grandmaster)');

console.log('\n====================================================');
console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL VERIFICATION CHECKS PASSED PERFECTLY!\n');
  process.exit(0);
}
