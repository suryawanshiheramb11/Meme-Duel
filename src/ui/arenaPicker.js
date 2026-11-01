// Meme Duel - arena picker shared by the start screen and the online lobby.
// The arena you choose is fixed for the whole match and remembered for next time.
import { ARENAS } from '../render/arenas/arenaManager.js';
import { DIFFICULTIES } from '../combat/difficulty.js';

const KEY = 'memeDuel.arena';

export function loadArena() {
  try {
    const k = localStorage.getItem(KEY);
    return ARENAS[k] ? k : null;
  } catch (e) {
    return null;
  }
}

export function saveArena(key) {
  try {
    localStorage.setItem(KEY, key);
  } catch (e) {
    /* private mode: just not remembered */
  }
}

export function createArenaPicker(arenaManager, { label = 'ARENA' } = {}) {
  const root = document.createElement('div');
  root.className = 'ap';
  root.innerHTML = `
    <p class="ap-label">${label}</p>
    <div class="ap-row">
      ${Object.entries(ARENAS)
        .map(
          ([key, cfg]) => `
        <button type="button" class="ap-btn${key === arenaManager.currentArenaKey ? ' active' : ''}" data-arena="${key}" title="${cfg.name}">
          <span class="ap-thumb" style="${cfg.file ? `background-image:url('${cfg.file}')` : 'background-color:#00ff00'}"></span>
          <span class="ap-name">${cfg.name}</span>
        </button>`
        )
        .join('')}
    </div>`;
  const buttons = [...root.querySelectorAll('.ap-btn')];
  buttons.forEach((btn) =>
    btn.addEventListener('click', () => {
      arenaManager.switchArena(btn.dataset.arena);
      saveArena(btn.dataset.arena);
      buttons.forEach((b) => b.classList.toggle('active', b === btn));
    })
  );
  return root;
}

const SELECT_SECONDS = 8;
const LEVELS = ['easy', 'medium', 'hard'];

/**
 * Pre-fight setup, shown the moment the game opens (no Enter needed anywhere):
 * pick the bot's level and tap an arena to start. If nothing is tapped before the countdown
 * ends, the highlighted level is used with a random arena. Keys: 1-3 level, Enter/Space start now.
 */
export function showMatchSetup(container, arenaManager, { difficulty = 'medium', onDone }, seconds = SELECT_SECONDS) {
  const keys = Object.keys(ARENAS).filter((k) => ARENAS[k].file);
  let level = LEVELS.includes(difficulty) ? difficulty : 'medium';
  const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const root = document.createElement('div');
  root.id = 'arena-select';
  root.innerHTML = `
    <div class="as-wrap">
      <h2 class="as-title">GET READY</h2>
      <div class="as-levels" role="group" aria-label="Bot level">
        ${LEVELS.map((k) => `<button type="button" class="as-lvl as-${k}${k === level ? ' on' : ''}" data-level="${k}">${DIFFICULTIES[k].label}</button>`).join('')}
      </div>
      <p class="as-enter">${touch ? '<b>TAP</b> AN ARENA TO START' : 'PRESS <kbd>ENTER</kbd> TO START'}</p>
      <p class="as-sub">${touch ? 'Tap' : 'Click'} an arena to fight there. No pick? Random arena in <b class="as-count">${seconds}</b>s</p>
      <div class="as-bar"><span></span></div>
      <div class="as-grid">
        ${keys
          .map(
            (k) => `<button type="button" class="as-card" data-arena="${k}">
              <span class="as-thumb" style="background-image:url('${ARENAS[k].file}')"></span>
              <span class="as-name">${ARENAS[k].name}</span>
            </button>`
          )
          .join('')}
      </div>
    </div>`;
  container.appendChild(root);

  const count = root.querySelector('.as-count');
  root.querySelector('.as-bar span').style.animationDuration = `${seconds}s`;
  const lvlBtns = [...root.querySelectorAll('.as-lvl')];
  const setLevel = (k) => {
    level = k;
    lvlBtns.forEach((b) => b.classList.toggle('on', b.dataset.level === k));
  };
  lvlBtns.forEach((b) => b.addEventListener('click', () => setLevel(b.dataset.level)));

  const state = { isOpen: true }; // lets the input manager know to ignore the keyboard
  let left = seconds;
  const finish = (key) => {
    if (!state.isOpen) return;
    state.isOpen = false;
    clearInterval(tick);
    window.removeEventListener('keydown', onKey, true);
    const arena = key || keys[Math.floor(Math.random() * keys.length)];
    arenaManager.switchArena(arena);
    saveArena(arena);
    root.classList.add('closing');
    setTimeout(() => root.remove(), 350);
    onDone(level);
  };
  const tick = setInterval(() => {
    left -= 1;
    count.textContent = Math.max(left, 0);
    if (left <= 0) finish();
  }, 1000);

  root.querySelectorAll('.as-card').forEach((card) =>
    card.addEventListener('click', () => {
      root.querySelectorAll('.as-card').forEach((c) => c.classList.toggle('on', c === card));
      arenaManager.switchArena(card.dataset.arena); // preview behind the overlay
      setTimeout(() => finish(card.dataset.arena), 400);
    })
  );

  const onKey = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const n = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
    if (n >= 0) setLevel(LEVELS[n]);
    else if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat) finish();
  };
  window.addEventListener('keydown', onKey, true);
  return state;
}
