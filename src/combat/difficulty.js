// Meme Duel - bot difficulty levels.
// Every number the enemy AI and scoring read lives here so a level is one table row.
export const DIFFICULTIES = {
  easy: {
    label: 'EASY',
    name: 'CHILL BOT',
    blurb: 'Slow, clearly telegraphed attacks and a soft punch. Learn the moves in peace.',
    enemyHp: 0.7, // multiplier on enemy health
    damage: 3, // damage per enemy strike
    windup: 0.55, // seconds the enemy telegraphs before hitting
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
