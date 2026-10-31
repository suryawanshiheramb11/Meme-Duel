// Keyboard Warrior Stickman - Authentic "Meme Combo Maker" & Arena Switcher Menu
import { ARENAS } from '../render/arenas/arenaManager.js';

const FORM_CHOICES = [
  ['auto', 'Auto (by rank)'],
  ['base', 'Base'],
  ['ssj', 'Golden Rage'],
  ['blue', 'Blue Surge'],
  ['ui', 'Silver Instinct']
];

export class MemeComboMenu {
  constructor(container, arenaManager, promptManager, audioSystem, comboEngine) {
    this.container = container;
    this.arena = arenaManager;
    this.prompt = promptManager;
    this.audio = audioSystem;
    this.combo = comboEngine;
    this.isOpen = false;

    this.createDomElements();
    this.bindEvents();
  }

  createDomElements() {
    this.menuRoot = document.createElement('div');
    this.menuRoot.id = 'meme-combo-menu-wrapper';
    this.menuRoot.innerHTML = `
      <!-- Top Bar Toggle Button -->
      <button id="toggle-menu-btn" title="Open Meme Combo Maker (ESC)">
        <span class="icon">&#9881;</span> MEME COMBO MAKER
      </button>

      <!-- Full Menu Modal Overlay -->
      <div id="meme-menu-modal" class="hidden">
        <div class="modal-card">
          <div class="modal-header">
            <h2>MEME COMBO MAKER</h2>
            <button id="close-menu-btn" class="close-x">&times;</button>
          </div>

          <div class="modal-body">
            <!-- Section 1: Choose Arena -->
            <div class="menu-section">
              <label class="section-title">SELECT ARENA / STAGE</label>
              <div class="arena-grid">
                ${Object.entries(ARENAS)
                  .map(
                    ([key, cfg]) => `
                <button class="arena-btn${key === this.arena.currentArenaKey ? ' active' : ''}" data-arena="${key}">
                  <div class="arena-thumb" style="${cfg.file ? `background-image:url('${cfg.file}')` : `background-color:#00ff00`}"></div>
                  <span>${cfg.name}</span>
                </button>`
                  )
                  .join('')}
              </div>
            </div>

            <!-- Section: Power Form -->
            <div class="menu-section">
              <label class="section-title">POWER FORM (GLOWING HAIR &amp; AURA)</label>
              <div class="form-row">
                ${FORM_CHOICES.map(
                  ([key, label]) => `<button class="form-btn${key === 'auto' ? ' active' : ''}" data-form="${key}">${label}</button>`
                ).join('')}
              </div>
              <span class="tip-text">Auto powers up as your style rank climbs: A = gold, SS = blue, SSS = silver. CAPS LOCK or the backtick key forces at least gold.</span>
            </div>

            <!-- Section 2: Custom Meme Phrase -->
            <div class="menu-section">
              <label class="section-title">CUSTOM PROMPT / MEME PHRASE</label>
              <div class="prompt-input-row">
                <input type="text" id="custom-phrase-input" placeholder="Enter your custom sentence or meme..." maxlength="60" value="THIS IS A TYPING GAME." />
                <button id="apply-phrase-btn">APPLY PHRASE</button>
              </div>

              <!-- Quick Preset Meme Phrases -->
              <div class="preset-phrases-list">
                <button class="phrase-tag" data-phrase="THIS IS A TYPING GAME.">Steam Demo</button>
                <button class="phrase-tag" data-phrase="I AM THE STORM THAT IS APPROACHING">Bury The Light</button>
                <button class="phrase-tag" data-phrase="STANDING HERE I REALIZE">Armstrong</button>
                <button class="phrase-tag" data-phrase="RULES OF NATURE">Metal Gear</button>
                <button class="phrase-tag" data-phrase="WHY DO I HEAR BOSS MUSIC">Boss Music</button>
                <button class="phrase-tag" data-phrase="YOU SHALL NOT PASS">Gandalf</button>
                <button class="phrase-tag" data-phrase="SKIBIDI TOILET IN OHIO">Brainrot</button>
              </div>
            </div>

            <!-- Section 3: Audio Settings -->
            <div class="menu-section">
              <label class="section-title">AUDIO & JUICE SETTINGS</label>
              <div class="slider-row">
                <span>Mechanical Keyboard SFX:</span>
                <input type="range" id="vol-sfx" min="0" max="100" value="80" />
              </div>
              <div class="slider-row">
                <span>Music Volume:</span>
                <input type="range" id="vol-music" min="0" max="100" value="50" />
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <span class="tip-text">Tip: Press <b>ESC</b> anytime to resume combat</span>
            <button id="resume-game-btn" class="primary-btn">START FIGHTING</button>
          </div>
        </div>
      </div>
    `;

    this.container.appendChild(this.menuRoot);

    this.modal = document.getElementById('meme-menu-modal');
    this.customInput = document.getElementById('custom-phrase-input');
    this.arenaBtns = this.menuRoot.querySelectorAll('.arena-btn');
    this.phraseTags = this.menuRoot.querySelectorAll('.phrase-tag');
    this.formBtns = this.menuRoot.querySelectorAll('.form-btn');
  }

  bindEvents() {
    // Open / Close toggles
    document.getElementById('toggle-menu-btn').addEventListener('click', () => this.toggle());
    document.getElementById('close-menu-btn').addEventListener('click', () => this.close());
    document.getElementById('resume-game-btn').addEventListener('click', () => this.close());

    // ESC key toggle
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.toggle();
      }
    });

    // Arena switcher
    this.arenaBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const arenaKey = btn.dataset.arena;
        this.arenaBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.arena.switchArena(arenaKey);
      });
    });

    // Power form picker
    this.formBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.formBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        if (this.combo) this.combo.setFormOverride(btn.dataset.form);
      });
    });

    // Custom phrase application
    document.getElementById('apply-phrase-btn').addEventListener('click', () => {
      this.applyPhrase(this.customInput.value);
    });
    this.customInput.addEventListener('keydown', (e) => {
      e.stopPropagation(); // Don't trigger game inputs while typing custom phrase
      if (e.key === 'Enter') {
        this.applyPhrase(this.customInput.value);
      }
    });

    // Preset phrase tags
    this.phraseTags.forEach((tag) => {
      tag.addEventListener('click', () => {
        const phrase = tag.dataset.phrase;
        this.customInput.value = phrase;
        this.applyPhrase(phrase);
      });
    });

    // Audio Sliders
    document.getElementById('vol-sfx').addEventListener('input', (e) => {
      const val = e.target.value / 100;
      if (this.audio.sfxGain) this.audio.sfxGain.gain.value = val;
    });
    document.getElementById('vol-music').addEventListener('input', (e) => {
      const val = e.target.value / 100;
      if (this.audio.musicGain) this.audio.musicGain.gain.value = val;
    });
  }

  applyPhrase(text) {
    if (!text || text.trim() === '') return;
    this.prompt.setCustomPrompt(text);
    this.close();
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    this.isOpen = true;
    this.modal.classList.remove('hidden');
    this.customInput.focus();
    this.customInput.select();
  }

  close() {
    this.isOpen = false;
    this.modal.classList.add('hidden');
  }
}
