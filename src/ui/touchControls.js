// Meme Duel - phone controls. Shown only on touch devices: a TYPE button that opens the on-screen
// keyboard (letters are forwarded to the game as ordinary key presses) plus tap buttons for the
// keys a phone doesn't have: walk, jump, guard, slam, meme throw, dash and the pause menu.

const KEYS = {
  left: { key: 'ArrowLeft', code: 'ArrowLeft', hold: true },
  right: { key: 'ArrowRight', code: 'ArrowRight', hold: true },
  jump: { key: 'ArrowUp', code: 'ArrowUp' },
  guard: { key: 'ArrowDown', code: 'ArrowDown', hold: true },
  slam: { key: 'Enter', code: 'Enter' },
  throw: { key: 'Shift', code: 'ShiftLeft' },
  dash: { key: 'Tab', code: 'Tab' },
  pause: { key: 'Escape', code: 'Escape' }
};

const fire = (type, key, code) => window.dispatchEvent(new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true }));

export function isTouchDevice() {
  return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}

function codeFor(ch) {
  if (ch === ' ') return 'Space';
  if (/[a-z]/i.test(ch)) return `Key${ch.toUpperCase()}`;
  if (/[0-9]/.test(ch)) return `Digit${ch}`;
  return '';
}

export function createTouchControls(container) {
  document.body.classList.add('touch-ui');
  const root = document.createElement('div');
  root.id = 'touch-controls';
  root.innerHTML = `
    <button type="button" class="tc-btn tc-type pulse" data-tc="type">TAP TO TYPE</button>
    <button type="button" class="tc-btn tc-small tc-pause" data-tc="pause" aria-label="Pause">II</button>
    <div class="tc-pad tc-left">
      <button type="button" class="tc-btn" data-tc="left" aria-label="Walk left">&#9664;</button>
      <button type="button" class="tc-btn" data-tc="right" aria-label="Walk right">&#9654;</button>
    </div>
    <div class="tc-pad tc-right">
      <button type="button" class="tc-btn" data-tc="jump">JUMP</button>
      <button type="button" class="tc-btn" data-tc="guard">GUARD</button>
      <button type="button" class="tc-btn" data-tc="slam">SLAM</button>
      <button type="button" class="tc-btn" data-tc="throw">THROW</button>
      <button type="button" class="tc-btn" data-tc="dash">DASH</button>
    </div>
    <input type="text" id="tc-input" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" inputmode="text" aria-label="Type here" />`;
  container.appendChild(root);

  const input = root.querySelector('#tc-input');
  const typeBtn = root.querySelector('.tc-type');
  const focusInput = () => {
    input.focus({ preventScroll: true });
    typeBtn.classList.remove('pulse');
  };

  // letters typed on the soft keyboard become key presses; a real keyboard's keys are left to the page
  input.addEventListener('keydown', (e) => {
    if (e.key.length === 1) e.stopPropagation();
  });
  input.addEventListener('input', () => {
    for (const ch of input.value) {
      const code = codeFor(ch);
      if (!code) continue;
      fire('keydown', ch, code);
      fire('keyup', ch, code);
    }
    input.value = '';
  });
  input.addEventListener('blur', () => typeBtn.classList.add('pulse'));

  root.querySelectorAll('[data-tc]').forEach((btn) => {
    const name = btn.dataset.tc;
    if (name === 'type') {
      btn.addEventListener('click', focusInput);
      return;
    }
    const k = KEYS[name];
    const down = (e) => {
      e.preventDefault();
      btn.classList.add('down');
      fire('keydown', k.key, k.code);
      if (!k.hold) setTimeout(up, 60);
    };
    const up = () => {
      btn.classList.remove('down');
      fire('keyup', k.key, k.code);
    };
    btn.addEventListener('pointerdown', down);
    if (k.hold) ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => btn.addEventListener(t, up));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });
  return root;
}
