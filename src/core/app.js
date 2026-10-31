// Keyboard Warrior Stickman - Main Application Coordinator & Game Loop
import { audioSystem } from './audioSystem.js';
import { ArenaManager } from '../render/arenas/arenaManager.js';
import { EffectsManager } from '../render/effects/effectsManager.js';
import { PaperStandee } from '../render/stickman/paperStandee.js';
import { ComboEngine } from '../combat/comboEngine.js';
import { FightDirector } from '../combat/fightDirector.js';
import { PromptManager } from '../combat/promptManager.js';
import { RetroHud } from '../ui/retroHud.js';
import { MemeComboMenu } from '../ui/memeComboMenu.js';
import { MemeReactions } from '../ui/memeReactions.js';
import { ModeSelect } from '../ui/modeSelect.js';
import { PerfMonitor } from './perfMonitor.js';
import { loadDifficulty } from '../combat/difficulty.js';
import { InputManager } from './inputManager.js';

const MUSIC = {
  wasteland: 'assets/audio/music/music_boss_heavy.ogg',
  lava: 'assets/audio/music/music_boss_heavy.ogg',
  cyber: 'assets/audio/music/music_boss_battle.ogg',
  space: 'assets/audio/music/music_boss_battle.ogg',
  dojo: 'assets/audio/music/music_calm_dojo_focus.ogg',
  meadow: 'assets/audio/music/music_calm_dojo_focus.ogg',
  desk: 'assets/audio/music/music_street_combat.ogg',
  crt: 'assets/audio/music/music_street_combat.ogg',
  sketchpad: 'assets/audio/music/music_street_combat.ogg',
  greenscreen: 'assets/audio/music/music_street_combat.ogg'
};

export class App {
  constructor() {
    this.container = document.getElementById('game-container');
    this.lastTime = performance.now();
    this.audioStarted = false;
    this.pendingMusic = MUSIC.wasteland;

    // 1. Audio System
    this.audio = audioSystem;

    // 2. Backdrop, camera & effects
    this.arena = new ArenaManager(this.container);
    this.fx = new EffectsManager(this.arena.scene, this.arena.camera, this.container);
    this.fx.setShake((amount) => this.arena.triggerScreenShake(amount));
    this.arena.onArenaChange = (key, cfg) => {
      this.fx.setAmbient(cfg.ambient);
      this.pendingMusic = MUSIC[key] || MUSIC.desk;
      if (this.audioStarted) this.audio.playMusic(this.pendingMusic);
    };
    this.arena.switchArena(this.arena.currentArenaKey);

    // 3. Animated paper-cutout fighters
    this.hero = new PaperStandee(true, this.arena.scene);
    this.enemy = new PaperStandee(false, this.arena.scene);
    this.hero.x = -0.55;
    this.enemy.x = 0.5;
    this.fx.attachAura(this.hero);
    this.perf = new PerfMonitor({ arena: this.arena, fx: this.fx, fighters: [this.hero, this.enemy] });

    // 4. Combat, style rank & power forms
    this.combo = new ComboEngine(this.audio, this.arena, this.fx);
    this.combo.bindFighters(this.hero, this.enemy);

    // Meme reaction popups (KO laughs, typo apologies, power-up hype, ...)
    this.memes = new MemeReactions(this.container, this.audio);
    // Memes float over the head of whoever they're about and follow them around
    this.memes.bindStage({
      project: (x, y) => this.arena.worldToScreen(x, y),
      hero: this.hero,
      enemy: this.enemy
    });
    this.combo.memes = this.memes;
    this.lastIdleMeme = performance.now();
    this.introShown = false;

    // 5. Enemy AI, spacing & camera focus
    this.director = new FightDirector({
      hero: this.hero,
      enemy: this.enemy,
      combo: this.combo,
      fx: this.fx,
      arena: this.arena,
      audio: this.audio
    });
    this.director.memes = this.memes;
    this.director.setDifficulty(loadDifficulty(), { save: false });
    this.director.paused = true; // the bot waits while you pick a level

    // 6. Floating prompt engine: finishing a sentence fires the beam finisher
    // Each prompt is a meme's catchphrase: letters strike, finished words add a bonus hit,
    // and the finished phrase plays that meme and fires its special move.
    this.prompt = new PromptManager(
      (item) => {
        this.combo.addStylePoints(60);
        this.combo.triggerSpecial(this.hero, this.enemy, item);
      },
      (word) => this.combo.registerWord(word, this.hero, this.enemy)
    );

    // 7. HUD
    this.hud = new RetroHud(this.container);
    this.hud.updatePrompt(this.prompt);

    // Build the meme queue as soon as the clip list is known
    // Warm the cache for the clip being typed and the next two, so the payoff plays with no delay
    const prefetchUpcoming = () => {
      const upcoming = [this.prompt.currentItem, ...this.prompt.peek(2)].filter(Boolean);
      this.memes.prefetch(upcoming.map((i) => i.clip.file));
    };
    this.prompt.onAdvance = prefetchUpcoming;
    this.memes.loaded.then(() => {
      const items = this.memes.clips.filter((c) => c.phrase).map((c) => ({ phrase: c.phrase, clip: c, move: c.move }));
      if (items.length) {
        this.prompt.setQueue(items);
        this.hud.updatePrompt(this.prompt);
        prefetchUpcoming();
        this.memes.prefetchAllWhenIdle(); // everything else trickles in behind the scenes
      }
    });

    // 8. Meme Combo Maker menu
    this.menu = new MemeComboMenu(this.container, this.arena, this.prompt, this.audio, this.combo, this.memes, this.director, this.perf);

    // 9. Input
    this.input = new InputManager(
      this.prompt,
      this.combo,
      this.audio,
      this.hud,
      this.menu,
      this.hero,
      this.enemy
    );

    // Start screen: choose Easy / Medium / Hard. The bot stays put until you do.
    this.modeSelect = new ModeSelect(this.container, this.director.diffKey, (level) => {
      this.director.setDifficulty(level);
      this.director.paused = false;
      this.combo.lastActionAt = performance.now();
    });
    this.input.blockers.push(this.modeSelect); // only the menu and the mode picker capture the keyboard; memes never do

    // Start background music on first user interaction (browsers block autoplay)
    const startAudioOnce = () => {
      if (this.audioStarted) return;
      this.audioStarted = true;
      this.audio.init();
      this.audio.playMusic(this.pendingMusic);
      // First keypress doubles as the user gesture that lets clips play with sound
      setTimeout(() => {
        if (!this.introShown) {
          this.introShown = true;
          this.memes.trigger('intro', { priority: 2, side: 'left', force: true });
        }
      }, 500);
      window.removeEventListener('keydown', startAudioOnce);
      window.removeEventListener('click', startAudioOnce);
    };
    window.addEventListener('keydown', startAudioOnce);
    window.addEventListener('click', startAudioOnce);

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  animate() {
    requestAnimationFrame(this.animate);
    const now = performance.now();
    const delta = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;


    // Slow motion on KOs and perfect dodges; impact freeze on hits.
    let dt = delta;
    if (this.combo.slowTimer > 0) {
      this.combo.slowTimer -= delta;
      dt = delta * 0.4;
    }
    let simDt = dt;
    if (this.combo.hitStop > 0) {
      this.combo.hitStop -= delta;
      simDt = 0;
    }

    this.perf.tick(delta);
    this.input.update(simDt);
    this.combo.update(dt);
    this.prompt.update(dt);

    this.hero.update(simDt);
    this.enemy.update(simDt);
    this.director.update(simDt);

    // Left alone for a while: a "waiting..." style meme
    const nowMs = performance.now();
    if (nowMs - this.combo.lastActionAt > 9000 && nowMs - this.lastIdleMeme > 22000 && this.audioStarted) {
      this.lastIdleMeme = nowMs;
      this.memes.trigger('idle', { priority: 1, chance: 0.8, side: 'right' });
    }

    this.fx.update(dt, this.arena.camX);
    this.arena.update(delta);
    this.memes.updateAnchor(); // keep the meme overlay riding above its fighter

    this.hud.updateMetrics(this.prompt, this.combo);
    this.hud.updateBars(this.hero, this.enemy, this.combo, this.director);

    this.arena.render();
  }
}

// Auto-boot on DOM ready or immediately if already loaded
function bootApp() {
  if (!window.gameApp) {
    window.gameApp = new App();
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootApp);
} else {
  bootApp();
}
