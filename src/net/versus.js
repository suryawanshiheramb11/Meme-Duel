// Meme Duel - online duel rules and sync.
//
// Each browser simulates only its own fighter. The opponent shows up as a "puppet": the enemy
// fighter driven by a 20 Hz state stream (position, pose, guard, form). Damage is decided by the
// player being hit: the attacker's game sends a `hit` event, the defender applies it to their own
// health (honouring their guard and dash) and reports the result back in the state stream.
// The host also keeps the round clock, decides how rounds end, and tells the guest.
import { VERSUS } from '../combat/difficulty.js';
import { currentGear, isValidGear } from '../core/locker.js';

const STATE_MS = 50;
const MAX_HIT = 40;

export class Versus {
  constructor(app, session) {
    this.app = app;
    this.session = session;
    this.host = session.role === 'host';
    const { hero, enemy: puppet, director, combo, match, hud } = app;
    this.hero = hero;
    this.puppet = puppet;
    this.match = match;
    this.combo = combo;
    this.remote = null;
    this.sinceState = 0;
    this.lastPose = '';
    this.puppetDead = false;
    this.wantRematch = { me: false, foe: false };

    // Rules: no bot, no secret moves, plain damage
    director.versus = true;
    director.mirror = !this.host;
    director.paused = true;
    director.setDifficulty = () => {};
    combo.difficulty = VERSUS;
    combo.difficultyKey = 'versus';
    combo.secretsEnabled = false;
    match.noBot = true;
    match.authority = this.host;
    match.names = { me: 'YOU', foe: 'RIVAL' };
    puppet.hover = true; // its height is driven by the stream, not by gravity
    puppet.capColor = '#ff5560';
    puppet.variant = 'cap';

    hud.lastEnemyNumber = `${director.enemyNumber}|${director.diffKey}|${director.diff.personalityLabel || ''}`;
    hud.enemyName.textContent = 'RIVAL';
    hud.enemyKos.textContent = this.host ? 'GUEST' : 'HOST';

    this.chip = document.createElement('div');
    this.chip.id = 'net-chip';
    app.container.appendChild(this.chip);

    this.wrapPuppet();
    this.wrapCombo();
    this.wireMatch();
    session.onMessage((m) => this.onMessage(m));
    session.onClose(() => this.onGone());
    window.addEventListener('beforeunload', () => {
      session.send({ t: 'bye' });
      session.close();
    });
    this.app.versus = this;
    // show each other's store gear
    session.send({ t: 'gear', g: currentGear() });

    // The host starts once the guest confirms it is listening
    if (this.host) this.guestReady = false;
    else {
      // keep announcing until the host's first round message arrives (the host may still be loading)
      this.readyTimer = setInterval(() => session.send({ t: 'ready' }), 500);
      session.send({ t: 'ready' });
    }
  }

  // ------------------------------------------------------------- outgoing
  wrapPuppet() {
    const p = this.puppet;
    const original = p.takeHit.bind(p);
    p.takeHit = (damage = 10, opts = {}) => {
      if (this.match.state !== 'fight' || this.puppetDead) return { hit: false, ko: false };
      const real = p.health;
      p.health = 1e9; // the visual reaction only: the opponent's own game decides the damage
      original(damage, opts);
      p.health = Math.max(1, real - damage); // predicted bar until their report arrives
      const { launch, knock, stun, quiet, stagger } = opts;
      this.session.send({ t: 'hit', d: Math.round(damage * 10) / 10, o: { launch, knock, stun, quiet, stagger } });
      return { hit: true, ko: false };
    };
  }

  wrapCombo() {
    const c = this.combo;
    const special = c.triggerSpecial.bind(c);
    c.triggerSpecial = (h, e, item) => {
      this.session.send({ t: 'sp', f: item && item.clip && item.clip.file, m: item && item.move, ph: item && item.phrase });
      return special(h, e, item);
    };
    const beam = c.triggerBeam.bind(c);
    c.triggerBeam = (h, e, o) => {
      if (h === this.hero) this.session.send({ t: 'bm' });
      return beam(h, e, o);
    };
    const toss = c.throwMeme.bind(c);
    c.throwMeme = (h, e) => {
      const ok = toss(h, e);
      if (ok) this.session.send({ t: 'th' });
      return ok;
    };
  }

  wireMatch() {
    const m = this.match;
    m.hooks.onRoundStart = (n, a) => {
      this.puppetDead = false;
      this.session.send({ t: 'round', n, a });
    };
    m.hooks.onRoundEnd = (w, r, s) =>
      this.session.send({ t: 'rend', w: w === 'me' ? 'host' : w === 'foe' ? 'guest' : 'draw', r, s: [s.me, s.foe] });
    m.hooks.onOver = (me, foe) => this.session.send({ t: 'over', s: [me, foe] });
    m.hooks.onFatality = (kind) => this.session.send({ t: 'fat', k: kind });
    m.hooks.onLeave = () => {
      this.session.send({ t: 'bye' });
      this.session.close();
    };
    m.hooks.onRematch = () => {
      this.wantRematch.me = true;
      this.session.send({ t: 'rematch' });
      this.tryRematch();
    };
  }

  tryRematch() {
    if (!(this.wantRematch.me && this.wantRematch.foe)) return;
    this.wantRematch = { me: false, foe: false };
    if (this.host) this.match.start();
  }

  sendState(force) {
    const h = this.hero;
    this.session.send({
      t: 's',
      x: Math.round(h.x * 100) / 100,
      y: Math.round(h.y * 100) / 100,
      f: h.facing,
      p: h.pose,
      w: h.walking ? 1 : 0,
      a: h.isAirborne ? 1 : 0,
      g: h.guarding ? 1 : 0,
      fm: h.form,
      hp: Math.round(h.health * 10) / 10
    });
    this.sinceState = 0;
    this.lastPose = h.pose;
  }

  // ------------------------------------------------------------- incoming
  onMessage(m) {
    const { match, hero, puppet, app } = this;
    switch (m.t) {
      case 'gear':
        puppet.gear = isValidGear(m.g) ? m.g : null;
        break;
      case 'ready':
        if (this.host && !this.guestReady) {
          this.guestReady = true;
          match.start();
        }
        break;
      case 's':
        this.remote = m;
        break;
      case 'hit':
        this.takeIncoming(m);
        break;
      case 'round':
        if (this.host) break;
        clearInterval(this.readyTimer);
        if (m.n === 1) {
          match.scores = { me: 0, foe: 0 };
          match.renderPips();
        }
        this.puppetDead = false;
        match.beginRound(m.n, m.a);
        break;
      case 'rend': {
        if (this.host) break;
        const w = m.w === 'guest' ? 'me' : m.w === 'host' ? 'foe' : 'draw';
        match.applyRoundEnd(w, m.r, { me: m.s[1], foe: m.s[0] });
        break;
      }
      case 'over':
        if (!this.host) match.applyOver(m.s[1], m.s[0]);
        break;
      case 'fat':
        match.fatality(m.k, false);
        break;
      case 'rematch':
        this.wantRematch.foe = true;
        if (match.state === 'over') match.moNote.textContent = 'Your opponent wants a rematch.';
        this.tryRematch();
        break;
      case 'sp': {
        const clip = m.f && app.memes.clips.find((c) => c.file === m.f);
        app.fx.floatText(m.ph || 'SPECIAL', puppet.x, 3.2, { color: '#ffd23a', size: 30, cls: 'fx-pop' });
        if (clip) app.memes.playClip(clip, { side: 'right', priority: 3, caption: m.ph });
        break;
      }
      case 'bm':
        app.fx.startBeam({
          hero: puppet,
          enemy: hero,
          form: puppet.form,
          charge: 0.55,
          fire: 0.62,
          onFire: () => {
            app.audio.playCombatHit('crit');
            app.arena.punchZoom(0.7);
          }
        });
        break;
      case 'th': {
        const clips = app.memes.clips.filter((c) => c.thumb);
        if (!clips.length) break;
        const clip = clips[Math.floor(Math.random() * clips.length)];
        app.fx.floatText('MEME!', puppet.x, 2.5, { color: '#ffe27a', size: 24, cls: 'fx-pop' });
        app.fx.throwMeme({
          fromX: puppet.x + puppet.facing * 0.5,
          fromY: puppet.y + 1.35,
          dir: puppet.facing,
          url: `assets/memes/${clip.thumb}`,
          target: hero,
          speed: 13,
          onArrive: () => {}
        });
        break;
      }
      case 'bye':
        this.onGone();
        break;
    }
  }

  // I am the defender: decide what the hit does to me
  takeIncoming(m) {
    const { match, hero, app } = this;
    if (match.state !== 'fight' || hero.health <= 0) return;
    const o = m.o || {};
    const blocked = hero.guarding;
    let d = Math.min(MAX_HIT, Math.max(0, Number(m.d) || 0));
    if (blocked) d *= 0.3;
    const res = hero.takeHit(d, {
      launch: blocked ? 0 : o.launch || 0,
      knock: blocked ? 0.05 : o.knock == null ? 0.3 : o.knock,
      stun: blocked ? 0 : o.stun == null ? 0.26 : o.stun,
      quiet: blocked || !!o.quiet,
      stagger: !blocked && o.stagger !== false
    });
    if (!res.hit) return; // dodged with a dash
    app.audio.playCombatHit(d >= 12 ? 'heavy' : 'light');
    app.fx.hitSpark(hero.x, hero.y + 1.3, { size: blocked ? 0.8 : 1.1, color: blocked ? 0x7dd3ff : 0xffe27a });
    app.arena.triggerScreenShake(blocked ? 0.1 : Math.min(0.5, 0.15 + d / 60));
    if (blocked) {
      hero.guardTimer = 0.3;
      app.fx.floatText('BLOCKED', hero.x, 2.6, { color: '#9be8ff', size: 24, cls: 'fx-pop' });
    } else {
      this.combo.onHeroHit();
    }
    this.sendState(true);
  }

  onGone() {
    if (this.gone) return;
    this.gone = true;
    this.chip.textContent = 'DISCONNECTED';
    this.chip.classList.add('bad');
    if (this.match.state !== 'over') this.match.abort('OPPONENT LEFT');
  }

  // ------------------------------------------------------------- per frame
  update(dt) {
    if (this.gone) return;
    const { hero, puppet, remote } = this;
    this.sinceState += dt;
    if (this.sinceState >= STATE_MS / 1000 || hero.pose !== this.lastPose) this.sendState();

    if (remote) {
      const k = Math.min(1, dt * 16);
      puppet.x += (remote.x - puppet.x) * k;
      puppet.y += (remote.y - puppet.y) * k;
      puppet.vx = 0;
      puppet.slideTarget = null;
      puppet.walking = !!remote.w;
      puppet.isAirborne = !!remote.a;
      puppet.guarding = !!remote.g;
      puppet.form = remote.fm;
      if (!this.puppetDead) {
        puppet.health = remote.hp;
        if (remote.p !== puppet.pose) puppet.setPose(remote.p, 0.3, true);
        else if (remote.p !== 'guard') puppet.poseTimer = Math.max(puppet.poseTimer, 0.12);
      }
      if (remote.hp <= 0 && !this.puppetDead && this.match.state === 'fight') {
        this.puppetDead = true;
        puppet.ko(5);
        this.combo.onKO(puppet, hero);
      }
    }

    const ping = this.session.pingMs;
    this.chipTimer = (this.chipTimer || 0) + dt;
    if (this.chipTimer > 1) {
      this.chipTimer = 0;
      this.chip.textContent = ping == null ? 'ONLINE' : `ONLINE ${ping} ms`;
    }
  }
}
