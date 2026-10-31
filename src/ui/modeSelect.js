// Meme Duel - start screen: pick the bot's difficulty (also reachable from the ESC menu).
import { DIFFICULTIES } from '../combat/difficulty.js';

const ORDER = ['easy', 'medium', 'hard'];

// 0-1 bar fills derived from the same table the AI reads, so the cards never lie
function stats(d) {
  const avgCooldown = (d.cooldown[0] + d.cooldown[1]) / 2;
  return [
    ['BOT HEALTH', d.enemyHp / 2.2],
    ['HIT POWER', d.damage / 12],
    ['SPEED', d.speed / 4.6],
    ['AGGRESSION', Math.min(1, 0.9 / avgCooldown + (d.doubleStrike ? 0.15 : 0))]
  ];
}

export class ModeSelect {
  constructor(container, initial, onPick) {
    this.container = container;
    this.onPick = onPick;
    this.isOpen = true;
    this.selected = ORDER.includes(initial) ? initial : 'medium';

    this.root = document.createElement('div');
    this.root.id = 'mode-select';
    this.root.innerHTML = `
      <div class="ms-wrap">
        <h1 class="ms-title">MEME DUEL</h1>
        <p class="ms-sub">Type the meme. Beat the bot. Pick your opponent:</p>
        <div class="ms-grid">
          ${ORDER.map((key, i) => {
            const d = DIFFICULTIES[key];
            return `
            <button class="ms-card ms-${key}" data-level="${key}">
              <span class="ms-key">${i + 1}</span>
              <span class="ms-level">${d.label}</span>
              <span class="ms-name">${d.name}</span>
              <span class="ms-blurb">${d.blurb}</span>
              <span class="ms-stats">
                ${stats(d)
                  .map(
                    ([label, v]) => `
                  <span class="ms-stat"><span class="ms-stat-label">${label}</span>
                    <span class="ms-bar"><span style="width:${Math.round(Math.max(0.08, Math.min(1, v)) * 100)}%"></span></span></span>`
                  )
                  .join('')}
              </span>
            </button>`;
          }).join('')}
        </div>
        <p class="ms-hint">Press <b>1</b>, <b>2</b> or <b>3</b>, or click a card. Change it any time from the menu (ESC).</p>
      </div>`;
    container.appendChild(this.root);

    this.cards = [...this.root.querySelectorAll('.ms-card')];
    this.cards.forEach((card) => {
      card.addEventListener('click', () => this.pick(card.dataset.level));
      card.addEventListener('mouseenter', () => this.highlight(card.dataset.level));
    });
    this.highlight(this.selected);

    // Capture phase so these keys never reach the typing game underneath
    window.addEventListener('keydown', (e) => this.onKey(e), true);
  }

  highlight(level) {
    this.selected = level;
    this.cards.forEach((c) => c.classList.toggle('active', c.dataset.level === level));
  }

  onKey(e) {
    if (!this.isOpen) return;
    const idx = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(e.code);
    if (idx >= 0) {
      e.preventDefault();
      e.stopPropagation();
      this.pick(ORDER[idx % 3]);
    } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      const step = e.code === 'ArrowRight' ? 1 : -1;
      this.highlight(ORDER[(ORDER.indexOf(this.selected) + step + 3) % 3]);
    } else if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      e.stopPropagation();
      this.pick(this.selected);
    }
  }

  pick(level) {
    if (!this.isOpen || !DIFFICULTIES[level]) return;
    this.isOpen = false;
    this.root.classList.add('closing');
    setTimeout(() => this.root.remove(), 350);
    this.onPick(level);
  }
}
