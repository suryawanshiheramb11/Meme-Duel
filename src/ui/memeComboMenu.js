// Keyboard Warrior Stickman - Authentic "Meme Combo Maker" & Arena Switcher Menu
import { ARENAS } from '../render/arenas/arenaManager.js';
import { DIFFICULTIES } from '../combat/difficulty.js';

const FORM_CHOICES = [
  ['auto', 'Auto (by rank)'],
  ['base', 'Base'],
  ['ssj', 'Golden Rage'],
  ['blue', 'Blue Surge'],
  ['ui', 'Silver Instinct']
];

export class MemeComboMenu {
  constructor(container, arenaManager, promptManager, audioSystem, comboEngine, memeReactions, director, perfMonitor) {
    this.container = container;
    this.arena = arenaManager;
    this.prompt = promptManager;
    this.audio = audioSystem;
    this.combo = comboEngine;
    this.memes = memeReactions;
    this.director = director;
    this.perf = perfMonitor;
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
            <!-- Section: Difficulty -->
            <div class="menu-section">
              <label class="section-title">BOT DIFFICULTY</label>
              <div class="form-row">
                ${Object.entries(DIFFICULTIES)
                  .map(([key, d]) => `<button class="form-btn diff-btn" data-level="${key}" title="${d.blurb}">${d.label} &middot; ${d.name}</button>`)
                  .join('')}
              </div>
              <span class="tip-text" id="diff-blurb"></span>
            </div>

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

            <!-- Section: Attack guide -->
            <div class="menu-section">
              <label class="section-title">HOW ATTACKS WORK</label>
              <div class="attack-guide">
                <div><kbd>Type</kbd><span>Every correct letter throws a strike: jab, cross, punch in rotation. If you're out of reach the hero lunges in first. Every <b>4th hit in a row is a finisher kick</b> with big knockback.</span></div>
                <div><kbd>SPACE</kbd><span><b>Air launch.</b> Uppercut sends the enemy flying and the hero floats up beside them. Keep typing to juggle, and each hit keeps them airborne.</span></div>
                <div><kbd>ENTER</kbd><span><b>Ground slam.</b> On an airborne enemy it dives them into the floor for heavy damage, a shockwave and a crater. On the ground it's a quick sweep.</span></div>
                <div><kbd>TAB</kbd><span><b>Dash.</b> Far away: closes the gap. Close: dodges back (or crosses over if you're cornered). Hit Tab just as the enemy swings for a <b>perfect dodge</b>, slow motion and bonus style.</span></div>
                <div><kbd>Sentence</kbd><span>Finish a sentence to charge and fire the <b>beam finisher</b>.</span></div>
                <div><kbd>CAPS / &#96;</kbd><span><b>Rage:</b> extra damage and at least Golden Rage form.</span></div>
                <div><kbd>Typo</kbd><span>Drops your combo and invites an enemy counter-attack. Three in a row earns an apology meme.</span></div>
              </div>
              <span class="tip-text">Higher style rank = more damage and a stronger form: A gold, SS blue, SSS silver.</span>
            </div>

            <!-- Section: Meme Reactions -->
            <div class="menu-section">
              <label class="section-title">MEME REACTIONS</label>
              <div class="form-row" id="meme-freq-row">
                ${[['off', 'Off'], ['low', 'Rare'], ['normal', 'Normal'], ['chaos', 'Chaos']]
                  .map(([key, label]) => `<button class="form-btn meme-freq-btn" data-freq="${key}">${label}</button>`)
                  .join('')}
                <button class="form-btn" id="meme-preview-btn">&#9654; Preview one</button>
              </div>
              <div class="slider-row">
                <span>Meme Volume:</span>
                <input type="range" id="vol-meme" min="0" max="100" value="80" />
              </div>
              <span class="tip-text">Clips pop up during the fight: KO laughs, typo apologies, power-up hype, time-skip cards when a new foe arrives.</span>
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

            <!-- Section: Graphics -->
            <div class="menu-section">
              <label class="section-title">GRAPHICS</label>
              <div class="form-row">
                ${[['auto', 'Auto'], ['high', 'High'], ['low', 'Low (lightest)']]
                  .map(([key, label]) => `<button class="form-btn gfx-btn" data-gfx="${key}">${label}</button>`)
                  .join('')}
              </div>
              <span class="tip-text">Auto lowers effects and resolution if your device struggles, and raises them again when it can.</span>
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
    this.formBtns = this.menuRoot.querySelectorAll('.form-btn[data-form]');
    this.diffBtns = this.menuRoot.querySelectorAll('.diff-btn');
    this.gfxBtns = this.menuRoot.querySelectorAll('.gfx-btn');
    this.memeFreqBtns = this.menuRoot.querySelectorAll('.meme-freq-btn');
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

    // Bot difficulty
    this.diffBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.director) this.director.setDifficulty(btn.dataset.level);
        this.syncDifficulty();
      });
    });
    this.syncDifficulty();

    // Graphics quality
    if (this.perf) {
      const syncGfx = () => this.gfxBtns.forEach((b) => b.classList.toggle('active', b.dataset.gfx === this.perf.mode));
      syncGfx();
      this.gfxBtns.forEach((btn) =>
        btn.addEventListener('click', () => {
          this.perf.setMode(btn.dataset.gfx);
          syncGfx();
        })
      );
    }

    // Power form picker
    this.formBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.formBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        if (this.combo) this.combo.setFormOverride(btn.dataset.form);
      });
    });

    // Meme reactions: frequency, volume, preview
    if (this.memes) {
      const syncFreq = () =>
        this.memeFreqBtns.forEach((b) => b.classList.toggle('active', b.dataset.freq === this.memes.frequency));
      syncFreq();
      this.memeFreqBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          this.memes.setFrequency(btn.dataset.freq);
          syncFreq();
        });
      });
      const memeVol = document.getElementById('vol-meme');
      memeVol.value = Math.round(this.memes.volume * 100);
      memeVol.addEventListener('input', (e) => this.memes.setVolume(e.target.value / 100));
      document.getElementById('meme-preview-btn').addEventListener('click', () => {
        this.close();
        this.memes.trigger('misc', { priority: 3, force: true });
      });
    }

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

  syncDifficulty() {
    if (!this.director) return;
    const key = this.director.diffKey;
    this.diffBtns.forEach((b) => b.classList.toggle('active', b.dataset.level === key));
    const blurb = document.getElementById('diff-blurb');
    if (blurb) blurb.textContent = `${DIFFICULTIES[key].label}: ${DIFFICULTIES[key].blurb}`;
  }

  open() {
    this.syncDifficulty();
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
