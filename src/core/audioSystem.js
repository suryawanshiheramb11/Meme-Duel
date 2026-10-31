// Keyboard Warrior Stickman - Authentic Low-Latency Audio Engine
class AudioSystem {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.musicSource = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.isMuted = false;
    this.currentMusic = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.45;
    this.musicGain.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.75;
    this.sfxGain.connect(this.ctx.destination);

    this.initialized = true;
    this.preloadSounds();
  }

  async preloadSounds() {
    const soundList = [
      // Mechanical Keyboards (randomized thocks)
      { id: 'key_1', url: 'assets/audio/sfx/keys/thock_01.ogg' },
      { id: 'key_2', url: 'assets/audio/sfx/keys/thock_02.ogg' },
      { id: 'key_3', url: 'assets/audio/sfx/keys/thock_03.ogg' },
      { id: 'key_4', url: 'assets/audio/sfx/keys/thock_04.ogg' },
      { id: 'key_space', url: 'assets/audio/sfx/keys/spacebar_down.ogg' },
      { id: 'key_enter', url: 'assets/audio/sfx/keys/key_enter_slam.ogg' },
      { id: 'key_error', url: 'assets/audio/sfx/keys/error_buzz_soft.ogg' },

      // Combat Impacts (XiaoXiao / Spectacle Fighter hits)
      { id: 'hit_light', url: 'assets/audio/sfx/combat/hit_punch_light_01.ogg' },
      { id: 'hit_heavy', url: 'assets/audio/sfx/combat/hit_punch_heavy_01.ogg' },
      { id: 'hit_kick', url: 'assets/audio/sfx/combat/hit_kick_01.ogg' },
      { id: 'hit_crit', url: 'assets/audio/sfx/combat/impact_crit_01.ogg' },
      { id: 'whoosh_light', url: 'assets/audio/sfx/combat/swing_whoosh_light_01.ogg' },
      { id: 'whoosh_heavy', url: 'assets/audio/sfx/combat/swing_whoosh_heavy_01.ogg' },
      { id: 'knockdown', url: 'assets/audio/sfx/combat/combat_knockdown_01.ogg' },

      // Feedback & Rank Up
      { id: 'rank_up', url: 'assets/audio/sfx/feedback/rank_up_fanfare.ogg' },
      { id: 'streak_fire', url: 'assets/audio/sfx/feedback/streak_flame_ignite.ogg' }
    ];

    for (const item of soundList) {
      try {
        const res = await fetch(item.url);
        if (res.ok) {
          const arrayBuf = await res.arrayBuffer();
          this.buffers[item.id] = await this.ctx.decodeAudioData(arrayBuf);
        }
      } catch (e) {
        // Fallback procedural synthesizer if file missing
      }
    }
  }

  playKeyClack(isError = false) {
    if (!this.initialized) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();

    if (isError) {
      this.playSound('key_error', 150, 0.4, 'sawtooth');
      return;
    }

    const keyIds = ['key_1', 'key_2', 'key_3', 'key_4'];
    const chosen = keyIds[Math.floor(Math.random() * keyIds.length)];
    const detune = (Math.random() - 0.5) * 120; // Natural mechanical pitch variance

    if (this.buffers[chosen]) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers[chosen];
      src.detune.value = detune;
      src.connect(this.sfxGain);
      src.start();
    } else {
      this.synthThock(detune);
    }
  }

  playSpecialKey(keyType) {
    if (!this.initialized) this.init();
    if (keyType === 'space') {
      if (this.buffers['key_space']) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.buffers['key_space'];
        src.connect(this.sfxGain);
        src.start();
      }
      this.playSound('whoosh_heavy');
    } else if (keyType === 'enter') {
      if (this.buffers['key_enter']) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.buffers['key_enter'];
        src.connect(this.sfxGain);
        src.start();
      }
      this.playSound('hit_crit');
    } else if (keyType === 'tab') {
      this.playSound('whoosh_light');
    } else if (keyType === 'caps') {
      this.playSound('streak_fire');
    }
  }

  playCombatHit(type = 'light') {
    if (!this.initialized) this.init();
    const id = type === 'kick' ? 'hit_kick' : type === 'heavy' ? 'hit_heavy' : type === 'crit' ? 'hit_crit' : 'hit_light';
    if (this.buffers[id]) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers[id];
      src.detune.value = (Math.random() - 0.5) * 80;
      src.connect(this.sfxGain);
      src.start();
    } else {
      this.synthHit(type);
    }
  }

  playSound(id, freq = 440, dur = 0.1, type = 'sine') {
    if (!this.initialized) this.init();
    if (this.buffers[id]) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers[id];
      src.connect(this.sfxGain);
      src.start();
    } else {
      // Clean synth fallback
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start();
      osc.stop(this.ctx.currentTime + dur);
    }
  }

  // A low "boom" layered under heavy hits, slams and KOs so they feel like they have mass
  playImpactBoom(level = 1) {
    if (!this.initialized) this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130 + level * 20, t);
    osc.frequency.exponentialRampToValueAtTime(34, t + 0.28);
    gain.gain.setValueAtTime(0.55 * Math.min(1.4, level), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.32);
    // a short noise crack on top
    const len = Math.floor(this.ctx.sampleRate * 0.07);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const noise = this.ctx.createBufferSource();
    const ng = this.ctx.createGain();
    noise.buffer = buf;
    ng.gain.value = 0.25 * Math.min(1.4, level);
    noise.connect(ng);
    ng.connect(this.sfxGain);
    noise.start(t);
  }

  synthThock(detune = 0) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const baseFreq = 180 + detune * 0.2;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.06);
    gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.06);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.06);
  }

  synthHit(type) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    const startFreq = type === 'heavy' ? 220 : 160;
    osc.frequency.setValueAtTime(startFreq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.6, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.12);
  }

  async playMusic(musicFile = 'assets/audio/music/music_street_combat.ogg') {
    if (!this.initialized) this.init();
    if (this.currentMusic === musicFile && this.musicSource) return;

    if (this.musicSource) {
      try { this.musicSource.stop(); } catch (e) {}
    }

    try {
      const res = await fetch(musicFile);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const buffer = await this.ctx.decodeAudioData(arrayBuf);
        this.musicSource = this.ctx.createBufferSource();
        this.musicSource.buffer = buffer;
        this.musicSource.loop = true;
        this.musicSource.connect(this.musicGain);
        this.musicSource.start();
        this.currentMusic = musicFile;
      }
    } catch (e) {
      console.warn('Music playback fallback:', e);
    }
  }
}

export const audioSystem = new AudioSystem();
