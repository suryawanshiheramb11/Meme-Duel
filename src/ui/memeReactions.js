// Meme Duel - meme reaction player.
// Pops a TV-style meme clip (with sound) over the fight when something fitting happens:
// a KO gets laughter, a typo gets "I am sorry", a power-up gets a hype clip, and so on.
// Clips and their situation tags come from assets/memes/manifest.json
// (built by `npm run fetch:memes`). If the manifest is missing the game just runs without memes.

// minimum gap between popups, and a multiplier on every trigger's chance, per frequency setting
const FREQUENCY = {
  off:    { gap: Infinity, chance: 0 },
  low:    { gap: 14000, chance: 0.5 },
  normal: { gap: 7000, chance: 1 },
  chaos:  { gap: 2500, chance: 1.6 }
};
const STORAGE_KEY = 'memeDuel.memes';

// How long a reaction (not a typed phrase's own meme) may hold the game frozen
const REACTION_FREEZE_SECONDS = 3.5;

// Caption stamped on the popup so the joke lands even before the clip's audio does
const CAPTIONS = {
  ko: ['SKILL ISSUE', 'GG EZ', 'NOT EVEN CLOSE', 'SEE YOU NEVER'],
  laugh: ['LMAOOO', 'HE REALLY DID THAT'],
  typo: ['SKILL ISSUE', 'TYPO MOMENT', 'FAT FINGERS', 'BRUH'],
  hurt: ['BRUH', 'THAT HAD TO HURT', 'OOF'],
  powerup: ['POWERING UP', 'MAIN CHARACTER MOMENT'],
  slam: ['BONK', 'SENT TO THE SHADOW REALM'],
  beam: ['NO WAY', 'IT\'S OVER', 'DELETED'],
  hype: ['UNSTOPPABLE', 'LOCKED IN'],
  praise: ['W', 'CLEAN', 'NICE ONE'],
  idle: ['HELLO??', 'TYPE SOMETHING', 'ANYONE HOME?'],
  enter: ['HERE COMES ANOTHER', 'NEW CHALLENGER'],
  timeskip: ['MEANWHILE...', 'LATER...'],
  launch: ['UP YOU GO', 'AIRMAIL'],
  dodge: ['CAN\'T TOUCH THIS', 'MATRIX MOMENT'],
  rage: ['ANGRY TYPING', 'HE SNAPPED'],
  intro: ['MEME DUEL'],
  misc: ['MEME']
};
const RECENT_MEMORY = 8; // don't replay a clip heard in the last N popups

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

export class MemeReactions {
  constructor(container, audioSystem) {
    this.audio = audioSystem;
    const saved = loadSettings();
    this.frequency = FREQUENCY[saved.frequency] ? saved.frequency : 'normal';
    // 'all': every meme is a cutscene that stops the game. 'big': only phrase memes and big
    // moments. 'off': memes are just a corner popup and the fight carries on.
    this.freezeMode = ['all', 'big', 'off'].includes(saved.freeze) ? saved.freeze : 'all';
    this.frozen = false;
    this.volume = typeof saved.volume === 'number' ? saved.volume : 0.8;

    this.clips = [];
    this.pools = {};
    this.bags = {};
    this.recent = [];
    this.current = null; // { priority, timer }
    this.lastEnd = 0;
    this.musicBase = null; // the real music volume, held while clips duck it
    this.restoreTimer = null;
    this.prefetched = new Set();
    this.playId = 0; // identifies the current play attempt so a stale failure can't mute a newer clip
    this.stats = { played: 0, skipped: 0 };

    this.buildDom(container);
    this.loaded = this.loadManifest(); // resolves once clips are known (or failed)
  }

  buildDom(container) {
    this.root = document.createElement('div');
    this.root.id = 'meme-tv';
    this.root.innerHTML = `
      <div class="meme-tv-frame">
        <video id="meme-video" playsinline preload="auto"></video>
        <div class="meme-tv-scan"></div>
        <span class="meme-tv-badge">MEME</span>
        <span class="meme-tv-skip">SPACE or click to skip</span>
      </div>`;
    container.appendChild(this.root);

    // Dims the frozen fight behind a cutscene; clicking it skips
    this.dim = document.createElement('div');
    this.dim.id = 'meme-dim';
    this.dim.addEventListener('click', () => this.skip());
    container.appendChild(this.dim);

    // Capture phase so skipping never leaks a keystroke into the typing game or the menu
    window.addEventListener(
      'keydown',
      (e) => {
        if (this.frozen && ['Space', 'Enter', 'Escape'].includes(e.code)) {
          e.preventDefault();
          e.stopPropagation();
          this.skip();
        }
      },
      true
    );
    this.video = this.root.querySelector('video');
    this.badge = this.root.querySelector('.meme-tv-badge');
    this.video.addEventListener('ended', () => this.finish());
    this.video.addEventListener('error', () => this.finish());
  }

  async loadManifest() {
    try {
      const res = await fetch('assets/memes/manifest.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { clips } = await res.json();
      this.clips = clips.filter((c) => c && c.file);
      // "misc" is the catch-all: every clip is in it. It must be its own array, not an alias
      // of this.clips, or tagging a clip "misc" would append to the list being iterated.
      this.pools = { misc: [...this.clips] };
      for (const clip of this.clips) {
        for (const tag of clip.tags || []) {
          if (tag === 'misc') continue;
          (this.pools[tag] = this.pools[tag] || []).push(clip);
        }
      }
    } catch (e) {
      console.warn('Meme clips unavailable (run `npm run fetch:memes`):', e.message);
    }
  }

  get ready() {
    return this.clips.length > 0;
  }

  // Lets the input manager treat a running cutscene like an open menu (keys are ignored)
  get isOpen() {
    return this.frozen;
  }

  skip() {
    if (this.frozen) this.finish();
  }

  setFreezeMode(mode) {
    if (!['all', 'big', 'off'].includes(mode)) return;
    this.freezeMode = mode;
    this.save();
  }

  // Should a reaction of this kind stop the game?
  wantsFreeze(tag, priority) {
    if (this.freezeMode === 'off') return false;
    if (this.freezeMode === 'big') return priority >= 3;
    return tag !== 'idle'; // nothing is happening while idle, so a freeze would add nothing
  }

  setFrequency(level) {
    if (!FREQUENCY[level]) return;
    this.frequency = level;
    if (level === 'off') this.hide(true);
    this.save();
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    this.video.volume = this.volume;
    this.save();
  }

  save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ frequency: this.frequency, volume: this.volume, freeze: this.freezeMode })
      );
    } catch (e) {
      /* private mode: settings just don't persist */
    }
  }

  /**
   * Ask for a reaction.
   * tag      situation (ko, laugh, typo, hurt, powerup, slam, beam, hype, praise, idle, enter, timeskip, ...)
   * priority 1 ambient, 2 notable, 3 big moment (can interrupt a lower-priority clip)
   * chance   0-1 probability this trigger fires at all (scaled by the frequency setting)
   * side     'left' for things happening to the hero, 'right' for the enemy
   * force    skip chance and cooldown (previews, intro)
   * noFreeze keep it a corner popup even when memes normally stop the game
   */
  trigger(tag, { priority = 1, chance = 1, side = 'right', force = false, noFreeze = false } = {}) {
    if (!this.ready || (this.frequency === 'off' && !force)) return false;
    const now = performance.now();
    const freq = FREQUENCY[this.frequency];

    if (this.current && !force) {
      // A higher priority always cuts in. A big moment (3) may also replace another big
      // moment's clip once that one has had a second and a half on screen.
      const age = now - this.current.startedAt;
      const outranks = priority > this.current.priority;
      const bigReplacesBig = priority >= 3 && priority === this.current.priority && age > 1500;
      if (!outranks && !bigReplacesBig) {
        this.stats.skipped++;
        return false;
      }
    }
    // Big moments (KO, power-up, beam) always get their clip; smaller ones respect the cooldown
    const gap = priority >= 3 ? 0 : freq.gap;
    if (!force && !this.current && now - this.lastEnd < gap) {
      this.stats.skipped++;
      return false;
    }
    if (!force && Math.random() > Math.min(1, chance * freq.chance)) {
      this.stats.skipped++;
      return false;
    }

    const clip = this.pick(tag);
    if (!clip) return false;
    this.play(clip, {
      priority,
      side,
      tag,
      cutscene: !noFreeze && this.wantsFreeze(tag, priority),
      maxSeconds: REACTION_FREEZE_SECONDS
    });
    return true;
  }

  // Fetch clips into the HTTP cache so they start instantly. Skipped on data-saver connections.
  prefetch(files) {
    const conn = navigator.connection;
    if (conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''))) return;
    for (const file of files) {
      if (this.prefetched.has(file)) continue;
      this.prefetched.add(file);
      fetch(`assets/memes/${file}`, { cache: 'force-cache', priority: 'low' }).catch(() => this.prefetched.delete(file));
    }
  }

  // After the first seconds of play, quietly pull in the remaining clips one at a time.
  prefetchAllWhenIdle() {
    const queue = this.clips.map((c) => c.file).filter((f) => !this.prefetched.has(f));
    const next = () => {
      if (!queue.length) return;
      this.prefetch([queue.shift()]);
      setTimeout(next, 450);
    };
    setTimeout(next, 4000);
  }

  // Play one specific clip (the meme whose catchphrase was just typed), captioned with it.
  // onEnd runs when the clip finishes, is skipped or is replaced (a special move waits on it).
  playClip(clip, { side = 'right', priority = 3, caption, onEnd } = {}) {
    if (!this.ready || this.frequency === 'off') return false;
    this.recent.push(clip.file);
    if (this.recent.length > RECENT_MEMORY) this.recent.shift();
    this.play(clip, { priority, side, tag: 'misc', caption, cutscene: this.freezeMode !== 'off', onEnd });
    return true;
  }

  // Shuffle-bag per tag, skipping clips heard recently so it doesn't feel repetitive.
  pick(tag) {
    const pool = this.pools[tag] && this.pools[tag].length ? this.pools[tag] : this.pools.misc;
    if (!pool || !pool.length) return null;
    let bag = this.bags[tag];
    if (!bag || !bag.length) {
      bag = this.bags[tag] = [...pool].sort(() => Math.random() - 0.5);
    }
    let idx = bag.findIndex((c) => !this.recent.includes(c.file));
    if (idx < 0) idx = 0;
    const [clip] = bag.splice(idx, 1);
    this.recent.push(clip.file);
    if (this.recent.length > RECENT_MEMORY) this.recent.shift();
    return clip;
  }

  play(clip, { priority, side, tag = 'misc', caption, cutscene = false, maxSeconds = 6, onEnd = null }) {
    if (this.current) this.hide(true);
    const v = this.video;
    v.muted = false;
    v.volume = this.volume;
    v.src = `assets/memes/${clip.file}`;
    v.currentTime = 0;

    const captions = CAPTIONS[tag] || CAPTIONS.misc;
    this.badge.textContent = caption || captions[Math.floor(Math.random() * captions.length)];
    this.root.className = `show side-${side} prio-${priority}${cutscene ? ' cutscene' : ''}`;
    this.frozen = cutscene;
    document.body.classList.toggle('meme-frozen', cutscene);
    // retrigger the pop-in animation when swapping clips
    void this.root.offsetWidth;

    const length = Math.min(clip.duration || 5, cutscene ? maxSeconds : 6);
    const limit = (length + 0.6) * 1000;
    this.current = { priority, onEnd, startedAt: performance.now(), timer: setTimeout(() => this.finish(), limit) };
    this.stats.played++;
    this.duckMusic(true);

    const id = ++this.playId;
    const started = v.play();
    if (started && started.catch) {
      started.catch((err) => {
        // A newer clip took over (or this one was cancelled): nothing to recover.
        if (id !== this.playId || (err && err.name === 'AbortError')) return;
        // Sound blocked (no user gesture yet): fall back to a silent popup rather than nothing.
        v.muted = true;
        const retry = v.play();
        if (retry && retry.catch) retry.catch(() => id === this.playId && this.finish());
      });
    }
  }

  finish() {
    if (!this.current) return;
    this.hide(false);
  }

  hide(immediate) {
    const done = this.current;
    if (done) clearTimeout(done.timer);
    this.current = null;
    this.lastEnd = performance.now();
    this.frozen = false;
    document.body.classList.remove('meme-frozen');
    this.root.classList.remove('show', 'cutscene');
    this.video.pause();
    if (immediate) this.video.removeAttribute('src');
    this.duckMusic(false);
    // Whatever was waiting on this clip (a special move) goes now
    if (done && done.onEnd) done.onEnd();
  }

  // Dip the background music while a clip speaks so the audio stays intelligible.
  // The real volume is remembered once and only forgotten after the music has fully recovered,
  // so back-to-back clips can't mistake a half-ducked level for the normal one.
  duckMusic(on) {
    const gain = this.audio && this.audio.musicGain;
    if (!gain || !this.audio.ctx) return;
    const t = this.audio.ctx.currentTime;
    if (on) {
      clearTimeout(this.restoreTimer);
      if (this.musicBase === null) this.musicBase = gain.gain.value;
      gain.gain.setTargetAtTime(this.musicBase * 0.25, t, 0.05);
    } else if (this.musicBase !== null) {
      gain.gain.setTargetAtTime(this.musicBase, t, 0.25);
      this.restoreTimer = setTimeout(() => {
        this.musicBase = null;
      }, 1500);
    }
  }
}
