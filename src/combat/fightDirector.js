// Keyboard Warrior Stickman - Fight Director
// Runs everything that happens *between* keystrokes: the enemy walking in and fighting back,
// fighters facing each other, the hero hovering during air juggles, afterimage trails,
// KO / respawn, and the camera focus point.
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
    this.attack = null; // { t, struck, punish }
    this.entering = false;
    this.afterimageTimer = 0;
    this.dustTimer = 0;
    this.sinceHeroHurt = 99;
    this.enemyNumber = 1;
    this.memes = null; // meme reaction player, set by the app

    combo.onMiss = () => this.punish();
  }

  // A typo invites an immediate counter.
  punish() {
    this.attackCooldown = Math.min(this.attackCooldown, 0.12);
    this.punishPending = true;
  }

  update(dt) {
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

    // Cancel a wind-up if the enemy gets clipped
    if (this.attack && (e.pose === 'hurt' || e.isAirborne)) this.attack = null;

    const busy = e.isAirborne || e.pose === 'hurt' || e.pose === 'knockdown' || e.lockTimer > 0 || this.attack;
    e.walking = false;

    if (!busy) {
      const side = e.x >= h.x ? 1 : -1;
      const want = h.x + side * FIGHT_GAP;
      const diff = want - e.x;
      if (Math.abs(diff) > 0.1) {
        const speed = this.entering ? 6.2 : 2.7;
        e.x += Math.sign(diff) * Math.min(Math.abs(diff), speed * dt);
        e.walking = true;
        e.walkSpeed = speed;
      }
      if (this.entering && Math.abs(e.x - h.x) < 4.5) this.entering = false;

      this.attackCooldown -= dt;
      const closeEnough = Math.abs(e.x - h.x) < 1.5;
      if (this.attackCooldown <= 0 && closeEnough && !h.isAirborne && h.health > 0 && h.lockTimer <= 0 && !this.entering) {
        this.attack = { t: 0, struck: false, punish: this.punishPending };
        this.punishPending = false;
        e.setPose('windup', 0.3, true);
      }
    }

    if (this.attack) {
      this.attack.t += dt;
      if (!this.attack.struck && this.attack.t >= 0.3) {
        this.attack.struck = true;
        e.setPose('punch', 0.28, true);
        this.enemyStrike();
      }
      if (this.attack.t >= 0.62) {
        this.attack = null;
        const idleFor = (performance.now() - this.combo.lastActionAt) / 1000;
        this.attackCooldown = idleFor > 2 ? 2.2 + Math.random() * 1.2 : 3 + Math.random() * 1.8;
      }
    }
  }

  enemyStrike() {
    const h = this.hero;
    const e = this.enemy;
    if (Math.abs(e.x - h.x) > 1.65 || h.health <= 0) return;
    const cx = (h.x + e.x) / 2;

    if (h.invulnTimer > 0) {
      // Dodged: reward with style and a beat of slow motion.
      this.fx.floatText('PERFECT DODGE!', h.x, 2.7, { color: '#9be8ff', size: 30, cls: 'fx-pop' });
      if (this.memes) this.memes.trigger('dodge', { priority: 2, side: 'left' });
      this.combo.addStylePoints(25);
      this.combo.slowTimer = Math.max(this.combo.slowTimer, 0.35);
      this.fx.afterimage(h, '#9be8ff');
      return;
    }

    let dmg = 5 + Math.min(6, this.combo.kills);
    // Mercy: standing idle can wear you down but never finish you; only a typo counter can.
    if (!this.attack.punish) dmg = Math.min(dmg, Math.max(0, h.health - 5));
    const res = h.takeHit(dmg, { knock: 0.5, stun: 0.3 });
    if (!res.hit) return;
    this.sinceHeroHurt = 0;
    this.combo.onHeroHit();
    this.audio.playCombatHit('heavy');
    this.arena.triggerScreenShake(0.3);
    this.fx.hitSpark(cx, 1.15, { size: 1, color: 0xff6a6a });
    this.fx.flash('#ff2020', 0.22, 0.25);
    if (this.memes) this.memes.trigger('hurt', { priority: 1, chance: 0.5, side: 'left' });
    if (res.ko) this.heroDownTimer = 0;
  }

  respawnEnemy() {
    const e = this.enemy;
    const h = this.hero;
    this.enemyDownTimer = 0;
    this.enemyNumber++;
    e.revive();
    e.randomizeVariant();
    e.maxHealth = 100 + this.combo.kills * 15;
    e.health = e.maxHealth;
    // Run in from beyond the right edge of the screen
    const edge = this.arena.camX + this.arena.worldHalfWidth() + 1.6;
    e.x = Math.max(h.x + 5, edge);
    e.facing = -1;
    this.entering = true;
    if (this.memes) this.memes.trigger(Math.random() < 0.5 ? 'timeskip' : 'enter', { priority: 2, chance: 0.85, side: 'right' });
    this.attackCooldown = 2.5;
    this.attack = null;
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
      h.health = Math.min(h.maxHealth, h.health + 5 * dt);
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
