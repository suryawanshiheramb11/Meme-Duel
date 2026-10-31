// Meme Duel - the store: accessories your fighter wears, bought with coins earned from matches.
// Everything is stored in this browser (localStorage); there is no account.
export const ACCESSORIES = [
  // slot 'head' replaces the default cap
  { id: 'headband', slot: 'head', name: 'Red Headband', price: 0, blurb: 'Rising-sun red, tails flying.' },
  { id: 'ninja', slot: 'head', name: 'Ninja Band', price: 120, blurb: 'Black cloth, no questions asked.' },
  { id: 'headphones', slot: 'head', name: 'Headphones', price: 180, blurb: 'Fights are better with a soundtrack.' },
  { id: 'party', slot: 'head', name: 'Party Hat', price: 150, blurb: 'Every fight is a celebration.' },
  { id: 'cowboy', slot: 'head', name: 'Cowboy Hat', price: 200, blurb: 'This town is big enough for one typist.' },
  { id: 'tophat', slot: 'head', name: 'Top Hat', price: 250, blurb: 'Fights with dignity.' },
  { id: 'halo', slot: 'head', name: 'Halo', price: 300, blurb: 'Innocent. Allegedly.' },
  { id: 'crown', slot: 'head', name: 'Gold Crown', price: 400, blurb: 'For the champion.' },
  // slot 'face'
  { id: 'mustache', slot: 'face', name: 'Mustache', price: 60, blurb: 'Instant authority.' },
  { id: 'nerd', slot: 'face', name: 'Round Glasses', price: 80, blurb: 'Technically a keyboard expert.' },
  { id: 'eyepatch', slot: 'face', name: 'Eye Patch', price: 90, blurb: 'Lost it in a typing contest.' },
  { id: 'shades', slot: 'face', name: 'Shades', price: 100, blurb: 'Deal with it.' },
  { id: 'monocle', slot: 'face', name: 'Monocle', price: 140, blurb: 'Quite so.' }
];

const BY_ID = Object.fromEntries(ACCESSORIES.map((a) => [a.id, a]));
const KEY = 'memeDuel.locker';
const START_COINS = 150;

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v && typeof v === 'object') return v;
  } catch (e) {
    /* fall through to a fresh locker */
  }
  return null;
}

function write(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    /* private mode: purchases last until the tab closes */
  }
}

let state = null;
function load() {
  if (state) return state;
  const saved = read() || {};
  state = {
    coins: Number.isFinite(saved.coins) ? saved.coins : START_COINS,
    owned: Array.isArray(saved.owned) ? saved.owned.filter((id) => BY_ID[id]) : [],
    equipped: { head: null, face: null, ...(saved.equipped || {}) }
  };
  if (!state.owned.includes('headband')) state.owned.push('headband');
  ['head', 'face'].forEach((slot) => {
    const id = state.equipped[slot];
    if (id && (!BY_ID[id] || BY_ID[id].slot !== slot || !state.owned.includes(id))) state.equipped[slot] = null;
  });
  return state;
}

export const getCoins = () => load().coins;
export const isOwned = (id) => load().owned.includes(id);
export const getEquipped = () => ({ ...load().equipped });
export const isValidGear = (g) =>
  !!g && ['head', 'face'].every((slot) => g[slot] == null || (BY_ID[g[slot]] && BY_ID[g[slot]].slot === slot));

// The gear object the renderer wants: { head, face } or null when nothing is worn
export function currentGear() {
  const e = load().equipped;
  return e.head || e.face ? { head: e.head, face: e.face } : null;
}

export function addCoins(n) {
  const s = load();
  s.coins += Math.max(0, Math.round(n));
  write(s);
  return s.coins;
}

export function buy(id) {
  const s = load();
  const item = BY_ID[id];
  if (!item || s.owned.includes(id)) return false;
  if (s.coins < item.price) return false;
  s.coins -= item.price;
  s.owned.push(id);
  write(s);
  return true;
}

/** Wear an owned item; wearing the item that is already on takes it off. */
export function toggleEquip(id) {
  const s = load();
  const item = BY_ID[id];
  if (!item || !s.owned.includes(id)) return false;
  s.equipped[item.slot] = s.equipped[item.slot] === id ? null : id;
  write(s);
  return true;
}
