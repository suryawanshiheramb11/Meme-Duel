// Keyboard Warrior Stickman - Combat Mechanics, DMC Style Rank Engine & Power Forms
import { FORM_LABELS, FORM_COLORS } from '../render/effects/effectsManager.js';

const FORM_ORDER = ['base', 'ssj', 'blue', 'ui'];
const FORM_DAMAGE = { base: 1, ssj: 1.4, blue: 1.8, ui: 2.4 };
const SPARK_COLORS = { base: 0xffffff, ssj: 0xffd23a, blue: 0x4fc3ff, ui: 0xffffff };
const VIGNETTE = {
  base: ['transparent', 0],
  ssj: ['rgba(255,196,32,0.55)', 1],
  blue: ['rgba(53,168,255,0.55)', 1],
  ui: ['rgba(232,240,255,0.5)', 1]
};

export class ComboEngine {
  constructor(audioSystem, arenaManager, effects) {
    this.audio = audioSystem;
    this.arena = arenaManager;
    this.fx = effects;

    // Combo & Style State
    this.hits = 0;
    this.maxHits = 0;
    this.score = 0;
    this.kills = 0;
    this.comboTimer = 0;
    this.comboTimeout = 2.8; // Seconds before combo meter drops

    // DMC Style Rank: D -> C -> B -> A -> S -> SS -> SSS
    this.ranks = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
    this.rankNames = {
      'D': 'DISMAL',
      'C': 'CRAZY',
      'B': 'BADASS',
      'A': 'APOCALYPTIC',
      'S': 'SAVAGE',
      'SS': 'SICK SKILLS',
      'SSS': 'SMOKIN\' SEXY STYLE!'
    };
    this.currentRankIndex = 0;
    this.stylePoints = 0;
    this.styleThreshold = 100;
    this.decayRate = 18; // Points lost per second when idle

    // Rage Mode State
    this.isRageMode = false;
    this.rageTimer = 0;

    // Power forms (glowing hair + aura). 'auto' follows rank / rage.
    this.form = 'base';
    this.formOverride = 'auto';
    this.formDropTimer = 0;

    // Game feel
    this.hitStop = 0; // seconds of freeze on impact
    this.slowTimer = 0; // seconds of slow motion
    this.lastActionAt = performance.now();

    // Wired up by the app
    this.hero = null;
    this.enemy = null;
    this.onMiss = null;

    this.walkSpeed = 4.0;
  }

  bindFighters(hero, enemy) {
    this.hero = hero;
    this.enemy = enemy;
    hero.onLand = (impact, dead) => this.onFighterLand(hero, impact, dead);
    enemy.onLand = (impact, dead) => this.onFighterLand(enemy, impact, dead);
  }

  damageMultiplier() {
    return (this.isRageMode ? 1.6 : 1) * (FORM_DAMAGE[this.form] || 1);
  }

  sparkColor() {
    return SPARK_COLORS[this.form] || 0xffffff;
  }

  // ------------------------------------------------------------- typing strikes
  registerHit(type = 'light', hero, enemy) {
    this.hits++;
    if (this.hits > this.maxHits) this.maxHits = this.hits;
    this.comboTimer = this.comboTimeout;
    this.lastActionAt = performance.now();

    const multiplier = 1 + this.currentRankIndex * 0.5;
    const baseScore = type === 'crit' ? 300 : type === 'heavy' ? 150 : 80;
    this.score += Math.round(baseScore * multiplier * (this.isRageMode ? 2 : 1));

    const addedStyle = type === 'crit' ? 35 : type === 'heavy' ? 22 : 12;
    this.addStylePoints(addedStyle);

    this.audio.playCombatHit(type);
    this.arena.triggerScreenShake(type === 'crit' ? 0.35 : 0.15);

    // Hero is busy with a scripted move (beam, power-up) or the target is already down.
    if (!hero || !enemy || hero.lockTimer > 0 || enemy.health <= 0) return;

    const reach = type === 'crit' || type === 'kick' ? 1.3 : 1.12;
    const dist = Math.abs(enemy.x - hero.x);
    if (!enemy.isAirborne && dist > reach + 0.12) this.lunge(hero, enemy, reach - 0.1);

    const finisher = this.hits % 4 === 0;
    const kind = finisher ? 'kick' : type;
    hero.attack(kind);

    const base = type === 'crit' ? 14 : type === 'heavy' ? 9 : 6;
    const knock = finisher ? 1.15 : type === 'heavy' ? 0.55 : 0.26;
    const result = enemy.takeHit(base * this.damageMultiplier() * (finisher ? 1.6 : 1), { knock });

    // Keep a juggled enemy aloft while the string continues.
    if (enemy.isAirborne && !result.ko) enemy.vy = Math.max(enemy.vy, 4.2);

    const dir = hero.facing;
    const cx = (hero.x + enemy.x) / 2 + dir * 0.12;
    const cy = enemy.y + 1.1 + (hero.pose === 'kick' ? -0.25 : 0.1);
    this.fx.hitSpark(cx, cy, {
      size: finisher ? 1.6 : type === 'crit' ? 1.35 : type === 'heavy' ? 1.15 : 0.9,
      color: this.sparkColor(),
      count: finisher ? 12 : 7
    });
    this.hitStop = Math.max(this.hitStop, finisher ? 0.085 : 0.04);
    if (finisher) {
      this.arena.punchZoom(0.45);
      this.arena.triggerScreenShake(0.3);
      this.fx.dust(enemy.x, 5, dir);
      this.fx.floatText('FINISHER!', enemy.x, enemy.y + 2.3, { color: '#ffb02e', size: 30, cls: 'fx-pop' });
    } else if (type === 'crit') {
      this.fx.floatText('CRIT!', enemy.x, enemy.y + 2.3, { color: '#ff5a5a', size: 34, cls: 'fx-pop' });
    }
    if (result.ko) this.onKO(enemy, hero);
  }

  registerMiss() {
    this.comboTimer = 0;
    this.hits = 0;
    this.stylePoints = Math.max(0, this.stylePoints - 40);
    if (this.stylePoints <= 0 && this.currentRankIndex > 0) {
      this.currentRankIndex--;
      this.stylePoints = 50;
    }
    this.audio.playKeyClack(true);
    this.arena.triggerScreenShake(0.2);
    if (this.onMiss) this.onMiss();
  }

  // Slide the hero to striking distance with a quick afterimage trail.
  lunge(hero, enemy, gap) {
    const dir = enemy.x >= hero.x ? 1 : -1;
    hero.slideTo(enemy.x - dir * gap, 30);
    this.fx.speedLines(hero.x, hero.y + 1.1, dir);
    this.fx.dust(hero.x, 3, dir);
  }

  addStylePoints(points) {
    this.stylePoints += points;
    if (this.stylePoints >= this.styleThreshold) {
      if (this.currentRankIndex < this.ranks.length - 1) {
        this.currentRankIndex++;
        this.stylePoints = 25;
        this.audio.playSpecialKey('caps'); // Rank up chime
      } else {
        this.stylePoints = this.styleThreshold;
      }
    }
  }

  // ------------------------------------------------------------- special moves
  triggerAirLauncher(hero, enemy) {
    if (hero && hero.lockTimer > 0) return;
    this.audio.playSpecialKey('space');
    this.arena.triggerScreenShake(0.4);
    this.lastActionAt = performance.now();
    if (!hero || !enemy || enemy.health <= 0) return;

    const dist = Math.abs(enemy.x - hero.x);
    if (dist > 1.25) this.lunge(hero, enemy, 0.95);
    hero.setPose('launcher', 0.35, true);
    hero.jump(9.5);
    enemy.takeHit(10 * this.damageMultiplier(), { launch: 11.5, knock: 0.15 });

    const cx = (hero.x + enemy.x) / 2;
    this.fx.hitSpark(cx, 1.6, { size: 1.6, color: this.sparkColor(), count: 12 });
    this.fx.shockwave(enemy.x, 3, this.sparkColor(), 0.4);
    this.fx.floatText('AIR LAUNCH!', enemy.x, 3.2, { color: '#7de3ff', size: 32, cls: 'fx-pop' });
    this.hitStop = Math.max(this.hitStop, 0.07);
    this.arena.punchZoom(0.3);
    this.addStylePoints(30);
    this.hits += 2;
    this.score += 500;
    this.comboTimer = this.comboTimeout;
  }

  triggerGroundSlam(hero, enemy) {
    if (hero && hero.lockTimer > 0) return;
    this.audio.playSpecialKey('enter');
    this.lastActionAt = performance.now();

    if (!enemy || enemy.health <= 0) return;

    if (!enemy.isAirborne) {
      // Ground sweep when nothing is airborne
      this.arena.triggerScreenShake(0.3);
      if (Math.abs(enemy.x - hero.x) > 1.3) this.lunge(hero, enemy, 1.0);
      hero.setPose('kick', 0.35, true);
      const res = enemy.takeHit(12 * this.damageMultiplier(), { knock: 0.7 });
      this.fx.hitSpark((hero.x + enemy.x) / 2, 0.7, { size: 1.1, color: this.sparkColor() });
      this.fx.dust(enemy.x, 5, hero.facing);
      this.hitStop = Math.max(this.hitStop, 0.05);
      if (res.ko) this.onKO(enemy, hero);
      return;
    }

    // Spike the juggled enemy into the floor; damage lands on impact (onFighterLand).
    this.arena.triggerScreenShake(0.5);
    hero.groundSlam();
    enemy.groundSlam();
    enemy.slamActive = true;
    this.addStylePoints(50);
    this.hits += 3;
    this.score += 1000;
    this.comboTimer = this.comboTimeout;
  }

  onFighterLand(f, impact, dead) {
    if (impact > 5) this.fx.dust(f.x, Math.min(8, Math.round(impact / 3)));
    if (f === this.enemy && f.slamActive) {
      f.slamActive = false;
      const res = f.takeHit(30 * this.damageMultiplier(), { knock: 0.3, stun: 0.6 });
      const color = this.sparkColor();
      this.fx.shockwave(f.x, 6.5, color, 0.6);
      this.fx.shockwave(f.x, 4, 0xffffff, 0.4);
      this.fx.crater(f.x, 5);
      this.fx.debris(f.x, 16, 1.1);
      this.fx.hitSpark(f.x, 0.5, { size: 2.1, color, count: 14 });
      this.fx.flash('#ffffff', 0.5, 0.3);
      this.fx.floatText('GROUND SLAM!', f.x, 2.8, { color: '#ffd23a', size: 40, cls: 'fx-pop' });
      this.arena.triggerScreenShake(0.85);
      this.arena.punchZoom(0.8);
      this.hitStop = Math.max(this.hitStop, 0.12);
      if (res.ko) this.onKO(f, this.hero);
      else if (!f.isAirborne) f.launchIntoAir(4.2); // bounce
    }
  }

  triggerDash(hero, enemy) {
    if (!hero || hero.lockTimer > 0) return;
    this.audio.playSpecialKey('tab');
    this.lastActionAt = performance.now();
    const WALL = 5.4;
    let dir = hero.facing;
    let label = null;
    let target = null;
    if (enemy && enemy.health > 0) {
      const toward = Math.sign(enemy.x - hero.x) || 1;
      const dist = Math.abs(enemy.x - hero.x);
      if (dist > 2.1) dir = toward; // gap closer
      else {
        dir = -toward; // evasive step back
        label = 'DODGE';
        // Cornered: slip past the enemy instead of dashing into the wall
        if (Math.abs(hero.x + dir * 1.9) > WALL - 0.4) {
          dir = toward;
          label = 'CROSS-UP';
          target = enemy.x + toward * 1.25;
        }
      }
    }
    target = Math.max(-WALL, Math.min(WALL, target !== null ? target : hero.x + dir * 1.9));
    hero.slideTo(target, 24);
    hero.invulnTimer = 0.45;
    hero.setPose('dash', 0.3, true);
    this.fx.speedLines(hero.x, hero.y + 1.1, dir);
    this.fx.dust(hero.x, 6, dir);
    if (label) this.fx.floatText(label, hero.x, 2.6, { color: '#9be8ff', size: 26, cls: 'fx-pop' });
  }

  // Sentence finisher: charge a beam, fire it down the lane
  triggerBeam(hero, enemy) {
    if (!hero || hero.lockTimer > 0) return;
    const charge = 0.55;
    const fire = 0.62;
    this.audio.playSound('streak_fire');
    hero.setPose('charge2', charge, true);
    hero.lock(charge + fire + 0.3);
    if (enemy && enemy.health > 0) {
      const dist = Math.abs(enemy.x - hero.x);
      if (dist < 1.7) hero.slideTo(Math.max(-5.4, hero.x - (1.9 - dist)), 14);
    }
    this.fx.startBeam({
      hero,
      enemy: enemy || hero,
      form: this.form,
      charge,
      fire,
      onFire: () => {
        hero.setPose('kame', fire + 0.2, true);
        this.audio.playCombatHit('crit');
        this.arena.punchZoom(0.7);
        this.hitStop = Math.max(this.hitStop, 0.08);
        if (!enemy || enemy.health <= 0) return;
        const res = enemy.takeHit(28 * this.damageMultiplier(), { knock: 3.4, launch: 5.5, quiet: false });
        this.fx.floatText('BEAM FINISHER!', enemy.x, 3.2, { color: '#9be8ff', size: 38, cls: 'fx-pop' });
        this.addStylePoints(60);
        this.hits += 5;
        this.score += 1500;
        this.comboTimer = this.comboTimeout;
        if (res.ko) this.onKO(enemy, hero);
      }
    });
  }

  onKO(enemy, hero) {
    this.kills++;
    this.score += 1000;
    this.slowTimer = 0.55;
    this.audio.playSound('knockdown');
    this.arena.triggerScreenShake(0.8);
    this.arena.punchZoom(0.9);
    this.fx.flash('#ffffff', 0.5, 0.4);
    this.fx.floatText('K.O.!', enemy.x, 3.4, { color: '#ff3344', size: 64, cls: 'fx-pop fx-big' });
    this.fx.shockwave(enemy.x, 5.5, 0xff5560, 0.7);
    if (hero && hero.lockTimer <= 0) {
      hero.setPose('victory', 1.4, true);
    }
  }

  triggerRageMode() {
    this.isRageMode = !this.isRageMode;
    if (this.isRageMode) {
      this.rageTimer = 7.0;
      this.audio.playSpecialKey('caps');
      this.arena.triggerScreenShake(0.5);
      this.fx.flash('#ff2030', 0.35, 0.4);
      if (this.hero) this.fx.floatText('RAGE!', this.hero.x, 3.0, { color: '#ff4455', size: 44, cls: 'fx-pop' });
    }
  }

  moveHero(hero, dx, delta) {
    if (!hero || hero.lockTimer > 0 || hero.health <= 0) return;
    hero.x += dx * this.walkSpeed * delta;
    hero.x = Math.max(-5.4, Math.min(5.4, hero.x));
    hero.walking = true;
    hero.walkSpeed = this.walkSpeed;
  }

  onHeroHit() {
    this.hits = 0;
    this.comboTimer = 0;
    this.stylePoints = Math.max(0, this.stylePoints - 25);
  }

  // ------------------------------------------------------------- forms
  desiredForm() {
    if (this.formOverride !== 'auto') return this.formOverride;
    const idx = this.currentRankIndex;
    let f = idx >= 6 ? 'ui' : idx >= 5 ? 'blue' : idx >= 3 ? 'ssj' : 'base';
    if (this.isRageMode && f === 'base') f = 'ssj';
    return f;
  }

  setForm(form, withSequence = true) {
    const prev = this.form;
    if (prev === form) return;
    this.form = form;
    const hero = this.hero;
    if (!hero) return;
    hero.form = form;
    const [vc, va] = VIGNETTE[form] || VIGNETTE.base;
    this.fx.setVignette(vc, va);

    const upgrade = FORM_ORDER.indexOf(form) > FORM_ORDER.indexOf(prev);
    if (upgrade && withSequence) {
      // Power-up scene: hero shakes with fists clenched while the aura blooms.
      hero.setPose('charge', 0.95, true);
      hero.lock(0.95);
      hero.invulnTimer = Math.max(hero.invulnTimer, 1.2);
      hero.auraBoost = 1.1;
      hero.bigHair = true;
      this.fx.powerUpBurst(hero, form);
      this.audio.playSound('streak_fire');
      this.audio.playSound('rank_up');
      this.arena.triggerScreenShake(0.9);
      this.arena.punchZoom(0.7);
      this.slowTimer = Math.max(this.slowTimer, 0.35);
      this.fx.floatText(FORM_LABELS[form], hero.x, 3.3, { color: FORM_COLORS[form], size: 46, cls: 'fx-pop fx-big' });
      if (this.enemy && this.enemy.health > 0) {
        this.enemy.takeHit(0, { knock: 1.3, stun: 0.6, quiet: true }); // shockwave shoves the enemy back
      }
    } else if (!upgrade && prev !== 'base') {
      this.fx.floatText(form === 'base' ? 'POWER DOWN' : FORM_LABELS[form], hero.x, 3.0, { color: '#9aa8bc', size: 26, cls: 'fx-pop' });
      this.fx.dust(hero.x, 6);
    }
  }

  updateForm(delta) {
    const want = this.desiredForm();
    const cur = FORM_ORDER.indexOf(this.form);
    const tgt = FORM_ORDER.indexOf(want);
    if (tgt > cur) {
      this.formDropTimer = 0;
      this.setForm(want, true);
    } else if (tgt < cur) {
      // Don't flicker down the instant the combo dips
      this.formDropTimer += delta;
      if (this.formDropTimer > (this.formOverride === 'auto' ? 1.6 : 0)) {
        this.formDropTimer = 0;
        this.setForm(want, false);
      }
    } else {
      this.formDropTimer = 0;
    }
    const hero = this.hero;
    if (hero) {
      hero.auraBoost = Math.max(0, hero.auraBoost - delta * 0.9);
      if (hero.auraBoost <= 0.05) hero.bigHair = this.form === 'ui' || this.form === 'blue';
    }
  }

  setFormOverride(mode) {
    this.formOverride = mode;
  }

  // ------------------------------------------------------------- frame update
  update(delta) {
    if (this.comboTimer > 0) {
      this.comboTimer -= delta;
      if (this.comboTimer <= 0) this.hits = 0;
    }

    // Style Rank decay when inactive
    if (this.hits === 0 && this.stylePoints > 0) {
      this.stylePoints -= this.decayRate * delta;
      if (this.stylePoints <= 0) {
        if (this.currentRankIndex > 0) {
          this.currentRankIndex--;
          this.stylePoints = 75;
        } else {
          this.stylePoints = 0;
        }
      }
    }

    if (this.isRageMode) {
      this.rageTimer -= delta;
      if (this.rageTimer <= 0) this.isRageMode = false;
    }

    this.updateForm(delta);
  }

  getCurrentRank() {
    return this.ranks[this.currentRankIndex];
  }

  getCurrentRankTitle() {
    const rank = this.getCurrentRank();
    return this.rankNames[rank] || rank;
  }

  getRankProgress() {
    return Math.min(1.0, Math.max(0, this.stylePoints / this.styleThreshold));
  }
}
