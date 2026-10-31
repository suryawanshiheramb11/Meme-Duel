// Keyboard Warrior Stickman - Low-Latency Input Manager & Special Keys Controller
//
// Every printable character belongs to the typing prompt. Walking uses the arrow keys only:
// binding WASD would swallow A and D, which made those letters impossible to type.
import { matchSecret } from '../combat/secrets.js';

const ARROW_LETTER = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R' };

export class InputManager {
  constructor(promptManager, comboEngine, audioSystem, retroHud, memeMenu, hero, enemy) {
    this.prompt = promptManager;
    this.combo = comboEngine;
    this.audio = audioSystem;
    this.hud = retroHud;
    this.menu = memeMenu;
    this.hero = hero;
    this.enemy = enemy;
    this.blockers = [memeMenu]; // anything with .isOpen (menu, mode picker) that should capture the keyboard
    this.arrowBuffer = []; // recent arrow presses, for the secret-move codes

    // Held key state for continuous movement
    this.keysHeld = {
      left: false,
      right: false,
      down: false // guard
    };

    this.bindKeyboard();
  }

  setFighters(hero, enemy) {
    this.hero = hero;
    this.enemy = enemy;
  }

  bindKeyboard() {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    // Releasing keys while the window is unfocused would leave the hero walking forever
    window.addEventListener('blur', () => {
      this.keysHeld.left = false;
      this.keysHeld.right = false;
      this.keysHeld.down = false;
    });
  }

  onKeyDown(e) {
    // While the menu or the mode picker is open, the game ignores the keyboard
    if (this.blockers.some((b) => b && b.isOpen)) {
      return;
    }

    const key = e.key;

    // Secret-move codes are tapped on the arrow keys (held-down repeats don't count)
    if (ARROW_LETTER[e.code] && !e.repeat) this.recordArrow(e.code);

    // Shift is the meme action: throw a meme card at the bot. (Capital letters still type normally.)
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      if (!e.repeat) this.combo.throwMeme(this.hero, this.enemy);
      return;
    }

    // Movement: arrow keys only
    if (e.code === 'ArrowLeft') {
      e.preventDefault();
      this.keysHeld.left = true;
      return;
    }
    if (e.code === 'ArrowRight') {
      e.preventDefault();
      this.keysHeld.right = true;
      return;
    }
    if (e.code === 'ArrowUp') {
      e.preventDefault();
      if (!e.repeat) this.combo.triggerJump(this.hero); // jump: clears low sweeps and ultra shockwaves
      return;
    }
    if (e.code === 'ArrowDown') {
      e.preventDefault();
      this.keysHeld.down = true; // hold to guard
      return;
    }

    // Held keys shouldn't machine-gun strikes or specials
    if (e.repeat) {
      if (e.code === 'Tab' || e.code === 'Space' || e.code === 'Enter') e.preventDefault();
      return;
    }

    // Special spectacle keys
    if (e.code === 'Tab') {
      e.preventDefault(); // Don't lose focus
      this.combo.triggerDash(this.hero, this.enemy);
      return;
    }

    if (e.code === 'CapsLock' || e.code === 'Backquote') {
      e.preventDefault();
      this.combo.triggerRageMode();
      return;
    }

    if (e.code === 'Enter') {
      e.preventDefault();
      this.combo.triggerGroundSlam(this.hero, this.enemy);
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      const targetChar = this.prompt.getCurrentChar();
      if (targetChar === ' ') {
        // Space advances the prompt!
        this.audio.playKeyClack(false);
        this.prompt.handleKeyPress(' ');
        this.hud.flashKey('SPACE');
        this.combo.registerHit('heavy', this.hero, this.enemy);
        this.hud.updatePrompt(this.prompt);
      } else {
        // Space launches enemy into air!
        this.combo.triggerAirLauncher(this.hero, this.enemy);
      }
      return;
    }

    // Normal typing character handling (single printable character)
    if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const result = this.prompt.handleKeyPress(key);
      this.hud.flashKey(key.toUpperCase(), result.status === 'good' || result.status === 'sentence_complete');

      if (result.status === 'good' || result.status === 'sentence_complete') {
        this.audio.playKeyClack(false);
        const hitType = result.status === 'sentence_complete' ? 'crit' : 'light';
        this.combo.registerHit(hitType, this.hero, this.enemy);
        this.hud.updatePrompt(this.prompt);
      } else if (result.status === 'miss') {
        this.combo.registerMiss();
        this.hud.flashError();
      }
    }
  }

  recordArrow(code) {
    const now = performance.now();
    this.arrowBuffer = this.arrowBuffer.filter((a) => now - a.t < 2200);
    this.arrowBuffer.push({ c: ARROW_LETTER[code], t: now });
    if (this.arrowBuffer.length > 10) this.arrowBuffer.shift();
    if (!this.combo.secretsEnabled) return;
    const hit = matchSecret(this.arrowBuffer.map((a) => a.c).join(''));
    if (hit) {
      this.arrowBuffer = [];
      this.combo.triggerSecret(hit.id, this.hero, this.enemy);
    }
  }

  onKeyUp(e) {
    if (e.code === 'ArrowLeft') this.keysHeld.left = false;
    if (e.code === 'ArrowRight') this.keysHeld.right = false;
    if (e.code === 'ArrowDown') this.keysHeld.down = false;
  }

  update(delta) {
    const hero = this.hero;
    if (!hero) return;
    hero.guarding = this.keysHeld.down && hero.health > 0;
    if (this.keysHeld.left && !this.keysHeld.right) {
      this.combo.moveHero(hero, -1, delta);
    } else if (this.keysHeld.right && !this.keysHeld.left) {
      this.combo.moveHero(hero, 1, delta);
    } else {
      hero.walking = false;
    }
  }
}
