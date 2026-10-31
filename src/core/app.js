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

    // 4. Combat, style rank & power forms
    this.combo = new ComboEngine(this.audio, this.arena, this.fx);
    this.combo.bindFighters(this.hero, this.enemy);

    // 5. Enemy AI, spacing & camera focus
    this.director = new FightDirector({
      hero: this.hero,
      enemy: this.enemy,
      combo: this.combo,
      fx: this.fx,
      arena: this.arena,
      audio: this.audio
    });

    // 6. Floating prompt engine: finishing a sentence fires the beam finisher
    this.prompt = new PromptManager(() => {
      this.combo.addStylePoints(60);
      this.combo.triggerBeam(this.hero, this.enemy);
    });

    // 7. HUD
    this.hud = new RetroHud(this.container);
    this.hud.updatePrompt(this.prompt);

    // 8. Meme Combo Maker menu
    this.menu = new MemeComboMenu(this.container, this.arena, this.prompt, this.audio, this.combo);

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

    // Start background music on first user interaction (browsers block autoplay)
    const startAudioOnce = () => {
      if (this.audioStarted) return;
      this.audioStarted = true;
      this.audio.init();
      this.audio.playMusic(this.pendingMusic);
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
      dt = delta * 0.3;
    }
    let simDt = dt;
    if (this.combo.hitStop > 0) {
      this.combo.hitStop -= delta;
      simDt = 0;
    }

    this.input.update(simDt);
    this.combo.update(dt);
    this.prompt.update(dt);

    this.hero.update(simDt);
    this.enemy.update(simDt);
    this.director.update(simDt);

    this.fx.update(dt, this.arena.camX);
    this.arena.update(delta);

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
