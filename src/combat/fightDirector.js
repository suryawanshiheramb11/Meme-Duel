// Keyboard Warrior Stickman - Fight Director
// Runs everything that happens *between* keystrokes: the enemy walking in and fighting back,
// fighters facing each other, the hero hovering during air juggles, afterimage trails,
// KO / respawn, and the camera focus point.
import { buffValue, botBuffWeights, DURATION as BUFF_SECONDS } from './buffs.js';
import { ATTACKS, DIFFICULTIES, DEFAULT_DIFFICULTY, PERSONALITIES, withPersonality, randBetween, pickWeighted, saveDifficulty } from './difficulty.js';

const FIGHT_GAP = 1.05; // preferred distance between fighters
const ENEMY_BOUND = 6.1;
const HERO_BOUND = 5.4;
// Fighters carry 4x the old base health (400), so a round is a real fight, not a few combos
export const HEALTH_SCALE = 4;
const TINTS = { base: '#9be8ff', ssj: '#ffd23a', blue: '#4fc3ff', ui: '#e8f0ff' };

export class FightDirector {
  constructor({ hero, enemy, combo, fx, arena, audio }) {
    this.hero = hero;
    this.enemy = enemy;
    this.combo = combo;
    this.fx = fx;
    this.arena = arena;
    this.audio = audio;

    hero.maxHealth = hero.health = Math.round(100 * HEALTH_SCALE);
    enemy.maxHealth = enemy.health = Math.round(100 * HEALTH_SCALE);
    this.enemyDownTimer = 0;
    this.heroDownTimer = 0;
    this.tactical = false; // tactical mode: the bot plays attack / defense / health buffs too
    this.botBuffs = { attack: 0, defense: 0, attackVal: 0, defenseVal: 0, wait: 8 };
    this.attackCooldown = 3;
    this.punishPending = false;
    this.attack = null; // { type, spec, t, windup, struck, second, double, punish }
    this.queuedAttack = null; // an attack the bot has decided on (e.g. a counter-poke)
    this.ultraTimer = Infinity; // seconds until the next unblockable ultra
    this.entering = false;
    this.afterimageTimer = 0;
    this.dustTimer = 0;
    this.sinceHeroHurt = 99;
    this.enemyNumber = 1;
    this.memes = null; // meme reaction player, set by the app
    this.paused = false; // true while the mode picker is up

    this.diffKey = DEFAULT_DIFFICULTY;
    this.baseDiff = DIFFICULTIES[this.diffKey];
    this.personality = 'balanced';
    this.diff = withPersonality(this.baseDiff, this.personality);
    combo.difficulty = this.diff;
    combo.difficultyKey = this.diffKey;

    // What the bot has learned about how you play (see updateHabits)
    this.habits = { jump: [], launcher: [], dashIn: [], hit: [] };
    this.guardAcc = 0;
    this.enraged = false; // the bot's final form
    this.memeTimer = Infinity; // seconds until the bot next hurls a meme
    this.pendingChain = 0;

    combo.onMiss = () => this.punish();
    combo.onDashIn = () => this.counterPoke();
    combo.onHabit = (kind) => this.noteHabit(kind);
    combo.onParry = () => this.forceAttack('punch');
    combo.onDodge = () => {
      if (Math.random() < (this.diff.counterAfterDodge || 0) && !this.attack) this.forceAttack(Math.random() < 0.6 ? 'jab' : 'punch');
    };
    // The bot sees your special coming and tries to be somewhere else
    combo.onSpecialStart = (move) => this.avoidSpecial(move);
    combo.onThrowStart = () => this.avoidThrow();
    this.resetUltraTimer();
  }

  // ------------------------------------------------------------- learning the player
  noteHabit(kind) {
    const list = this.habits[kind];
    if (!list) return;
    list.push(performance.now());
    if (list.length > 24) list.shift();
  }

  // What you've been doing lately, as the bot sees it
  readHabits() {
    const now = performance.now();
    const within = (arr, ms) => arr.filter((t) => now - t < ms).length;
    return {
      jumpy: within(this.habits.jump, 6000) >= 2,
      launcherSpam: within(this.habits.launcher, 10000) >= 2,
      dashy: within(this.habits.dashIn, 8000) >= 2,
      fast: within(this.habits.hit, 3000) >= 10,
      turtle: this.guardAcc > 2.4
    };
  }

  updateHabits(dt) {
    const h = this.hero;
    this.guardAcc = Math.max(0, Math.min(6, this.guardAcc + (h.guarding ? dt : -dt * 0.5)));
    if (!(this.diff.smart && this.diff.smart.habits)) {
      this.combo.dynamic = {};
      this.habitState = null;
      return;
    }
    const hb = (this.habitState = this.readHabits());
    // The bot adapts: spam the launcher and it starts reading it, hammer keys and it guards more,
    // dash in over and over and it meets you with a poke.
    this.combo.dynamic = { reads: hb.launcherSpam ? 0.3 : 0, guard: hb.fast ? 0.12 : 0, poke: hb.dashy ? 0.25 : 0 };
  }

  resetUltraTimer() {
    this.ultraTimer = this.diff.ultra ? randBetween(this.diff.ultra.every) * 0.7 : Infinity;
    const meme = this.diff.smart && this.diff.smart.meme;
    this.memeTimer = meme ? randBetween(meme.every) * 0.8 : Infinity;
  }

  rollPersonality() {
    if (this.diffKey === 'easy') return 'balanced';
    const keys = Object.keys(PERSONALITIES);
    return keys[Math.floor(Math.random() * keys.length)];
  }

  rebuildDiff() {
    this.diff = withPersonality(this.baseDiff, this.personality);
    // the fighters carry more health now, so the bot hits proportionally harder
    this.diff.damage = this.baseDiff.damage * HEALTH_SCALE * 0.8;
    this.combo.difficulty = this.diff;
    this.combo.difficultyKey = this.diffKey;
  }

  // The bot decides to throw a specific attack right away (it read what you just did).
  forceAttack(type) {
    this.queuedAttack = type;
    this.attackCooldown = Math.min(this.attackCooldown, 0.12);
  }

  // ------------------------------------------------------------- tactical mode: the bot's buffs
  botAttackMul() {
    return this.tactical && this.botBuffs.attack > 0 ? 1 + this.botBuffs.attackVal : 1;
  }

  /** Incoming damage on the bot after its defense buff (the app wraps enemy.takeHit with this). */
  botDefenseMul() {
    return this.tactical && this.botBuffs.defense > 0 ? 1 - this.botBuffs.defenseVal : 1;
  }

  updateBotBuffs(dt) {
    const b = this.botBuffs;
    if (b.attack > 0) b.attack -= dt;
    if (b.defense > 0) b.defense -= dt;
    const e = this.enemy;
    if (e.health <= 0 || this.entering) return;
    b.wait -= dt;
    if (b.wait > 0) return;
    // Read the fight: how hurt each side is, and whether the player just powered up
    const botFrac = e.health / e.maxHealth;
    const heroFrac = this.hero.health / this.hero.maxHealth;
    const kind = pickWeighted(botBuffWeights(botFrac, heroFrac, this.combo.buffs.attack > 0));
    const value = buffValue(kind, botFrac, heroFrac);
    const pct = Math.round(value * 100);
    if (kind === 'attack') {
      b.attack = BUFF_SECONDS;
      b.attackVal = value;
    } else if (kind === 'defense') {
      b.defense = BUFF_SECONDS;
      b.defenseVal = value;
    } else {
      e.health = Math.min(e.maxHealth, e.health + Math.round(e.maxHealth * value));
    }
    const label = kind === 'health' ? `FOE HEALS ${pct}%` : kind === 'attack' ? `FOE ATTACK +${pct}%` : `FOE DEFENSE -${pct}%`;
    this.fx.floatText(label, e.x, 3.3, { color: kind === 'attack' ? '#ff9a3c' : kind === 'defense' ? '#ecedf1' : '#7dff9a', size: 30, cls: 'fx-pop' });
    this.fx.ringBurst(e.x, 1.3, 3, kind === 'attack' ? 0xff9a3c : kind === 'defense' ? 0xecedf1 : 0x7dff9a, 0.4);
    this.audio.playSound('streak_fire');
    // harder bots play a card more often
    const gap = { easy: [16, 22], medium: [11, 16], hard: [7, 11] }[this.diffKey] || [12, 18];
    b.wait = randBetween(gap);
  }

  avoidSpecial(move) {
    const e = this.enemy;
    if (this.versus || e.health <= 0 || this.entering || this.paused) return;
    if (Math.random() >= (this.diff.avoidSpecial || 0)) return;
    const h = this.hero;
    const away = Math.sign(e.x - h.x) || 1;
    // Slip out of the way: a burst of invulnerability and a dash to the far side
    e.invulnTimer = Math.max(e.invulnTimer, move === 'beam' ? 1.5 : 1.3);
    e.slideTo(Math.max(-6, Math.min(6, e.x + away * (move === 'beam' ? 2.4 : 1.8))), this.diff.dodgeSpeed || 30);
    this.fx.afterimage(e, '#9be8ff', 0.4);
    this.fx.floatText('SAW IT COMING', e.x, e.y + 2.5, { color: '#9be8ff', size: 24, cls: 'fx-pop' });
    this.attackCooldown = Math.min(this.attackCooldown, 0.4);
  }

  avoidThrow() {
    const e = this.enemy;
    if (this.versus || e.health <= 0 || this.entering) return;
    if (Math.random() >= (this.diff.avoidSpecial || 0) * 1.2) return;
    setTimeout(() => {
      e.invulnTimer = Math.max(e.invulnTimer, 0.7);
      if (!e.isAirborne) e.jump(7);
    }, 150);
  }

  // You dashed in from range: harder bots meet you with a quick poke.
  counterPoke() {
    const chance = this.diff.pokesDashIn + (this.combo.dynamic.poke || 0);
    if (Math.random() < chance && !this.attack && this.enemy.health > 0) this.forceAttack('jab');
  }

  // Switch the bot's level. The current enemy is rescaled in place, keeping its health fraction.
  setDifficulty(key, { save = true } = {}) {
    if (!DIFFICULTIES[key]) return;
    this.diffKey = key;
    this.baseDiff = DIFFICULTIES[key];
    this.personality = this.rollPersonality();
    this.rebuildDiff();
    this.enraged = false;
    this.enemy.form = 'base';
    const e = this.enemy;
    const frac = e.maxHealth > 0 ? e.health / e.maxHealth : 1;
    e.maxHealth = this.scaledEnemyHealth();
    e.health = e.health > 0 ? Math.max(1, Math.round(frac * e.maxHealth)) : 0;
    this.attackCooldown = Math.max(this.attackCooldown, 1.5);
    this.attack = null;
    this.resetUltraTimer();
    if (save) saveDifficulty(key);
  }

  scaledEnemyHealth() {
    return Math.round((100 + this.combo.kills * 15) * this.diff.enemyHp * (this.versus ? 1 : 1) * HEALTH_SCALE);
  }

  // A typo can invite an immediate counter, depending on the level.
  punish() {
    if (Math.random() >= this.diff.counterOnTypo) return;
    this.attackCooldown = Math.min(this.attackCooldown, 0.12);
    this.punishPending = true;
  }

  update(dt) {
    if (this.paused && !this.versus) {
      this.frameFighters();
      return;
    }
    const h = this.hero;
    const e = this.enemy;
    this.sinceHeroHurt += dt;

    this.updateFacing();
    // Online duels have no bot: only facing, bounds, trails and the camera need running
    if (!this.versus) {
      this.updateHabits(dt);
      this.updateEnemy(dt);
      if (this.tactical && !this.paused) this.updateBotBuffs(dt);
    }
    this.updateHero(dt);
    this.updateTrails(dt);

    this.frameFighters();
  }

  // Keep both fighters inside the arena and on screen. Also runs while paused (KO, finish him,
  // fatality), when a knocked-down fighter is still sliding.
  frameFighters() {
    const h = this.hero;
    const e = this.enemy;
    h.x = Math.max(-HERO_BOUND, Math.min(HERO_BOUND, h.x));
    if (this.versus) {
      e.x = Math.max(-HERO_BOUND, Math.min(HERO_BOUND, e.x));
    } else if (!this.entering) {
      if (e.x > ENEMY_BOUND) { e.x = ENEMY_BOUND; e.vx = Math.min(0, e.vx); }
      if (e.x < -ENEMY_BOUND) { e.x = -ENEMY_BOUND; e.vx = Math.max(0, e.vx); }
      // Safety net: the opponent never leaves the visible screen, whatever the screen shape
      const lim = this.arena.worldHalfWidth() - 1.1;
      const lo = this.arena.camX - lim;
      const hi = this.arena.camX + lim;
      if (e.x > hi) { e.x = hi; e.vx = Math.min(0, e.vx); }
      if (e.x < lo) { e.x = lo; e.vx = Math.max(0, e.vx); }
      if (h.x > hi) { h.x = hi; h.vx = Math.min(0, h.vx); }
      if (h.x < lo) { h.x = lo; h.vx = Math.max(0, h.vx); }
    }

    if (this.entering) this.arena.setFocus(h.x, 0);
    else this.arena.setFocus((h.x + e.x) / 2, Math.abs(e.x - h.x));
  }

  updateFacing() {
    const h = this.hero;
    const e = this.enemy;
    if (e.health <= 0 && e.pose === 'knockdown') return;
    const dir = Math.sign(e.x - h.x) || h.facing;
    h.facing = dir;
    e.facing = -dir;
  }

  // ------------------------------------------------------------- enemy
  updateEnemy(dt) {
    const h = this.hero;
    const e = this.enemy;
    const smart = this.diff.smart;

    if (e.health <= 0) {
      e.walking = false;
      this.attack = null;
      this.enemyDownTimer += dt;
      if (this.enemyDownTimer > 2.6 && !e.isAirborne) this.respawnEnemy();
      return;
    }

    // Last stand: the hardest bot has one more form
    if (smart && smart.rage && !this.enraged && !this.entering && e.health < e.maxHealth * 0.3) this.goFinalForm();

    // Landing a hit on a winding-up bot interrupts the attack, which is the counter to its ultra
    if (this.attack && (e.pose === 'hurt' || e.isAirborne)) {
      if (this.attack.type === 'ultra') {
        this.fx.floatText('INTERRUPTED!', e.x, e.y + 2.4, { color: '#7dff9a', size: 30, cls: 'fx-pop' });
        this.combo.addStylePoints(30);
      }
      this.attack = null;
    }

    const busy = e.isAirborne || e.pose === 'hurt' || e.pose === 'knockdown' || e.lockTimer > 0 || this.attack;
    e.walking = false;

    if (!busy) {
      const side = e.x >= h.x ? 1 : -1;
      const want = h.x + side * FIGHT_GAP;
      const diff = want - e.x;
      if (Math.abs(diff) > 0.1) {
        const speed = this.entering ? 6.2 : this.diff.speed * (this.enraged ? 1.3 : 1);
        e.x += Math.sign(diff) * Math.min(Math.abs(diff), speed * dt);
        e.walking = true;
        e.walkSpeed = speed;
      }
      if (this.entering && Math.abs(e.x - h.x) < 4.5) this.entering = false;

      this.attackCooldown -= dt;
      if (!this.entering) {
        this.ultraTimer -= dt;
        this.memeTimer -= dt;
      }
      // A smart bot will swing at you in mid-air if you keep jumping; a plain one waits for you to land
      const jumpedByYou = h.isAirborne && !h.hover && h.selfJump && h.y > 0.4;
      const heroOpen = h.health > 0 && h.lockTimer <= 0 && !this.entering && (!h.isAirborne || (smart && jumpedByYou));
      const closeEnough = Math.abs(e.x - h.x) < (this.ultraTimer <= 0 ? 2.0 : 1.5);
      if (this.attackCooldown <= 0 && closeEnough && heroOpen) this.startAttack();
    }

    if (this.attack) {
      const a = this.attack;
      a.t += dt;
      // A feint: wind up, then bail out to see how you react (and punish it if you flinch)
      if (a.feint && !a.struck && a.t >= a.windup * 0.55) {
        this.feintOff();
        return;
      }
      if (!a.struck && a.t >= a.windup) {
        a.struck = true;
        e.setPose(a.spec.pose, 0.3, true);
        this.enemyStrike(a);
      }
      // Harder bots follow a punch or jab with a second swing
      if (a.double && a.struck && !a.second && a.t >= a.windup + 0.3) {
        a.second = true;
        e.setPose('kick', 0.25, true);
        this.enemyStrike(a);
      }
      if (a.t >= a.windup + (a.double ? 0.7 : 0.45)) {
        this.attack = null;
        this.afterAttack(a);
      }
    }
  }

  // What to do once an attack is over: keep the pressure on, or reset
  afterAttack(a) {
    const h = this.hero;
    const smart = this.diff.smart;
    const CHAIN = ['punch', 'heavy', 'jab'];
    if (smart && a.landed && a.chain < smart.chain && Math.random() < smart.chainChance && ['jab', 'punch', 'heavy'].includes(a.type)) {
      this.queuedAttack = CHAIN[a.chain % CHAIN.length];
      this.pendingChain = a.chain + 1;
      this.attackCooldown = 0.14;
      return;
    }
    this.pendingChain = 0;
    const idleFor = (performance.now() - this.combo.lastActionAt) / 1000;
    let cooldown = randBetween(idleFor > 2 ? this.diff.idleCooldown : this.diff.cooldown);
    // Smells blood: presses harder when you're low on health, and harder still in its final form
    if (this.diffKey === 'hard' && h.health < h.maxHealth * 0.35) cooldown *= 0.7;
    if (this.enraged) cooldown *= 0.6;
    this.attackCooldown = cooldown;
  }

  feintOff() {
    const h = this.hero;
    const e = this.enemy;
    const flinched = h.invulnTimer > 0 || h.guarding || h.y > 0.3;
    this.attack = null;
    e.setPose('guard', 0.1, true);
    this.fx.floatText('FEINT!', e.x, e.y + 2.4, { color: '#ffb02e', size: 22, cls: 'fx-pop' });
    if (flinched) this.forceAttack(h.guarding ? 'grab' : 'jab'); // you reacted: that's a punish
    else this.attackCooldown = 0.5;
  }

  // Pick and telegraph the next attack. Every attack warns you: pose, text and (for the ultra) a red ring.
  startAttack() {
    const e = this.enemy;
    const h = this.hero;
    const smart = this.diff.smart;
    const habits = this.habitState || {};
    let type;
    if (this.queuedAttack) {
      type = this.queuedAttack;
      this.queuedAttack = null;
    } else if (this.diff.ultra && this.ultraTimer <= 0) {
      type = 'ultra';
      this.ultraTimer = randBetween(this.diff.ultra.every) * (this.enraged ? 0.55 : 1);
    } else if (smart && smart.meme && this.memeTimer <= 0 && !h.isAirborne) {
      type = 'meme';
      this.memeTimer = randBetween(smart.meme.every);
    } else if (smart && h.isAirborne && h.selfJump && h.y > 0.4) {
      type = 'anti';
    } else {
      const weights = { ...this.diff.attackWeights };
      if (smart && habits.turtle) {
        // You're hiding behind guard, so the bot reaches for the move guard can't stop
        weights.grab = Object.values(weights).reduce((n, w) => n + w, 0) * 0.9;
      }
      type = pickWeighted(weights);
    }
    const spec = ATTACKS[type];
    let windup =
      type === 'ultra' ? this.diff.ultra.windup : type === 'meme' ? smart.meme.windup : this.diff.windup * spec.windup;
    if (this.enraged) windup *= 0.85;
    this.attack = {
      type,
      spec,
      t: 0,
      windup,
      struck: false,
      second: false,
      landed: false,
      chain: this.pendingChain || 0,
      double: (type === 'punch' || type === 'jab') && Math.random() < this.diff.doubleStrike,
      feint: !!(smart && (type === 'punch' || type === 'heavy') && Math.random() < smart.feint),
      punish: this.punishPending
    };
    this.punishPending = false;
    e.setPose(type === 'ultra' ? 'charge' : 'windup', windup + 0.05, true);

    if (spec.tell) {
      const ultra = type === 'ultra';
      this.fx.floatText(spec.tell, e.x, e.y + 2.5, { color: ultra ? '#ff4455' : '#ffb02e', size: ultra ? 38 : 26, cls: 'fx-pop' });
    }
    if (type === 'meme') {
      // Back off to range first, so there's a gap to throw across (and time to react)
      const away = Math.sign(e.x - h.x) || 1;
      e.slideTo(Math.max(-ENEMY_BOUND, Math.min(ENEMY_BOUND, e.x + away * 2.4)), 18);
    }
    if (type === 'ultra') {
      this.fx.ringBurst(e.x, 1.1, 5.5, 0xff3040, windup);
      this.fx.shockwave(e.x, 6, 0xff3040, windup);
      this.fx.flash('#ff1020', 0.2, windup);
      this.audio.playSound('whoosh_heavy');
      this.arena.triggerScreenShake(0.3);
    }
  }

  enemyStrike(a) {
    const h = this.hero;
    const e = this.enemy;
    const spec = a.spec;
    if (a.type === 'meme') {
      this.hurlMeme();
      return;
    }
    if (Math.abs(e.x - h.x) > spec.reach || h.health <= 0) return;
    if (spec.antiAir && h.y <= 0.4) return; // you already landed: the anti-air whiffs
    const cx = (h.x + e.x) / 2;

    // Jumping clears a low sweep or a grab and, if you time it, the ultra's shockwave
    if ((spec.low && h.y > 0.45) || (a.type === 'ultra' && h.y > 0.8)) {
      this.fx.floatText('JUMPED IT!', h.x, 2.7, { color: '#9be8ff', size: 28, cls: 'fx-pop' });
      this.combo.addStylePoints(a.type === 'ultra' ? 40 : 20);
      if (this.memes) this.memes.trigger('dodge', { priority: 2, side: 'left' });
      return;
    }

    if (h.invulnTimer > 0) {
      // Dodged: reward with style and a beat of slow motion.
      this.fx.floatText('PERFECT DODGE!', h.x, 2.7, { color: '#9be8ff', size: 30, cls: 'fx-pop' });
      if (this.memes) this.memes.trigger('dodge', { priority: 2, side: 'left' });
      this.combo.addStylePoints(a.type === 'ultra' ? 60 : 25);
      this.combo.slowTimer = Math.max(this.combo.slowTimer, a.type === 'ultra' ? 0.6 : 0.35);
      this.fx.afterimage(h, '#9be8ff');
      return;
    }

    let dmg = (this.diff.damage * spec.dmg + Math.min(4, this.combo.kills * 0.6)) * (this.enraged ? 1.25 : 1) * this.botAttackMul();
    let knock = spec.knock;
    let stun = spec.stun;
    const blocked = h.guarding && !spec.unblockable;
    if (blocked) {
      dmg *= spec.guard !== undefined ? spec.guard : 0.3;
      knock = 0.06;
      stun = 0;
    }
    // Mercy (easy/medium): standing idle can wear you down but never finish you; only a typo counter can.
    if (this.diff.mercy && !a.punish) dmg = Math.min(dmg, Math.max(0, h.health - 5));
    const res = h.takeHit(dmg, { knock, stun, quiet: blocked, stagger: !blocked, launch: blocked ? 0 : spec.launch || 0 });
    if (!res.hit) return;

    if (blocked) {
      h.guardTimer = 0.3;
      this.fx.floatText('BLOCKED', h.x, 2.6, { color: '#9be8ff', size: 24, cls: 'fx-pop' });
      this.fx.hitSpark(cx, 1.2, { size: 0.8, color: 0x7dd3ff });
      this.audio.playCombatHit('light');
      this.arena.triggerScreenShake(0.12);
      this.sinceHeroHurt = 0;
      return;
    }

    a.landed = true;
    this.sinceHeroHurt = 0;
    this.combo.onHeroHit();
    const big = a.type === 'ultra' || a.type === 'heavy' || a.type === 'grab';
    this.audio.playCombatHit(big ? 'crit' : 'heavy');
    if (big) this.audio.playImpactBoom(a.type === 'ultra' ? 1.3 : 0.9);
    this.arena.triggerScreenShake(big ? 0.7 : 0.3);
    this.arena.kick(-h.facing, big ? 0.3 : 0.12);
    this.fx.hitSpark(cx, 1.15, { size: big ? 1.7 : 1, color: 0xff6a6a, count: big ? 12 : 7 });
    this.fx.impact(cx, 1.15, { size: big ? 1.6 : 0.9, color: 0xff7a7a, dir: -h.facing });
    this.fx.flash('#ff2020', big ? 0.4 : 0.22, big ? 0.4 : 0.25);
    if (a.type === 'ultra') this.fx.floatText('ULTRA!', e.x, e.y + 2.5, { color: '#ff4455', size: 40, cls: 'fx-pop fx-big' });
    if (a.type === 'grab') this.fx.floatText('GRABBED!', h.x, 2.8, { color: '#ff9a3c', size: 30, cls: 'fx-pop' });
    if (this.memes) this.memes.trigger('hurt', { priority: res.ko ? 3 : 1, chance: res.ko ? 1 : 0.5, side: 'left' });
    if (res.ko) this.heroDownTimer = 0;
  }

  // ------------------------------------------------------------- the bot's secret moves
  // The bot hurls a meme card across the arena. Jump it, guard it or Tab through it.
  hurlMeme() {
    const e = this.enemy;
    const h = this.hero;
    const clips = this.memes ? this.memes.clips.filter((c) => c.thumb) : [];
    if (!clips.length) return;
    const clip = clips[Math.floor(Math.random() * clips.length)];
    const dir = Math.sign(h.x - e.x) || -1;
    this.fx.throwMeme({
      fromX: e.x + dir * 0.4,
      fromY: e.y + 1.3,
      dir,
      url: `assets/memes/${clip.thumb}`,
      target: h,
      speed: 8.5,
      onArrive: (t) => this.memeLands(t)
    });
  }

  memeLands(h) {
    if (h.health <= 0 || this.enemy.health <= 0) return;
    if (h.y > 0.7) {
      this.fx.floatText('JUMPED IT!', h.x, 2.7, { color: '#9be8ff', size: 28, cls: 'fx-pop' });
      this.combo.addStylePoints(25);
      return;
    }
    if (h.invulnTimer > 0) {
      this.fx.floatText('PERFECT DODGE!', h.x, 2.7, { color: '#9be8ff', size: 30, cls: 'fx-pop' });
      this.combo.addStylePoints(30);
      this.combo.slowTimer = Math.max(this.combo.slowTimer, 0.3);
      return;
    }
    const blocked = h.guarding;
    let dmg = (this.diff.damage + Math.min(4, this.combo.kills * 0.6)) * (this.enraged ? 1.25 : 1) * this.botAttackMul();
    if (blocked) dmg *= 0.3;
    if (this.diff.mercy) dmg = Math.min(dmg, Math.max(0, h.health - 5));
    const res = h.takeHit(dmg, { knock: blocked ? 0.05 : 0.5, stun: blocked ? 0 : 0.3, quiet: blocked, stagger: !blocked });
    if (!res.hit) return;
    this.fx.hitSpark(h.x, 1.4, { size: 1.1, color: blocked ? 0x7dd3ff : 0xffe27a });
    this.fx.floatText(blocked ? 'BLOCKED' : "MEME'D!", h.x, 2.7, { color: blocked ? '#9be8ff' : '#ffd23a', size: 28, cls: 'fx-pop' });
    this.audio.playCombatHit('heavy');
    if (!blocked) {
      this.sinceHeroHurt = 0;
      this.combo.onHeroHit();
      this.arena.triggerScreenShake(0.35);
      if (this.memes) this.memes.trigger('hurt', { priority: 2, chance: 1, side: 'left' });
    }
    if (res.ko) this.heroDownTimer = 0;
  }

  // Below 30% health the hardest bot powers up one last time
  goFinalForm() {
    const e = this.enemy;
    this.enraged = true;
    e.form = 'rage';
    e.auraBoost = 0.35;
    e.setPose('charge', 0.9, true);
    e.lock(0.9);
    this.attack = null;
    this.fx.powerUpBurst(e, 'rage');
    this.fx.floatText('FINAL FORM!', e.x, 3.3, { color: '#ff5a4a', size: 46, cls: 'fx-pop fx-big' });
    this.audio.playSound('streak_fire');
    this.audio.playImpactBoom(1.2);
    this.arena.triggerScreenShake(0.8);
    this.arena.punchZoom(0.6);
    if (this.diff.ultra) this.ultraTimer = Math.min(this.ultraTimer, 1.4);
    if (this.memes) this.memes.trigger('rage', { priority: 3, side: 'right' });
  }

  // Fresh round: both fighters at full health, back at their starting marks
  resetRound() {
    const h = this.hero;
    const e = this.enemy;
    const c = this.arena.camX || 0;
    [h, e].forEach((f) => {
      f.group.visible = true;
      f.shadowMesh.visible = true;
    });
    h.revive();
    h.maxHealth = Math.round(100 * HEALTH_SCALE);
    h.health = h.maxHealth;
    const m = this.mirror ? -1 : 1; // the online guest starts on the right
    h.x = c - 0.55 * m;
    h.facing = m;
    h.invulnTimer = 0;
    e.revive();
    e.maxHealth = this.versus ? Math.round(100 * HEALTH_SCALE) : this.scaledEnemyHealth();
    e.health = e.maxHealth;
    e.x = c + 0.55 * m;
    e.facing = -m;
    e.form = 'base';
    e.auraBoost = 0;
    this.enraged = false;
    this.entering = false;
    this.attack = null;
    this.queuedAttack = null;
    this.pendingChain = 0;
    this.enemyDownTimer = 0;
    this.heroDownTimer = 0;
    this.sinceHeroHurt = 99;
    this.attackCooldown = 1.6;
    this.resetUltraTimer();
    this.combo.onHeroHit();
    this.combo.bulletTimer = 0;
    this.combo.stylePoints = 0;
    this.combo.surgeTimer = 0;
    this.combo.buffs = { attack: 0, defense: 0, attackVal: 0, defenseVal: 0 };
    this.botBuffs = { attack: 0, defense: 0, attackVal: 0, defenseVal: 0, wait: 8 };
  }

  respawnEnemy() {
    const e = this.enemy;
    const h = this.hero;
    this.enemyDownTimer = 0;
    this.enemyNumber++;
    e.revive();
    e.randomizeVariant();
    // every new bot is a different opponent
    this.enraged = false;
    e.form = 'base';
    e.auraBoost = 0;
    this.personality = this.rollPersonality();
    this.rebuildDiff();
    e.maxHealth = this.scaledEnemyHealth();
    e.health = e.maxHealth;
    // Run in from beyond the right edge of the screen
    const edge = this.arena.camX + this.arena.worldHalfWidth() + 1.6;
    e.x = Math.max(h.x + 5, edge);
    e.facing = -1;
    this.entering = true;
    if (this.memes) this.memes.trigger(Math.random() < 0.5 ? 'timeskip' : 'enter', { priority: 2, chance: 0.85, side: 'right' });
    this.attackCooldown = 2.5;
    this.attack = null;
    this.resetUltraTimer();
  }

  // ------------------------------------------------------------- hero
  updateHero(dt) {
    const h = this.hero;
    const e = this.enemy;

    // Float alongside an airborne enemy so juggle hits visibly connect
    if (e.isAirborne && e.health > 0 && h.health > 0 && h.lockTimer <= 0) {
      h.hover = true;
      h.isAirborne = true;
      const targetY = Math.max(0, e.y * 0.85);
      h.y += (targetY - h.y) * Math.min(1, dt * 14);
      const gap = Math.abs(e.x - h.x);
      if (gap > 1.3) h.x += Math.sign(e.x - h.x) * Math.min(gap - 1.1, 14 * dt);
    } else if (h.hover) {
      h.hover = false;
      h.isAirborne = h.y > 0.02;
    }

    if (this.versus) return; // rounds, not auto-revives
    if (h.health <= 0) {
      this.heroDownTimer += dt;
      if (this.heroDownTimer > 2.2 && !h.isAirborne) {
        h.revive();
        h.invulnTimer = 1.6;
        this.combo.onHeroHit();
        this.fx.floatText('RETRY!', h.x, 2.8, { color: '#ffd23a', size: 34, cls: 'fx-pop' });
      }
      return;
    }

    // Slow recovery when nobody's hitting you
    if (this.sinceHeroHurt > 3 && h.health < h.maxHealth) {
      h.health = Math.min(h.maxHealth, h.health + this.diff.heroRegen * HEALTH_SCALE * dt);
    }
  }

  // ------------------------------------------------------------- trails
  updateTrails(dt) {
    const h = this.hero;
    this.afterimageTimer -= dt;
    this.dustTimer -= dt;

    const sliding = h.slideTarget !== null;
    const striking = ['jab', 'jab2', 'punch', 'kick', 'launcher'].includes(h.pose);
    const tint = TINTS[h.form] || TINTS.base;

    if (this.afterimageTimer <= 0 && (sliding || (h.form === 'ui' && striking) || (h.form === 'blue' && sliding))) {
      this.fx.afterimage(h, tint);
      this.afterimageTimer = sliding ? 0.04 : 0.07;
    }
    if (sliding && this.dustTimer <= 0 && !h.isAirborne) {
      this.fx.dust(h.x, 2, -h.facing);
      this.dustTimer = 0.07;
    }
  }
}
