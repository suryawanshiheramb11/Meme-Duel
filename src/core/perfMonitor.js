// Meme Duel - adaptive graphics quality.
// Watches the real frame rate and steps quality down when the device struggles (and back up
// when it has headroom), so the game stays responsive on laptops, phones and cheap GPUs.
// Levels: 2 high, 1 medium, 0 low. Users can also pin High or Low from the menu.
const STORAGE_KEY = 'memeDuel.graphics';
const MODES = ['auto', 'high', 'low'];

export class PerfMonitor {
  constructor({ arena, fx, fighters }) {
    this.arena = arena;
    this.fx = fx;
    this.fighters = fighters;
    this.level = 2;
    this.acc = 0;
    this.frames = 0;
    this.cooldown = 0;
    this.goodWindows = 0;
    this.fps = 60;

    let saved = 'auto';
    try {
      saved = localStorage.getItem(STORAGE_KEY) || 'auto';
    } catch (e) {
      /* private mode */
    }
    this.mode = MODES.includes(saved) ? saved : 'auto';

    // Phones and tablets start one step down; auto mode can raise it if there is headroom
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    this.apply(this.mode === 'low' ? 0 : this.mode === 'high' ? 2 : small ? 1 : 2);
  }

  setMode(mode) {
    if (!MODES.includes(mode)) return;
    this.mode = mode;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (e) {
      /* ignore */
    }
    this.cooldown = 0;
    this.goodWindows = 0;
    if (mode === 'low') this.apply(0);
    else if (mode === 'high') this.apply(2);
  }

  apply(level) {
    this.level = level;
    const dpr = window.devicePixelRatio || 1;
    this.arena.setPixelRatio(level === 2 ? Math.min(dpr, 1.5) : level === 1 ? Math.min(dpr, 1.15) : 1);
    this.fx.setQuality(level);
    this.fighters.forEach((f) => (f.quality = level));
  }

  tick(delta) {
    if (this.mode !== 'auto' || delta > 0.25) return; // ignore tab-switch hiccups
    this.acc += delta;
    this.frames++;
    if (this.acc < 2) return;
    this.fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;
    if (this.cooldown > 0) this.cooldown -= 2;

    if (this.fps < 40 && this.level > 0 && this.cooldown <= 0) {
      this.apply(this.level - 1);
      this.cooldown = 6;
      this.goodWindows = 0;
    } else if (this.fps >= 57) {
      this.goodWindows++;
      if (this.goodWindows >= 4 && this.level < 2 && this.cooldown <= 0) {
        this.apply(this.level + 1);
        this.cooldown = 10;
        this.goodWindows = 0;
      }
    } else {
      this.goodWindows = 0;
    }
  }
}
