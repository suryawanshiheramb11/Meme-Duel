import { buffValue, describeBuff } from '../combat/buffs.js';
// Keyboard Warrior Stickman - Retro Steam Game HUD & Floating 3D/2.5D Prompt Overlay
import { FORM_LABELS, FORM_COLORS } from '../render/effects/effectsManager.js';

const MOVE_LABELS = {
  beam: 'BEAM FINISHER',
  slam: 'METEOR SLAM',
  flurry: 'MEME FLURRY',
  timeskip: 'TIME SKIP',
  powerup: 'POWER SURGE'
};

export class RetroHud {
  constructor(container) {
    this.container = container;
    this.createDomElements();
  }

  createDomElements() {
    this.hudRoot = document.createElement('div');
    this.hudRoot.id = 'retro-hud-overlay';
    this.hudRoot.innerHTML = `
      <!-- Top Fight Bars: player health, power form, enemy health -->
      <div id="fight-bars">
        <div class="bar-side hero-side">
          <div class="bar-head"><span class="bar-name">YOU</span><span id="form-chip">BASE</span></div>
          <div class="hp-track"><div id="hero-hp-ghost" class="hp-ghost"></div><div id="hero-hp-fill" class="hp-fill"></div><i class="hp-ticks"></i><span id="hero-hp-num" class="hp-num"></span></div>
        </div>
        <div id="vs-badge">VS</div>
        <div class="bar-side enemy-side">
          <div class="bar-head"><span id="enemy-kos">KO 0</span><span class="bar-name" id="enemy-name">FOE #1</span></div>
          <div class="hp-track"><div id="enemy-hp-ghost" class="hp-ghost"></div><div id="enemy-hp-fill" class="hp-fill"></div><i class="hp-ticks"></i><span id="enemy-hp-num" class="hp-num"></span></div>
        </div>
      </div>

      <!-- Meme queue: the meme being typed now and the next ones, with the special move each unlocks -->
      <div id="meme-queue"></div>

      <!-- Top / Center Floating In-Arena Prompt -->
      <div id="floating-prompt-container">
        <div id="floating-prompt-paper">
          <div id="prompt-text-display"></div>
        </div>
      </div>

      <!-- Tactical mode: three memes to pick from, each carrying a buff -->
      <div id="tactical-choices" hidden></div>
      <div id="buff-chips"></div>

      <!-- Every key you press slides up from the bottom centre -->
      <div id="key-stream" aria-hidden="true"></div>

      <!-- Combo & DMC Style Rank Widget (Right Side) -->
      <div id="style-rank-widget">
        <div id="combo-counter-text" class="hidden">0 HITS!</div>
        <div id="rank-badge-letter">D</div>
        <div id="rank-title-text">DISMAL</div>
        <div id="rank-meter-track">
          <div id="rank-meter-fill"></div>
        </div>
      </div>

      <!-- Bottom-Left Steam Authentic HUD -->
      <div id="steam-bottom-hud">
        <div id="steam-hud-metrics">
          <span class="hud-item"><span id="hud-good-count" class="val">0</span> <span class="lbl">GOOD</span></span>
          <span class="hud-sep">/</span>
          <span class="hud-item"><span id="hud-miss-count" class="val">0</span> <span class="lbl">MISS</span></span>
          <span class="hud-sep">/</span>
          <span class="hud-item"><span id="hud-accuracy-val" class="val">100</span><span class="lbl">%</span></span>
          <span class="hud-sep">/</span>
          <span class="hud-item"><span id="hud-time-val" class="val">0:00</span></span>
        </div>
        <div id="steam-score-counter">000,000</div>
        <div id="steam-progress-track">
          <div id="steam-progress-fill"></div>
        </div>
      </div>

      <!-- Bottom-Center Physical Keybind Reminder Bar -->
      <div id="keybind-guide-bar">
        <span class="k-chip"><kbd>SPACE</kbd> AIR LAUNCH</span>
        <span class="k-chip"><kbd>ENTER</kbd> GROUND SLAM</span>
        <span class="k-chip"><kbd>TAB</kbd> DASH</span>
        <span class="k-chip"><kbd>CAPS</kbd> / <kbd>\`</kbd> RAGE</span>
        <span class="k-chip"><kbd>&larr;</kbd><kbd>&rarr;</kbd> MOVE</span>
        <span class="k-chip"><kbd>&uarr;</kbd> JUMP</span>
        <span class="k-chip"><kbd>&darr;</kbd> GUARD</span>
        <span class="k-chip" id="chip-meme"><kbd>SHIFT</kbd> MEME<i class="chip-fill"></i></span>
      </div>

      <!-- Red Screen Flash on Miss / Error -->
      <div id="screen-miss-flash"></div>
      <!-- Rage Mode Red Aura Vignette -->
      <div id="rage-aura-vignette"></div>
    `;

    this.container.appendChild(this.hudRoot);

    // Cache elements for 60 FPS performance
    this.promptDisplay = document.getElementById('prompt-text-display');
    this.goodEl = document.getElementById('hud-good-count');
    this.missEl = document.getElementById('hud-miss-count');
    this.accEl = document.getElementById('hud-accuracy-val');
    this.timeEl = document.getElementById('hud-time-val');
    this.scoreEl = document.getElementById('steam-score-counter');
    this.progressFill = document.getElementById('steam-progress-fill');

    this.comboText = document.getElementById('combo-counter-text');
    this.rankLetter = document.getElementById('rank-badge-letter');
    this.rankTitle = document.getElementById('rank-title-text');
    this.rankFill = document.getElementById('rank-meter-fill');

    this.flashEl = document.getElementById('screen-miss-flash');
    this.rageEl = document.getElementById('rage-aura-vignette');

    this.memeChip = document.getElementById('chip-meme');
    this.memeChipFill = this.memeChip.querySelector('.chip-fill');
    this.queueEl = document.getElementById('meme-queue');
    this.lastQueueKey = null;
    this.keyStream = document.getElementById('key-stream');
    this.tacticalEl = document.getElementById('tactical-choices');
    this.buffChips = document.getElementById('buff-chips');
    this.lastTacKey = null;
    this.lastBuffKey = null;
    this.heroGhost = document.getElementById('hero-hp-ghost');
    this.enemyGhost = document.getElementById('enemy-hp-ghost');
    this.heroNum = document.getElementById('hero-hp-num');
    this.enemyNum = document.getElementById('enemy-hp-num');
    this.heroHp = document.getElementById('hero-hp-fill');
    this.enemyHp = document.getElementById('enemy-hp-fill');
    this.formChip = document.getElementById('form-chip');
    this.enemyName = document.getElementById('enemy-name');
    this.enemyKos = document.getElementById('enemy-kos');
    this.lastForm = null;
    this.lastEnemyNumber = 0;
  }

  updateBars(hero, enemy, combo, director) {
    this.director = director;
    this.refreshTacticalValues(hero, enemy);
    const hw = `${Math.max(0, (hero.health / hero.maxHealth) * 100)}%`;
    const ew = `${Math.max(0, (enemy.health / enemy.maxHealth) * 100)}%`;
    this.heroHp.style.width = hw;
    this.enemyHp.style.width = ew;
    this.heroGhost.style.width = hw; // the pale trail drains behind the bar (slow transition in CSS)
    this.enemyGhost.style.width = ew;
    const hn = `${Math.ceil(Math.max(0, hero.health))} / ${hero.maxHealth}`;
    const en = `${Math.ceil(Math.max(0, enemy.health))} / ${enemy.maxHealth}`;
    if (hn !== this.lastHeroNum) this.heroNum.textContent = this.lastHeroNum = hn;
    if (en !== this.lastEnemyNum) this.enemyNum.textContent = this.lastEnemyNum = en;
    this.heroHp.classList.toggle('low', hero.health / hero.maxHealth < 0.3);

    if (combo.form !== this.lastForm) {
      this.lastForm = combo.form;
      this.formChip.textContent = FORM_LABELS[combo.form];
      this.formChip.style.color = FORM_COLORS[combo.form];
      this.formChip.style.borderColor = FORM_COLORS[combo.form];
      this.formChip.classList.toggle('powered', combo.form !== 'base');
    }
    const nameKey = `${director.enemyNumber}|${director.diffKey}|${director.diff.personalityLabel || ''}`;
    if (nameKey !== this.lastEnemyNumber) {
      this.lastEnemyNumber = nameKey;
      const tag = director.diff.personalityLabel ? ` \u00b7 ${director.diff.personalityLabel}` : '';
      this.enemyName.textContent = `FOE #${director.enemyNumber} \u00b7 ${director.diff.label}`;
      this.enemyName.title = `${director.diff.name}${tag}`;
      this.enemyName.dataset.level = director.diffKey;
    }
    // meme-throw cooldown
    const ready = combo.memeThrowFraction();
    this.memeChip.classList.toggle('ready', ready >= 1);
    this.memeChipFill.style.transform = `scaleX(${ready})`;
    if (!director.versus) this.enemyKos.textContent = `KO ${combo.kills}`;
  }

  updatePrompt(promptManager) {
    this.renderTactical(promptManager);
    if (promptManager.tactical && !promptManager.chosen) {
      this.promptDisplay.innerHTML = '<span class="tac-hint">TYPE THE FIRST LETTER OF A MEME TO PICK IT</span>';
      return;
    }
    const text = promptManager.currentText;
    const activeIdx = promptManager.charIndex;

    // Characters are grouped into words so a narrow screen wraps between words, never inside one.
    let html = '';
    let word = '';
    const flushWord = () => {
      if (word) html += `<span class="word">${word}</span>`;
      word = '';
    };
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const displayChar = char === ' ' ? '&nbsp;' : char;
      let cell;
      if (i < activeIdx) {
        cell = `<span class="char char-done">${displayChar}</span>`;
      } else if (i === activeIdx) {
        // Active target with STEAM RED CURSOR BOX!
        cell = `<span class="char char-active"><span class="red-cursor-box">${displayChar}</span></span>`;
      } else {
        cell = `<span class="char char-pending">${displayChar}</span>`;
      }
      if (char === ' ') {
        flushWord();
        html += cell;
      } else {
        word += cell;
      }
    }
    flushWord();
    this.promptDisplay.innerHTML = html;
    this.renderQueue(promptManager);
  }

  // Tactical mode: three cards side by side. Each shows its meme, its buff and its phrase with the first
  // letter marked, since that letter is what picks it. After picking, the other two fade.
  renderTactical(p) {
    document.body.classList.toggle('tactical', !!p.tactical);
    this.tacticalEl.hidden = !p.tactical;
    if (!p.tactical) return;
    const key = p.choices.map((c) => c.phrase).join('|') + '|' + (p.chosen ? p.chosen.phrase : '-');
    if (key === this.lastTacKey) return;
    this.lastTacKey = key;
    const BUFF = { attack: ['ATTACK', ''], defense: ['DEFENSE', ''], health: ['HEALTH', ''] };
    this.tacticalEl.innerHTML = p.choices
      .map((c) => {
        const state = p.chosen ? (p.chosen === c ? 'picked' : 'dim') : '';
        const thumb = c.item.clip && c.item.clip.thumb ? `<img src="assets/memes/${c.item.clip.thumb}" alt="" />` : '<div class="tc-nothumb"></div>';
        const first = c.phrase.split(' ')[0];
        const rest = c.phrase.slice(first.length);
        return `<div class="tc tc-${c.buff} ${state}">
          ${thumb}
          <span class="tc-buff">${BUFF[c.buff][0]}</span>
          <span class="tc-eff" data-buff="${c.buff}">${BUFF[c.buff][1]}</span>
          <span class="tc-phrase"><b class="tc-first"><u>${first[0]}</u>${first.slice(1)}</b>${rest}</span>
        </div>`;
      })
      .join('');
  }

  // Each card states what its buff is worth right now, so the best pick changes as the fight does
  refreshTacticalValues(hero, enemy) {
    if (this.tacticalEl.hidden) return;
    const self = hero.health / hero.maxHealth;
    const foe = enemy.health / enemy.maxHealth;
    // nearly dead: healing is always the smart pick; otherwise the biggest effect wins
    const best = self < 0.3 ? 'health' : ['attack', 'defense', 'health'].reduce((a, k) => (buffValue(k, self, foe) * (k === 'health' ? 1.4 : 1) > buffValue(a, self, foe) * (a === 'health' ? 1.4 : 1) ? k : a));
    this.tacticalEl.querySelectorAll('.tc-eff').forEach((el) => {
      const kind = el.dataset.buff;
      const text = describeBuff(kind, buffValue(kind, self, foe));
      if (el.textContent !== text) el.textContent = text;
    });
    this.tacticalEl.querySelectorAll('.tc').forEach((card) => card.classList.toggle('best', !!best && card.classList.contains(`tc-${best}`) && !card.classList.contains('picked') && !card.classList.contains('dim')));
  }

  updateBuffs(combo, director) {
    const fb = director && director.tactical ? director.botBuffs : null;
    const fa = fb ? Math.max(0, Math.ceil(fb.attack)) : 0;
    const fd = fb ? Math.max(0, Math.ceil(fb.defense)) : 0;
    const a = Math.max(0, Math.ceil(combo.buffs.attack));
    const d = Math.max(0, Math.ceil(combo.buffs.defense));
    const av = Math.round(combo.buffs.attackVal * 100);
    const dv = Math.round(combo.buffs.defenseVal * 100);
    const key = `${a}|${d}|${fa}|${fd}`;
    if (key === this.lastBuffKey) return;
    this.lastBuffKey = key;
    this.buffChips.innerHTML =
      (a ? `<span class="bc bc-attack">ATTACK +${av}% ${a}s</span>` : '') +
      (d ? `<span class="bc bc-defense">DEFENSE -${dv}% ${d}s</span>` : '') +
      (fa ? `<span class="bc bc-foe">FOE ATTACK +${Math.round(fb.attackVal * 100)}% ${fa}s</span>` : '') +
      (fd ? `<span class="bc bc-foe">FOE DEFENSE -${Math.round(fb.defenseVal * 100)}% ${fd}s</span>` : '');
  }

  renderQueue(p) {
    const key = p.hasQueue() ? `${p.queuePos}|${p.currentItem ? p.currentItem.phrase : 'custom'}` : 'none';
    if (key === this.lastQueueKey) return;
    this.lastQueueKey = key;
    if (!p.hasQueue()) {
      this.queueEl.innerHTML = '';
      return;
    }
    const row = (item, cls) => `
      <div class="mq-item ${cls}">
        ${item.clip && item.clip.thumb ? `<img src="assets/memes/${item.clip.thumb}" alt="" />` : '<div class="mq-nothumb"></div>'}
        <div class="mq-text">
          <span class="mq-phrase">${item.phrase}</span>
          <span class="mq-move mq-${item.move}">${MOVE_LABELS[item.move] || ''}</span>
        </div>
      </div>`;
    const now = p.currentItem
      ? row(p.currentItem, 'now')
      : '<div class="mq-item now"><div class="mq-text"><span class="mq-phrase">CUSTOM PHRASE</span><span class="mq-move mq-beam">BEAM FINISHER</span></div></div>';
    this.queueEl.innerHTML =
      '<div class="mq-title">MEME QUEUE</div>' + now + p.peek(3).map((it) => row(it, 'next')).join('');
  }

  // The key you just pressed slides up from the bottom centre and fades out above the keybind strip
  flashKey(label, ok = true) {
    const cap = document.createElement('span');
    cap.className = `kc${ok ? '' : ' bad'}${label.length > 1 ? ' wide' : ''}`;
    cap.textContent = label;
    this.keyStream.appendChild(cap);
    while (this.keyStream.children.length > 6) this.keyStream.firstChild.remove();
    cap.addEventListener('animationend', () => cap.remove());
  }

  updateMetrics(promptManager, comboEngine) {
    this.updateBuffs(comboEngine, this.director);
    // Bottom-Left Steam HUD
    this.goodEl.textContent = promptManager.goodCount;
    this.missEl.textContent = promptManager.missCount;
    this.accEl.textContent = promptManager.getAccuracy();
    this.timeEl.textContent = promptManager.getElapsedFormatted();

    // 6-digit score formatting: e.g. 000,123
    const scoreNum = comboEngine.score;
    const formattedScore = scoreNum.toLocaleString('en-US').padStart(7, '0');
    this.scoreEl.textContent = formattedScore;

    // Sentence Progress Bar
    const progress = promptManager.getProgress() * 100;
    this.progressFill.style.width = `${progress}%`;

    // Combo Counter
    if (comboEngine.hits > 1) {
      this.comboText.classList.remove('hidden');
      this.comboText.textContent = `${comboEngine.hits} HITS!`;
    } else {
      this.comboText.classList.add('hidden');
    }

    // DMC Style Rank
    const rank = comboEngine.getCurrentRank();
    this.rankLetter.textContent = rank;
    this.rankLetter.setAttribute('data-rank', rank);
    this.rankTitle.textContent = comboEngine.getCurrentRankTitle();
    this.rankFill.style.width = `${comboEngine.getRankProgress() * 100}%`;

    // Rage Aura
    if (comboEngine.isRageMode) {
      this.rageEl.style.opacity = '1';
    } else {
      this.rageEl.style.opacity = '0';
    }
  }

  flashError() {
    this.flashEl.classList.remove('flash-active');
    void this.flashEl.offsetWidth; // Trigger reflow
    this.flashEl.classList.add('flash-active');
  }
}
