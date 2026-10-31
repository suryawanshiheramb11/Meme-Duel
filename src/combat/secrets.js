// Meme Duel - secret moves.
//
// Four hidden moves, unlocked by tapping an arrow-key code (a fighting-game "motion"). They aren't
// listed anywhere in the game: the menu's codex shows only a riddle for each until you find it.
// Codes use U / D / L / R for the arrow keys and must be tapped within about two seconds.
export const SECRETS = [
  {
    id: 'konami',
    code: 'UUDDLRLR',
    name: '30 EXTRA LIVES',
    hint: 'A cheat code older than most of the memes in this game. It starts by going up, twice.',
    effect: 'Full heal, two seconds of invulnerability, and Silver Instinct for 15 seconds.',
    cooldown: 50
  },
  {
    id: 'rain',
    code: 'DRDRU',
    name: 'MEME RAIN',
    hint: 'Down, across, down, across... then look up at the sky.',
    effect: 'Fourteen meme cards fall out of the sky onto the bot.',
    cooldown: 25
  },
  {
    id: 'distract',
    code: 'LLRRU',
    name: 'LOOK BEHIND YOU',
    hint: 'Two steps back, two steps forward, then point up: "what is that over there?"',
    effect: 'The bot is distracted for 2.6 seconds and takes 50% more damage.',
    cooldown: 30
  },
  {
    id: 'bullet',
    code: 'DDDU',
    name: 'BULLET TIME',
    hint: 'Duck, duck, duck, then jump. The whole world slows down but you.',
    effect: 'The bot moves at a quarter speed for 3.5 seconds while you act normally.',
    cooldown: 35
  }
];

const STORAGE_KEY = 'memeDuel.secrets';

export function loadFound() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(v) ? v.filter((id) => SECRETS.some((s) => s.id === id)) : [];
  } catch (e) {
    return [];
  }
}

export function saveFound(ids) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch (e) {
    /* private mode: they just have to be found again next visit */
  }
}

// The secret (if any) whose code the recent arrow presses end with
export function matchSecret(sequence) {
  return SECRETS.find((s) => sequence.endsWith(s.code)) || null;
}
