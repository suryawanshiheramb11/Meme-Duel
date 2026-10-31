// Keyboard Warrior Stickman - Low-Latency Input Manager & Special Keys Controller
//
// Every printable character belongs to the typing prompt. Walking uses the arrow keys only:
// binding WASD would swallow A and D, which made those letters impossible to type.
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

    // Held key state for continuous movement
    this.keysHeld = {
      left: false,
      right: false
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
    });
  }

  onKeyDown(e) {
    // While the menu or the mode picker is open, the game ignores the keyboard
    if (this.blockers.some((b) => b && b.isOpen)) {
      return;
    }

    const key = e.key;

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
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault(); // keep the page from scrolling
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

  onKeyUp(e) {
    if (e.code === 'ArrowLeft') this.keysHeld.left = false;
    if (e.code === 'ArrowRight') this.keysHeld.right = false;
  }

  update(delta) {
    const hero = this.hero;
    if (!hero) return;
    if (this.keysHeld.left && !this.keysHeld.right) {
      this.combo.moveHero(hero, -1, delta);
    } else if (this.keysHeld.right && !this.keysHeld.left) {
      this.combo.moveHero(hero, 1, delta);
    } else {
      hero.walking = false;
    }
  }
}
