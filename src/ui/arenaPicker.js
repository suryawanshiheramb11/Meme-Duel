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

const SELECT_SECONDS = 7;

/**
 * Full-screen arena choice shown before a solo fight. Click an arena to lock it in;
 * if nothing is picked when the countdown ends, a random one is used.
 */
export function showArenaSelect(container, arenaManager, onDone, seconds = SELECT_SECONDS) {
  const keys = Object.keys(ARENAS).filter((k) => ARENAS[k].file);
  const root = document.createElement('div');
  root.id = 'arena-select';
  root.innerHTML = `
    <div class="as-wrap">
      <h2 class="as-title">CHOOSE YOUR ARENA</h2>
      <p class="as-sub">No pick? A random arena is chosen in <b class="as-count">${seconds}</b>s</p>
      <div class="as-bar"><span></span></div>
    </div>`;
  const picker = createArenaPicker(arenaManager, { label: 'Click an arena to fight there' });
  root.querySelector('.as-wrap').insertBefore(picker, root.querySelector('.as-bar'));
  container.appendChild(root);

  const count = root.querySelector('.as-count');
  const bar = root.querySelector('.as-bar span');
  bar.style.animationDuration = `${seconds}s`;
  let done = false;
  let left = seconds;

  const finish = (key) => {
    if (done) return;
    done = true;
    clearInterval(tick);
    window.removeEventListener('keydown', onKey, true);
    if (key) {
      arenaManager.switchArena(key);
      saveArena(key);
    }
    root.classList.add('closing');
    setTimeout(() => root.remove(), 350);
    onDone();
  };

  const tick = setInterval(() => {
    left -= 1;
    count.textContent = Math.max(left, 0);
    if (left <= 0) finish(keys[Math.floor(Math.random() * keys.length)]);
  }, 1000);

  picker.querySelectorAll('.ap-btn').forEach((btn) =>
    btn.addEventListener('click', () => setTimeout(() => finish(btn.dataset.arena), 450))
  );

  // swallow keys so nothing leaks into the typing game underneath
  const onKey = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener('keydown', onKey, true);
}
