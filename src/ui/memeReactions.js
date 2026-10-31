// Meme Duel - meme reaction player.
//
// Memes never stop the fight. Typing, strikes and special moves carry on while a clip plays as
// an overlay floating above the head of whoever it's about: the hero for things you do or that
// happen to you, the bot for things it does. The overlay follows that fighter around, and its
// size is relative to the screen and to how big the moment is (a typed phrase's own meme is the
// largest, a passing reaction the smallest).
//
// Clips and their situation tags come from assets/memes/manifest.json (built by
// `npm run fetch:memes`). If the manifest is missing the game just runs without memes.

// minimum gap between popups, and a multiplier on every trigger's chance, per frequency setting
const FREQUENCY = {
  off:    { gap: Infinity, chance: 0 },
  low:    { gap: 14000, chance: 0.5 },
  normal: { gap: 7000, chance: 1 },
  chaos:  { gap: 2500, chance: 1.6 }
};
const STORAGE_KEY = 'memeDuel.memes';

// Clip height as a fraction of the reference screen size, by how big the moment is.
// A typed phrase's own meme gets "phrase"; reactions use their priority (1 ambient ... 3 big).
const SIZE = { 1: 0.12, 2: 0.16, 3: 0.2, phrase: 0.26 };
const MIN_CLIP_PX = 70;
const MAX_CLIP_PX = 270;
const HUD_TOP_PX = 124; // keep clear of the typing prompt and fight bars at the top

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
    this.volume = typeof saved.volume === 'number' ? saved.volume : 0.8;

    this.clips = [];
    this.pools = {};
    this.bags = {};
    this.recent = [];
    this.current = null; // { priority, side, startedAt, timer }
    this.lastEnd = 0;
    this.musicBase = null; // the real music volume, held while clips duck it
    this.restoreTimer = null;
    this.prefetched = new Set();
    this.playId = 0; // identifies the current play attempt so a stale failure can't mute a newer clip
    this.stage = { project: null, hero: null, enemy: null };
    this.pos = { x: 0, y: 0 };
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
      </div>`;
    container.appendChild(this.root);
    this.video = this.root.querySelector('video');
    this.badge = this.root.querySelector('.meme-tv-badge');
    this.video.addEventListener('ended', () => this.finish());
    this.video.addEventListener('error', () => this.finish());
  }

  // Tell the player where the fighters are on screen so the overlay can float over their heads.
  // project(worldX, worldY) -> { x, y } in screen pixels.
  bindStage({ project, hero, enemy }) {
    this.stage = { project, hero, enemy };
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ frequency: this.frequency, volume: this.volume }));
    } catch (e) {
      /* private mode: settings just don't persist */
    }
  }

  /**
   * Ask for a reaction.
   * tag      situation (ko, laugh, typo, hurt, powerup, slam, beam, hype, praise, idle, enter, timeskip, ...)
   * priority 1 ambient, 2 notable, 3 big moment (can interrupt a lower-priority clip)
   * chance   0-1 probability this trigger fires at all (scaled by the frequency setting)
   * side     'left' floats over the hero (things you do or that happen to you),
   *          'right' over the bot (things it does)
   * force    skip chance and cooldown (previews, intro)
   */
  trigger(tag, { priority = 1, chance = 1, side = 'right', force = false } = {}) {
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
    this.play(clip, { priority, side, tag });
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
  // It's the largest overlay, floating over the hero whose phrase it is.
  playClip(clip, { side = 'left', priority = 3, caption } = {}) {
    if (!this.ready || this.frequency === 'off') return false;
    this.recent.push(clip.file);
    if (this.recent.length > RECENT_MEMORY) this.recent.shift();
    this.play(clip, { priority, side, tag: 'misc', caption, phrase: true });
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

  // Clip height in px: a share of the smaller screen side, bigger for bigger moments.
  clipHeight(priority, phrase) {
    // Reference size: the screen height, but on tall narrow screens (phones) scale from the width
    // too, so sizes stay graded instead of collapsing to the minimum.
    const ref = Math.min(window.innerHeight, window.innerWidth * 1.5);
    const share = phrase ? SIZE.phrase : SIZE[priority] || SIZE[1];
    return Math.round(Math.max(MIN_CLIP_PX, Math.min(MAX_CLIP_PX, ref * share)));
  }

  play(clip, { priority, side, tag = 'misc', caption, phrase = false }) {
    if (this.current) this.hide(true);
    const v = this.video;
    v.muted = false;
    v.volume = this.volume;
    v.src = `assets/memes/${clip.file}`;
    v.currentTime = 0;

    const captions = CAPTIONS[tag] || CAPTIONS.misc;
    this.badge.textContent = caption || captions[Math.floor(Math.random() * captions.length)];
    this.root.style.setProperty('--meme-h', `${this.clipHeight(priority, phrase)}px`);
    this.root.className = `show prio-${priority}${phrase ? ' phrase' : ''}`;
    this.current = {
      priority,
      side,
      startedAt: performance.now(),
      snap: true, // first frame jumps straight to the fighter instead of sliding in from the corner
      timer: setTimeout(() => this.finish(), ((Math.min(clip.duration || 5, 6)) + 0.6) * 1000)
    };
    this.stats.played++;
    this.duckMusic(true);
    this.updateAnchor();

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

  // Float the overlay above the head of the fighter it's about. Called every frame while playing,
  // so it rides along as they walk, jump or get launched.
  updateAnchor() {
    const cur = this.current;
    const { project, hero, enemy } = this.stage;
    if (!cur || !project) return;
    const fighter = cur.side === 'left' ? hero : enemy;
    if (!fighter) return;

    const head = fighter.anchor('head');
    const p = project(head.x, head.y + 0.7);
    const W = window.innerWidth;
    const w = this.root.offsetWidth || 220;
    const h = this.root.offsetHeight || 140;
    const margin = 10;

    // The frame's bottom-centre sits just above the head. Keep it on screen and out from under the HUD.
    let x = Math.max(w / 2 + margin, Math.min(W - w / 2 - margin, p.x));
    let y = p.y - 6;
    if (y - h < HUD_TOP_PX) y = HUD_TOP_PX + h;

    if (cur.snap) {
      this.pos.x = x;
      this.pos.y = y;
      cur.snap = false;
    } else {
      this.pos.x += (x - this.pos.x) * 0.4;
      this.pos.y += (y - this.pos.y) * 0.4;
    }
    this.root.style.left = `${this.pos.x.toFixed(1)}px`;
    this.root.style.top = `${this.pos.y.toFixed(1)}px`;

    // The little pointer under the frame keeps aiming at the head even when the frame is clamped
    const tail = Math.max(14, Math.min(86, ((p.x - (this.pos.x - w / 2)) / w) * 100));
    this.root.style.setProperty('--tail', `${tail.toFixed(1)}%`);
  }

  finish() {
    if (!this.current) return;
    this.hide(false);
  }

  hide(immediate) {
    if (this.current) clearTimeout(this.current.timer);
    this.current = null;
    this.lastEnd = performance.now();
    this.root.classList.remove('show');
    this.video.pause();
    if (immediate) this.video.removeAttribute('src');
    this.duckMusic(false);
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
