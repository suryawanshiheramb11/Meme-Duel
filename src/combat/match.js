import { addCoins } from '../core/locker.js';
// Meme Duel - rounds. A match is first to two round wins (best of three). A round ends on a KO, or
// when the clock runs out and the fighter with more health left takes it. Used for both the bot
// and online duels; online, only the host decides how a round ends and tells the guest.
const ROUNDS_TO_WIN = 2;
const ROUND_SECONDS = 99;
const INTRO_SECONDS = 4; // announcement, 3-2-1, FIGHT: a short, punchy start to every round
const BETWEEN_SECONDS = 3.2;
const FINISH_SECONDS = 6;
const FATALITY_CODE = ['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowLeft', 'Shift'];

export class Match {
  constructor({ container, hero, enemy, director, combo, fx, arena, audio, memes }) {
    Object.assign(this, { hero, enemy, director, combo, fx, arena, audio, memes });
    this.state = 'idle'; // idle | intro | fight | between | over
    this.scores = { me: 0, foe: 0 };
    this.round = 0;
    this.clock = ROUND_SECONDS;
    this.timer = 0;
    this.authority = true; // false for an online guest: the host calls round ends
    this.hooks = {}; // onRoundStart, onRoundEnd, onOver, onRematch (set by online play)
    this.names = { me: 'YOU', foe: 'FOE' };

    // Letterbox bars slide in for each round's introduction
    this.bars = document.createElement('div');
    this.bars.id = 'round-bars';
    this.bars.innerHTML = '<i></i><i></i>';
    container.appendChild(this.bars);

    this.banner = document.createElement('div');
    this.banner.id = 'round-banner';
    container.appendChild(this.banner);

    this.hint = document.createElement('div');
    this.hint.id = 'fatality-hint';
    this.hint.hidden = true;
    this.hint.innerHTML = '<span class="fh-label">FATALITY</span><span class="fh-keys"><kbd>&darr;</kbd><kbd>&darr;</kbd><kbd>&rarr;</kbd><kbd>&larr;</kbd><kbd>SHIFT</kbd></span><span class="fh-bar"><i></i></span>';
    container.appendChild(this.hint);
    this.hintBar = this.hint.querySelector('.fh-bar i');
    this.codeBuf = [];

    this.over = document.createElement('div');
    this.over.id = 'match-over';
    this.over.hidden = true;
    this.over.innerHTML = `
      <div class="mo-card">
        <p class="mo-kicker" id="mo-kicker"></p>
        <h2 class="mo-title" id="mo-title"></h2>
        <p class="mo-score" id="mo-score"></p>
        <div class="mo-actions">
          <button class="menu-btn compact" id="mo-again"><span class="mb-label">Rematch</span><span class="mb-sub">&nbsp;</span><span class="mb-key">Enter</span></button>
          <button class="menu-btn compact" id="mo-menu"><span class="mb-label">Main menu</span><span class="mb-sub">&nbsp;</span><span class="mb-key">M</span></button>
        </div>
        <p class="mo-note" id="mo-note"></p>
      </div>`;
    container.appendChild(this.over);
    this.moAgain = this.over.querySelector('#mo-again');
    this.moNote = this.over.querySelector('#mo-note');
    this.moAgain.addEventListener('click', () => this.requestRematch());
    this.over.querySelector('#mo-menu').addEventListener('click', () => this.leave());
    window.addEventListener(
      'keydown',
      (e) => {
        if (this.state === 'ready') {
          if (e.code === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            if (this.armed && !e.repeat) this.start();
          }
          return;
        }
        if (this.state === 'finish') {
          this.feedCode(e);
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (this.state !== 'over') return;
        if ((e.code === 'KeyR' || e.code === 'Enter') && !e.repeat) this.requestRematch();
        else if (e.code === 'Enter') {
          e.preventDefault();
          return;
        }
        else if (e.code === 'KeyM') this.leave();
        else return;
        e.preventDefault();
        e.stopPropagation();
      },
      true
    );

    // Round pips and the clock live in the fight bars
    const sides = document.querySelectorAll('#fight-bars .bar-side');
    this.pips = {
      me: this.addPips(sides[0].querySelector('.bar-head')),
      foe: this.addPips(sides[1].querySelector('.bar-head'))
    };
    this.vs = document.getElementById('vs-badge');
    this.setBadge(false);
  }

  // Memes and typing stay live during a round; between rounds everything waits
  get isOpen() {
    return this.state === 'ready' || this.state === 'intro' || this.state === 'between' || this.state === 'over' || this.state === 'finish' || this.state === 'fatal';
  }

  addPips(head) {
    const el = document.createElement('span');
    el.className = 'pips';
    el.innerHTML = '<i></i>'.repeat(ROUNDS_TO_WIN);
    head.appendChild(el);
    return el;
  }

  renderPips() {
    ['me', 'foe'].forEach((side) => {
      [...this.pips[side].children].forEach((p, i) => p.classList.toggle('won', i < this.scores[side]));
    });
  }

  setBadge(showClock) {
    this.vs.classList.toggle('clock', showClock);
    if (!showClock) this.vs.textContent = 'VS';
  }

  say(text, cls = '', ms = 0, html = null) {
    this.banner.className = `show ${cls}`;
    if (html) this.banner.innerHTML = html;
    else this.banner.textContent = text;
    // restart the pop animation
    void this.banner.offsetWidth;
    if (ms) {
      clearTimeout(this.bannerTimer);
      this.bannerTimer = setTimeout(() => (this.banner.className = ''), ms);
    }
  }

  clearBanner() {
    this.banner.className = '';
  }

  // ------------------------------------------------------------- flow
  /** Solo fights wait on the game screen until you press Enter. */
  waitForStart() {
    this.state = 'ready';
    this.director.paused = true;
    this.armed = false;
    setTimeout(() => (this.armed = true), 250); // the Enter that picked the level must not also start it
    this.say('PRESS ENTER TO START', 'start', 0, '<small>READY?</small><b>PRESS <u>ENTER</u> TO START</b>');
    this.banner.onclick = () => this.armed && this.start();
  }

  start() {
    this.banner.onclick = null;
    this.scores = { me: 0, foe: 0 };
    this.over.hidden = true;
    this.renderPips();
    this.beginRound(1);
  }

  beginRound(n, arenaKey) {
    this.round = n;
    this.introStep = '';
    // the arena is chosen before the match and stays; an online guest follows the host's choice
    const key = arenaKey || this.arena.currentArenaKey;
    if (key !== this.arena.currentArenaKey) this.arena.switchArena(key);
    this.state = 'intro';
    this.timer = INTRO_SECONDS;
    this.clock = ROUND_SECONDS;
    this.director.paused = true;
    this.director.resetRound();
    if (this.onRoundReset) this.onRoundReset(n);
    this.over.hidden = true;
    const last = this.scores.me === ROUNDS_TO_WIN - 1 && this.scores.foe === ROUNDS_TO_WIN - 1;
    this.bars.className = 'on';
    if (last) {
      this.say('FINAL ROUND', 'round final', 0, '<small>THE DECIDER</small><b>FINAL ROUND</b>');
      this.fx.flash('#ff2030', 0.45, 0.6);
      this.arena.triggerScreenShake(0.9);
      this.arena.punchZoom(1);
      this.audio.playImpactBoom && this.audio.playImpactBoom(1.6);
    } else {
      this.say(`ROUND ${n}`, `round r${n}`, 0, `<small>ROUND</small><b>${n}</b><em>${n === 1 ? 'BEGINS' : 'BEGINS AGAIN'}</em>`);
      this.fx.flash('#ffffff', 0.25, 0.4);
      this.arena.punchZoom(0.6);
      this.audio.playImpactBoom && this.audio.playImpactBoom(1);
    }
    this.audio.playSound && this.audio.playSound('streak_fire');
    this.setBadge(true);
    if (this.hooks.onRoundStart && this.authority) this.hooks.onRoundStart(n, key);
  }

  update(dt) {
    if (this.state === 'intro') {
      this.timer -= dt;
      const t = this.timer;
      const step = t > 2.8 ? 'round' : t > 2.1 ? '3' : t > 1.4 ? '2' : t > 0.7 ? '1' : 'fight';
      if (step !== this.introStep) {
        this.introStep = step;
        if (step === 'fight') {
          this.say('FIGHT!', 'fight');
          this.fx.flash('#ffd23a', 0.35, 0.3);
          this.arena.triggerScreenShake(0.5);
          this.audio.playImpactBoom && this.audio.playImpactBoom(1.2);
        } else if (step !== 'round') {
          this.say(step, 'count');
          this.audio.playSound && this.audio.playSound('whoosh_light');
        }
      }
      if (this.timer <= 0) {
        this.bars.className = '';
        this.state = 'fight';
        this.director.paused = !!this.noBot;
        this.combo.lastActionAt = performance.now();
        setTimeout(() => this.state === 'fight' && this.clearBanner(), 500);
      }
    } else if (this.state === 'fight') {
      this.clock = Math.max(0, this.clock - dt);
      this.vs.textContent = Math.ceil(this.clock);
      this.vs.classList.toggle('urgent', this.clock <= 10);
      if (!this.authority) return;
      const meDown = this.hero.health <= 0;
      const foeDown = this.enemy.health <= 0;
      if (meDown || foeDown) {
        // a double KO goes to whoever landed the last hit, which is whoever is still on the clock
        this.endRound(meDown && foeDown ? 'draw' : meDown ? 'foe' : 'me', 'ko');
      } else if (this.clock <= 0) {
        const a = this.hero.health / this.hero.maxHealth;
        const b = this.enemy.health / this.enemy.maxHealth;
        this.endRound(Math.abs(a - b) < 0.005 ? 'draw' : a > b ? 'me' : 'foe', 'time');
      }
    } else if (this.state === 'finish') {
      this.timer -= dt;
      this.hintBar.style.width = `${Math.max(0, (this.timer / FINISH_SECONDS) * 100)}%`;
      if (this.timer <= 0 && this.authority) {
        this.hint.hidden = true;
        this.finish();
      }
    } else if (this.state === 'fatal') {
      this.timer -= dt;
      if (this.timer <= 0 && this.authority) this.finish();
    } else if (this.state === 'between') {
      this.timer -= dt;
      if (this.timer <= 0 && this.authority && !this.finishPending) {
        if (this.scores.me >= ROUNDS_TO_WIN || this.scores.foe >= ROUNDS_TO_WIN) this.finish();
        else this.beginRound(this.round + 1);
      }
    }
  }

  /** winner: 'me' | 'foe' | 'draw'; reason: 'ko' | 'time' */
  endRound(winner, reason = 'ko') {
    if (this.state !== 'fight' && this.state !== 'intro') return;
    this.state = 'between';
    this.timer = BETWEEN_SECONDS;
    this.director.paused = true;
    this.flawless = winner === 'me' && this.hero.health >= this.hero.maxHealth - 0.01;
    if (winner === 'me' || winner === 'draw') this.scores.me += winner === 'me' ? 1 : 0;
    if (winner === 'foe') this.scores.foe += 1;
    if (winner === 'draw') {
      // a draw gives both a point unless that would end the match on a tie
      this.scores.me = Math.min(this.scores.me + 1, ROUNDS_TO_WIN);
      this.scores.foe = Math.min(this.scores.foe + 1, ROUNDS_TO_WIN);
      if (this.scores.me >= ROUNDS_TO_WIN && this.scores.foe >= ROUNDS_TO_WIN) {
        this.scores.me = this.scores.foe = ROUNDS_TO_WIN - 1;
      }
    }
    this.renderPips();
    this.setBadge(false);

    const label = reason === 'time' ? 'TIME!' : winner === 'draw' ? 'DOUBLE K.O.' : 'K.O.!';
    this.say(label, 'ko');
    if (winner === 'me') this.hero.setPose('victory', 2, true);
    if (winner === 'foe') this.enemy.setPose('victory', 2, true);
    if (reason === 'time') {
      this.audio.playSound && this.audio.playSound('knockdown');
    }
    // The deciding KO: the winner gets to finish the loser (Mortal Kombat style)
    const deciding = reason === 'ko' && winner !== 'draw' && this.scores[winner] >= ROUNDS_TO_WIN;
    if (deciding) {
      setTimeout(() => this.beginFinishHim(winner), 1100);
    } else if (this.memes && winner !== 'draw') {
      // Emotional damage, delivered between rounds to whoever just lost it
      const clip = this.memes.clips.find((c) => c.file === 'meme_093.mp4');
      if (clip) setTimeout(() => this.state === 'between' && this.memes.playClip(clip, { side: winner === 'me' ? 'right' : 'left', priority: 4, caption: 'EMOTIONAL DAMAGE' }), 600);
    }
    setTimeout(() => {
      if (this.state !== 'between' || deciding) return;
      if (this.flawless) return this.say('FLAWLESS VICTORY', 'fight');
      const ahead = winner === 'draw' ? 'DRAW' : winner === 'me' ? `${this.names.me} WINS THE ROUND` : `${this.names.foe} WINS THE ROUND`;
      this.say(ahead, 'sub');
    }, 1300);
    if (this.hooks.onRoundEnd && this.authority) this.hooks.onRoundEnd(winner, reason, { ...this.scores });
  }

  // ------------------------------------------------------------- finish him / fatality
  beginFinishHim(winner) {
    if (this.state !== 'between') return;
    this.finishWinner = winner;
    this.state = 'finish';
    this.timer = FINISH_SECONDS;
    this.codeBuf = [];
    this.say('FINISH HIM!', 'ko');
    this.audio.playImpactBoom && this.audio.playImpactBoom(1);
    if (winner === 'me') {
      this.hint.hidden = false;
      this.hint.classList.remove('ok');
    } else {
      this.say(winner === 'foe' ? 'FINISH HER!' : 'FINISH HIM!', 'ko');
    }
  }

  feedCode(e) {
    if (e.repeat || this.finishWinner !== 'me') return;
    const key = e.code.startsWith('Shift') ? 'Shift' : e.code;
    if (!['ArrowDown', 'ArrowRight', 'ArrowLeft', 'ArrowUp', 'Shift'].includes(key)) return;
    this.codeBuf.push(key);
    this.codeBuf = this.codeBuf.slice(-FATALITY_CODE.length);
    this.hint.classList.toggle('ok', FATALITY_CODE.slice(0, this.codeBuf.length).join() === this.codeBuf.join());
    if (this.codeBuf.join() === FATALITY_CODE.join()) {
      const kind = Math.random() < 0.5 ? 'rain' : 'beam';
      this.fatality(kind, true);
      if (this.hooks.onFatality) this.hooks.onFatality(kind);
    }
  }

  /** byMe: I deliver it. Otherwise the opponent finished me. */
  fatality(kind, byMe) {
    if (this.state !== 'finish' && this.state !== 'between') return;
    this.state = 'fatal';
    this.fatalityDone = byMe;
    this.timer = 3.6;
    this.hint.hidden = true;
    const winner = byMe ? this.hero : this.enemy;
    const loser = byMe ? this.enemy : this.hero;
    const { fx, arena, audio, memes } = this;
    this.clearBanner();
    fx.flash('#000000', 0.55, 0.5);
    arena.punchZoom(1.1);
    winner.setPose('victory', 3, true);

    const explode = () => {
      loser.group.visible = false;
      loser.shadowMesh.visible = false;
      fx.impact(loser.x, 1.2, { size: 3.6, color: 0xff3344 });
      fx.hitSpark(loser.x, 1.3, { size: 2.4, color: 0xff3344, count: 40 });
      fx.hitSpark(loser.x, 1.3, { size: 1.8, color: 0xffffff, count: 30 });
      fx.shockwave(loser.x, 7, 0xff3344, 0.9);
      fx.flash('#ffffff', 0.7, 0.35);
      arena.triggerScreenShake(1.4);
      audio.playImpactBoom(1.8);
      audio.playSound('knockdown');
      this.say('FATALITY', 'ko');
      if (memes) memes.trigger('ko', { priority: 4, force: true, side: byMe ? 'right' : 'left' });
    };

    if (kind === 'beam') {
      audio.playSound('streak_fire');
      fx.startBeam({ hero: winner, enemy: loser, form: byMe ? this.combo.form : 'base', charge: 0.9, fire: 0.9, onFire: () => setTimeout(explode, 250) });
      winner.setPose('charge2', 0.9, true);
    } else {
      const clips = memes ? memes.clips.filter((c) => c.thumb) : [];
      const urls = [...clips].sort(() => Math.random() - 0.5).slice(0, 8).map((c) => `assets/memes/${c.thumb}`);
      if (urls.length) {
        fx.memeRain({ x: loser.x, urls, count: 26, span: 1.1, onLand: (i) => {
          fx.hitSpark(loser.x, 1.2 + (i % 3) * 0.3, { size: 1.1, color: 0xffe27a, count: 8 });
          audio.playCombatHit(i % 4 === 0 ? 'heavy' : 'light');
          arena.triggerScreenShake(0.25);
        } });
      }
      setTimeout(explode, 1700);
    }
  }

  finish() {
    this.hint.hidden = true;
    this.state = 'over';
    this.director.paused = true;
    const won = this.scores.me > this.scores.foe;
    this.clearBanner();
    this.over.hidden = false;
    this.over.classList.toggle('won', won);
    this.over.querySelector('#mo-kicker').textContent = won ? 'MATCH WON' : 'MATCH LOST';
    this.over.querySelector('#mo-title').textContent = won ? 'VICTORY' : 'DEFEATED';
    this.over.querySelector('#mo-score').textContent = `${this.names.me} ${this.scores.me} - ${this.scores.foe} ${this.names.foe}`;
    this.moNote.textContent = '';
    this.moAgain.disabled = false;
    // coins for the store: rounds won, a bonus for the match, and for a fatality
    const earned = this.scores.me * 15 + (won ? 60 : 20) + (this.fatalityDone ? 40 : 0);
    addCoins(earned);
    this.over.querySelector('#mo-score').textContent += `   +${earned} COINS`;
    this.fatalityDone = false;
    if (won && this.memes) this.memes.trigger('victory', { priority: 3, side: 'left' });
    if (this.hooks.onOver && this.authority) this.hooks.onOver(this.scores.me, this.scores.foe);
  }

  /** The guest's mirror of what the host decided */
  applyRoundEnd(winner, reason, scores) {
    if (this.state === 'between' || this.state === 'over') return;
    this.state = 'fight';
    this.endRound(winner, reason);
    this.scores = { me: scores.me, foe: scores.foe };
    this.renderPips();
  }

  applyOver(me, foe) {
    this.scores = { me, foe };
    this.renderPips();
    this.finish();
  }

  /** The other player left mid-match: you take the win */
  abort(message) {
    if (this.state === 'over') return;
    this.state = 'over';
    this.director.paused = true;
    this.hint.hidden = true;
    this.clearBanner();
    this.over.hidden = false;
    this.over.classList.add('won');
    this.over.querySelector('#mo-kicker').textContent = message;
    this.over.querySelector('#mo-title').textContent = 'YOU WIN';
    this.over.querySelector('#mo-score').textContent = '';
    this.moAgain.disabled = true;
    this.moNote.textContent = 'Your opponent disconnected.';
  }

  requestRematch() {
    if (this.hooks.onRematch) {
      this.moAgain.disabled = true;
      this.moNote.textContent = 'Waiting for your opponent...';
      this.hooks.onRematch();
    } else {
      this.start();
    }
  }

  leave() {
    if (this.hooks.onLeave) this.hooks.onLeave();
    location.href = location.pathname;
  }
}
