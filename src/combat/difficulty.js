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
  ultra: { windup: 0,    pose: 'slam',  dmg: 3.2, knock: 2.2,  stun: 0.7,  reach: 2.4, tell: 'DODGE!', unblockable: true }
};

export const DIFFICULTIES = {
  easy: {
    label: 'EASY',
    name: 'CHILL BOT',
    blurb: 'Slow, clearly telegraphed attacks and a soft punch. Learn the moves in peace.',
    enemyHp: 0.7, // multiplier on enemy health
    damage: 3, // damage per enemy strike
    windup: 0.55, // seconds the enemy telegraphs before hitting
    attackWeights: { punch: 1 }, // which attacks it throws, and how often
    ultra: null, // unblockable shockwave: { every: [min, max] seconds, windup }
    guardChance: 0, // chance it blocks one of your plain strikes
    readsLauncher: 0, // chance it sidesteps your air launcher
    pokesDashIn: 0, // chance it counter-pokes when you dash in
    adaptive: false, // blocks more as your combo grows
    cooldown: [5.5, 8], // gap between attacks while you keep typing
    idleCooldown: [4, 6], // gap between attacks when you stall
    speed: 2.0, // enemy walk speed
    counterOnTypo: 0, // chance a typo triggers an instant counter
    doubleStrike: 0, // chance of a second hit right after the first
    dodge: 0, // chance the enemy sidesteps one of your strikes
    mercy: true, // idling can never finish you off
    heroRegen: 8, // hero health regained per second when not being hit
    score: 0.8 // score multiplier
  },
  medium: {
    label: 'MEDIUM',
    name: 'KEYBOARD WARRIOR',
    blurb: 'A fair fight. Punishes typos some of the time and expects you to dodge.',
    enemyHp: 1,
    damage: 5,
    windup: 0.3,
    attackWeights: { jab: 2, punch: 2, heavy: 1, sweep: 1 },
    ultra: { every: [34, 50], windup: 1.15 },
    guardChance: 0.1,
    readsLauncher: 0.15,
    pokesDashIn: 0.2,
    adaptive: true,
    cooldown: [3, 4.8],
    idleCooldown: [2.2, 3.4],
    speed: 2.7,
    counterOnTypo: 0.5,
    doubleStrike: 0,
    dodge: 0,
    mercy: true,
    heroRegen: 5,
    score: 1
  },
  hard: {
    label: 'HARD',
    name: 'FINAL BOSS',
    blurb: 'Fast, tanky and ruthless. Counters every typo, double-hits, and dodges some of your strikes.',
    enemyHp: 1.5,
    damage: 8,
    windup: 0.2,
    attackWeights: { jab: 3, punch: 2, heavy: 2, sweep: 2 },
    ultra: { every: [13, 21], windup: 0.95 },
    guardChance: 0.28,
    readsLauncher: 0.55,
    pokesDashIn: 0.65,
    adaptive: true,
    cooldown: [1.6, 2.8],
    idleCooldown: [1.1, 1.9],
    speed: 3.4,
    counterOnTypo: 1,
    doubleStrike: 0.35,
    dodge: 0.12,
    mercy: false,
    heroRegen: 3,
    score: 1.6
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
