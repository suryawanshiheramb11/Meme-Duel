// Keyboard Warrior Stickman - Fight Director
// Runs everything that happens *between* keystrokes: the enemy walking in and fighting back,
// fighters facing each other, the hero hovering during air juggles, afterimage trails,
// KO / respawn, and the camera focus point.
import { ATTACKS, DIFFICULTIES, DEFAULT_DIFFICULTY, randBetween, pickWeighted, saveDifficulty } from './difficulty.js';

const FIGHT_GAP = 1.05; // preferred distance between fighters
const ENEMY_BOUND = 6.1;
const HERO_BOUND = 5.4;
const TINTS = { base: '#9be8ff', ssj: '#ffd23a', blue: '#4fc3ff', ui: '#e8f0ff' };

export class FightDirector {
  constructor({ hero, enemy, combo, fx, arena, audio }) {
    this.hero = hero;
    this.enemy = enemy;
    this.combo = combo;
    this.fx = fx;
    this.arena = arena;
    this.audio = audio;

    this.enemyDownTimer = 0;
    this.heroDownTimer = 0;
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
    this.diff = DIFFICULTIES[this.diffKey];
    combo.difficulty = this.diff;
    combo.difficultyKey = this.diffKey;

    combo.onMiss = () => this.punish();
    combo.onDashIn = () => this.counterPoke();
    this.resetUltraTimer();
  }

  resetUltraTimer() {
    this.ultraTimer = this.diff.ultra ? randBetween(this.diff.ultra.every) * 0.7 : Infinity;
  }

  // The bot decides to throw a specific attack right away (it read what you just did).
  forceAttack(type) {
    this.queuedAttack = type;
    this.attackCooldown = Math.min(this.attackCooldown, 0.12);
  }

  // You dashed in from range: harder bots meet you with a quick poke.
  counterPoke() {
    if (Math.random() < this.diff.pokesDashIn && !this.attack && this.enemy.health > 0) this.forceAttack('jab');
  }

  // Switch the bot's level. The current enemy is rescaled in place, keeping its health fraction.
  setDifficulty(key, { save = true } = {}) {
    if (!DIFFICULTIES[key]) return;
    this.diffKey = key;
    this.diff = DIFFICULTIES[key];
    this.combo.difficulty = this.diff;
    this.combo.difficultyKey = key;
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
    return Math.round((100 + this.combo.kills * 15) * this.diff.enemyHp);
  }

  // A typo can invite an immediate counter, depending on the level.
  punish() {
    if (Math.random() >= this.diff.counterOnTypo) return;
    this.attackCooldown = Math.min(this.attackCooldown, 0.12);
    this.punishPending = true;
  }

  update(dt) {
    if (this.paused) return;
    const h = this.hero;
    const e = this.enemy;
    this.sinceHeroHurt += dt;

    this.updateFacing();
    this.updateEnemy(dt);
    this.updateHero(dt);
    this.updateTrails(dt);

    // Keep both fighters inside the arena
    h.x = Math.max(-HERO_BOUND, Math.min(HERO_BOUND, h.x));
    if (!this.entering) {
      if (e.x > ENEMY_BOUND) { e.x = ENEMY_BOUND; e.vx = Math.min(0, e.vx); }
      if (e.x < -ENEMY_BOUND) { e.x = -ENEMY_BOUND; e.vx = Math.max(0, e.vx); }
    }

    this.arena.setFocus(this.entering ? h.x : (h.x + e.x) / 2);
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

    if (e.health <= 0) {
      e.walking = false;
      this.attack = null;
      this.enemyDownTimer += dt;
      if (this.enemyDownTimer > 2.6 && !e.isAirborne) this.respawnEnemy();
      return;
    }

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
        const speed = this.entering ? 6.2 : this.diff.speed;
        e.x += Math.sign(diff) * Math.min(Math.abs(diff), speed * dt);
        e.walking = true;
        e.walkSpeed = speed;
      }
      if (this.entering && Math.abs(e.x - h.x) < 4.5) this.entering = false;

      this.attackCooldown -= dt;
      if (!this.entering) this.ultraTimer -= dt;
      const heroOpen = !h.isAirborne && h.health > 0 && h.lockTimer <= 0 && !this.entering;
      const closeEnough = Math.abs(e.x - h.x) < (this.ultraTimer <= 0 ? 2.0 : 1.5);
      if (this.attackCooldown <= 0 && closeEnough && heroOpen) this.startAttack();
    }

    if (this.attack) {
      const a = this.attack;
      a.t += dt;
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
        const idleFor = (performance.now() - this.combo.lastActionAt) / 1000;
        let cooldown = randBetween(idleFor > 2 ? this.diff.idleCooldown : this.diff.cooldown);
        // Smells blood: presses harder when you're low on health
        if (this.diffKey === 'hard' && h.health < h.maxHealth * 0.35) cooldown *= 0.7;
        this.attackCooldown = cooldown;
      }
    }
  }

  // Pick and telegraph the next attack. Every attack warns you: pose, text and (for the ultra) a red ring.
  startAttack() {
    const e = this.enemy;
    let type;
    if (this.queuedAttack) {
      type = this.queuedAttack;
      this.queuedAttack = null;
    } else if (this.diff.ultra && this.ultraTimer <= 0) {
      type = 'ultra';
      this.ultraTimer = randBetween(this.diff.ultra.every);
    } else {
      type = pickWeighted(this.diff.attackWeights);
    }
    const spec = ATTACKS[type];
    const windup = type === 'ultra' ? this.diff.ultra.windup : this.diff.windup * spec.windup;
    this.attack = {
      type,
      spec,
      t: 0,
      windup,
      struck: false,
      second: false,
      double: (type === 'punch' || type === 'jab') && Math.random() < this.diff.doubleStrike,
      punish: this.punishPending
    };
    this.punishPending = false;
    e.setPose(type === 'ultra' ? 'charge' : 'windup', windup + 0.05, true);

    if (spec.tell) {
      const ultra = type === 'ultra';
      this.fx.floatText(spec.tell, e.x, e.y + 2.5, { color: ultra ? '#ff4455' : '#ffb02e', size: ultra ? 38 : 26, cls: 'fx-pop' });
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
    if (Math.abs(e.x - h.x) > spec.reach || h.health <= 0) return;
    const cx = (h.x + e.x) / 2;

    // Jumping clears a low sweep and, if you time it, the ultra's shockwave
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

    let dmg = this.diff.damage * spec.dmg + Math.min(4, this.combo.kills * 0.6);
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
    const res = h.takeHit(dmg, { knock, stun, quiet: blocked, stagger: !blocked });
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

    this.sinceHeroHurt = 0;
    this.combo.onHeroHit();
    const big = a.type === 'ultra' || a.type === 'heavy';
    this.audio.playCombatHit(big ? 'crit' : 'heavy');
    this.arena.triggerScreenShake(big ? 0.7 : 0.3);
    this.fx.hitSpark(cx, 1.15, { size: big ? 1.7 : 1, color: 0xff6a6a, count: big ? 12 : 7 });
    this.fx.flash('#ff2020', big ? 0.4 : 0.22, big ? 0.4 : 0.25);
    if (a.type === 'ultra') this.fx.floatText('ULTRA!', e.x, e.y + 2.5, { color: '#ff4455', size: 40, cls: 'fx-pop fx-big' });
    if (this.memes) this.memes.trigger('hurt', { priority: res.ko ? 3 : 1, chance: res.ko ? 1 : 0.5, side: 'left' });
    if (res.ko) this.heroDownTimer = 0;
  }

  respawnEnemy() {
    const e = this.enemy;
    const h = this.hero;
    this.enemyDownTimer = 0;
    this.enemyNumber++;
    e.revive();
    e.randomizeVariant();
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
      h.health = Math.min(h.maxHealth, h.health + this.diff.heroRegen * dt);
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
