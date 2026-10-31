// Meme Duel - tactical mode buffs. Their strength depends on the state of the fight: how much health
// you have left (selfFrac) and how much your opponent has (foeFrac), both 0-1. The same rules apply to
// the player and to the bot, so a buff is worth the most exactly when it is the smart play.
export const DURATION = 12;

export const BUFF_NAMES = { attack: 'ATTACK', defense: 'DEFENSE', health: 'HEALTH' };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * attack  : bonus damage. Bigger against a healthy opponent (more to chew through) and when you are behind.
 * defense : share of incoming damage removed. Bigger the more hurt you are, and when the opponent is strong.
 * health  : share of max health restored. Small when you are healthy, large when you are about to lose.
 */
export function buffValue(kind, selfFrac, foeFrac) {
  const s = clamp(selfFrac, 0, 1);
  const f = clamp(foeFrac, 0, 1);
  if (kind === 'attack') return clamp(0.35 + 0.3 * f + 0.25 * (1 - s), 0.35, 0.9);
  if (kind === 'defense') return clamp(0.3 + 0.25 * (1 - s) + 0.1 * f, 0.3, 0.65);
  return clamp(0.15 + 0.35 * (1 - s), 0.15, 0.5);
}

export function describeBuff(kind, value) {
  const pct = Math.round(value * 100);
  if (kind === 'attack') return `+${pct}% damage for ${DURATION} s`;
  if (kind === 'defense') return `-${pct}% damage taken for ${DURATION} s`;
  return `Heal ${pct}% of your health`;
}

/** Which buff the bot should play, given both health fractions and whether the player is buffed. */
export function botBuffWeights(botFrac, heroFrac, heroAttackActive) {
  return {
    attack: 1 + (1 - heroFrac) * 2.5 + (botFrac > 0.6 ? 0.6 : 0),
    defense: 1 + (heroAttackActive ? 2.5 : 0) + (1 - botFrac) * 1.2,
    health: botFrac < 0.75 ? 0.3 + (1 - botFrac) * 5 : 0.1
  };
}
