// Meme Duel - arena picker shared by the start screen and the online lobby.
// The arena you choose is fixed for the whole match and remembered for next time.
import { ARENAS } from '../render/arenas/arenaManager.js';

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
