// Meme Duel - bot difficulty levels and the bot's moveset.
// Every number the enemy AI and scoring read lives here so a level is one table row.

// What the bot can throw. windup is a multiplier on the level's telegraph time (ultra has its own).
//  jab    fast and light, little warning
//  punch  the standard swing
//  heavy  long warning, big damage and knockback; a guard only halves it
//  sweep  low kick: JUMP (up arrow) over it, or dodge with Tab
//  ultra  unblockable shockwave with a red warning ring: dodge with Tab or time a jump
export const ATTACKS = {
  jab:   { windup: 0.55, pose: 'jab',   dmg: 0.7, knock: 0.25, stun: 0.2,  reach: 1.55 },
  punch: { windup: 1,    pose: 'punch', dmg: 1,   knock: 0.5,  stun: 0.3,  reach: 1.65 },
  heavy: { windup: 1.9,  pose: 'kick',  dmg: 1.8, knock: 1.4,  stun: 0.45, reach: 1.7, tell: 'HEAVY!', guard: 0.55 },
  sweep: { windup: 1.1,  pose: 'kick',  dmg: 1.1, knock: 0.6,  stun: 0.35, reach: 1.9, tell: 'JUMP!', low: true },
  ultra: { windup: 0,    pose: 'slam',  dmg: 3.2, knock: 2.2,  stun: 0.7,  reach: 2.4, tell: 'DODGE!', unblockable: true },
  // Moves the smarter levels pull out when they read your habits:
  //  grab   beats a player who turtles behind guard. Unblockable, but it's on the ground: jump it or Tab it
  //  anti   an anti-air uppercut for a player who keeps jumping
  //  meme   a thrown meme TV across the arena: jump it, guard it or Tab through it
  grab:  { windup: 1.35, pose: 'launcher', dmg: 1.4, knock: 0.2, stun: 0.5, reach: 1.35, tell: 'GRAB!', unblockable: true, low: true, launch: 7 },
  anti:  { windup: 0.55, pose: 'launcher', dmg: 1.3, knock: 0.3, stun: 0.5, reach: 2.1,  tell: 'ANTI-AIR!', antiAir: true, launch: 7 },
  meme:  { windup: 1.2,  pose: 'punch',    dmg: 1,   knock: 0.5, stun: 0.3, reach: 0,    tell: 'MEME!', projectile: true }
};

// Each new bot rolls a personality, so two fights on the same level don't play the same.
// (Easy bots are always plain "balanced".)
export const PERSONALITIES = {
  balanced:   { label: '' },
  aggressive: { label: 'AGGRESSIVE', cooldownMul: 0.75, windupMul: 0.9, speedMul: 1.15, guardMul: 0.6 },
  defensive:  { label: 'DEFENSIVE', cooldownMul: 1.2, guardMul: 1.5, parryMul: 2, readsMul: 1.3 },
  trickster:  { label: 'TRICKSTER', feintAdd: 0.12, memeMul: 0.7, doubleAdd: 0.1, pokeMul: 1.3 }
};

// The level's table with a personality applied on top. Returns a fresh object; the base is never mutated.
export function withPersonality(base, key) {
  const p = PERSONALITIES[key] || PERSONALITIES.balanced;
  const out = { ...base, personality: key, personalityLabel: p.label };
  const mulRange = (r, m) => (m ? [r[0] * m, r[1] * m] : r);
  out.cooldown = mulRange(base.cooldown, p.cooldownMul);
  out.idleCooldown = mulRange(base.idleCooldown, p.cooldownMul);
  if (p.windupMul) out.windup = base.windup * p.windupMul;
  if (p.speedMul) out.speed = base.speed * p.speedMul;
  if (p.guardMul) out.guardChance = Math.min(0.6, base.guardChance * p.guardMul);
  if (p.readsMul) out.readsLauncher = Math.min(0.9, base.readsLauncher * p.readsMul);
  if (p.pokeMul) out.pokesDashIn = Math.min(0.9, base.pokesDashIn * p.pokeMul);
  if (p.doubleAdd && base.smart) out.doubleStrike = Math.min(0.6, base.doubleStrike + p.doubleAdd);
  if (base.smart) {
    out.smart = { ...base.smart };
    if (p.feintAdd) out.smart.feint = Math.min(0.5, base.smart.feint + p.feintAdd);
    if (p.parryMul) out.smart.parry = Math.min(0.5, base.smart.parry * p.parryMul);
    if (p.memeMul && base.smart.meme) out.smart.meme = { ...base.smart.meme, every: mulRange(base.smart.meme.every, p.memeMul) };
  }
  return out;
}

// The rules for a human-vs-human duel: no bot behaviours at all, even footing
export const VERSUS = {
  label: 'VERSUS', name: 'PLAYER 2', blurb: '', enemyHp: 1, damage: 0, windup: 1, attackWeights: {}, ultra: null,
  guardChance: 0, readsLauncher: 0, pokesDashIn: 0, adaptive: false, cooldown: [9, 9], idleCooldown: [9, 9],
  speed: 2.6, counterOnTypo: 0, doubleStrike: 0, dodge: 0, mercy: false, heroRegen: 0, score: 1, smart: null
};

export const DIFFICULTIES = {
  easy: {
    label: 'EASY',
    name: 'KEYBOARD WARRIOR',
    blurb: 'Used to be the final boss. Fast, double-hits, counters your typos and dodges some strikes.',
    enemyHp: 1.2, // multiplier on enemy health
    damage: 8, // damage per enemy strike
    windup: 0.2, // seconds the enemy telegraphs before hitting
    attackWeights: { jab: 3, punch: 2, heavy: 2, sweep: 2 }, // which attacks it throws, and how often
    ultra: { every: [13, 21], windup: 0.95 }, // unblockable shockwave
    guardChance: 0.28, // chance it blocks one of your plain strikes
    readsLauncher: 0.55, // chance it sidesteps your air launcher
    pokesDashIn: 0.65, // chance it counter-pokes when you dash in
    adaptive: true, // blocks more as your combo grows
    smart: { habits: true, chain: 3, chainChance: 0.55, feint: 0.15, parry: 0.18, rage: true, meme: { every: [11, 17], windup: 0.85 } },
    cooldown: [1.6, 2.8], // gap between attacks while you keep typing
    idleCooldown: [1.1, 1.9], // gap between attacks when you stall
    speed: 3.4, // enemy walk speed
    counterOnTypo: 1, // chance a typo triggers an instant counter
    doubleStrike: 0.35, // chance of a second hit right after the first
    dodge: 0.12, // chance the enemy sidesteps one of your strikes
    dodgeCd: 1.6, // seconds between dodges
    dodgeSpeed: 30, // how fast the sidestep is
    counterAfterDodge: 0.15, // chance to hit back right after a dodge
    avoidSpecial: 0.1, // chance to read and evade your special move
    mercy: false,
    heroRegen: 3, // hero health regained per second when not being hit
    score: 1.2 // score multiplier
  },
  medium: {
    label: 'MEDIUM',
    name: 'MIND READER',
    blurb: 'Reads your rhythm, sidesteps strings of hits and hits back the moment you miss. Evades some specials.',
    enemyHp: 1.7,
    damage: 9,
    windup: 0.14,
    attackWeights: { jab: 3, punch: 3, heavy: 2, sweep: 2 },
    ultra: { every: [9, 15], windup: 0.8 },
    guardChance: 0.38,
    readsLauncher: 0.7,
    pokesDashIn: 0.8,
    adaptive: true,
    smart: { habits: true, chain: 3, chainChance: 0.7, feint: 0.22, parry: 0.26, rage: true, meme: { every: [8, 13], windup: 0.7 } },
    cooldown: [1.1, 2.0],
    idleCooldown: [0.8, 1.4],
    speed: 3.9,
    counterOnTypo: 1,
    doubleStrike: 0.45,
    dodge: 0.3,
    dodgeCd: 0.8,
    dodgeSpeed: 38,
    counterAfterDodge: 0.4,
    avoidSpecial: 0.35,
    mercy: false,
    heroRegen: 2,
    score: 2
  },
  hard: {
    label: 'HARD',
    name: 'OMNISCIENT',
    blurb: 'Predicts your strikes, dodges at lightning speed, slips beams and thrown memes, and punishes every opening.',
    enemyHp: 2.2,
    damage: 12,
    windup: 0.1,
    attackWeights: { jab: 3, punch: 3, heavy: 3, sweep: 3 },
    ultra: { every: [6, 11], windup: 0.62 },
    guardChance: 0.5,
    readsLauncher: 0.85,
    pokesDashIn: 0.95,
    adaptive: true,
    smart: { habits: true, chain: 4, chainChance: 0.85, feint: 0.3, parry: 0.4, rage: true, meme: { every: [5, 9], windup: 0.55 } },
    cooldown: [0.7, 1.3],
    idleCooldown: [0.5, 0.9],
    speed: 4.6,
    counterOnTypo: 1,
    doubleStrike: 0.6,
    dodge: 0.5,
    dodgeCd: 0.45,
    dodgeSpeed: 48,
    counterAfterDodge: 0.7,
    avoidSpecial: 0.6,
    mercy: false,
    heroRegen: 0,
    score: 3
  }
};

export const DEFAULT_DIFFICULTY = 'medium';
const STORAGE_KEY = 'memeDuel.difficulty';

export function loadDifficulty() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return DIFFICULTIES[saved] ? saved : DEFAULT_DIFFICULTY;
  } catch (e) {
    return DEFAULT_DIFFICULTY;
  }
}

export function saveDifficulty(key) {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch (e) {
    /* private mode: just don't remember it */
  }
}

export const randBetween = ([lo, hi]) => lo + Math.random() * (hi - lo);

// Weighted random pick from { name: weight }
export function pickWeighted(weights) {
  const entries = Object.entries(weights);
  let roll = Math.random() * entries.reduce((n, [, w]) => n + w, 0);
  for (const [name, w] of entries) {
    roll -= w;
    if (roll <= 0) return name;
  }
  return entries[0][0];
}
