// Keyboard Warrior Stickman - Combat Mechanics, DMC Style Rank Engine & Power Forms
import { FORM_LABELS, FORM_COLORS } from '../render/effects/effectsManager.js';

const FORM_ORDER = ['base', 'ssj', 'blue', 'ui'];
const SPECIAL_LABELS = {
  beam: 'BEAM FINISHER',
  slam: 'METEOR SLAM',
  flurry: 'MEME FLURRY',
  timeskip: 'TIME SKIP',
  powerup: 'POWER SURGE'
};
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
    this.onDashIn = null; // called when the hero dashes in from range (the bot may counter-poke)
    this.memes = null; // meme reaction player, set by the app
    this.difficulty = null; // current bot level table, set by the fight director
    this.difficultyKey = 'medium';
    this.missStreak = 0;
    this.lastMissAt = 0;

    // Sentence specials
    this.specials = 0;
    this.pendingSpecial = null; // finished while the hero was busy; runs when free
    this.scheduled = []; // [{ t, fn }] delayed actions for multi-part moves
    this.surgeForm = null; // temporary form from a Power Surge
    this.surgeTimer = 0;

    this.walkSpeed = 4.0;
  }

  bindFighters(hero, enemy) {
    this.hero = hero;
    this.enemy = enemy;
    hero.onLand = (impact, dead) => this.onFighterLand(hero, impact, dead);
    enemy.onLand = (impact, dead) => this.onFighterLand(enemy, impact, dead);
  }

  damageMultiplier() {
    // Holding guard trades offence for safety: you hit 40% softer
    return (this.isRageMode ? 1.6 : 1) * (FORM_DAMAGE[this.form] || 1) * (this.hero && this.hero.guarding ? 0.6 : 1);
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
    this.missStreak = 0;
    if (this.memes && [10, 25, 50, 100, 200].includes(this.hits)) {
      this.memes.trigger(this.hits >= 50 ? 'hype' : 'praise', { priority: 2, side: 'right' });
    }

    const multiplier = 1 + this.currentRankIndex * 0.5;
    const baseScore = type === 'crit' ? 300 : type === 'heavy' ? 150 : 80;
    const scoreMul = this.difficulty ? this.difficulty.score : 1;
    this.score += Math.round(baseScore * multiplier * (this.isRageMode ? 2 : 1) * scoreMul);

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

    // Hard bots sometimes sidestep a plain strike (specials and word bonuses always connect)
    if (this.difficulty && this.difficulty.dodge > 0 && !enemy.isAirborne && enemy.pose !== 'hurt' && Math.random() < this.difficulty.dodge) {
      const away = Math.sign(enemy.x - hero.x) || 1;
      enemy.slideTo(Math.max(-6, Math.min(6, enemy.x + away * 1.1)), 26);
      this.fx.afterimage(enemy, '#ff9a9a', 0.3);
      this.fx.floatText('TOO SLOW', enemy.x, enemy.y + 2.3, { color: '#ff9a9a', size: 26, cls: 'fx-pop' });
      if (this.memes) this.memes.trigger('dodge', { priority: 2, chance: 0.5, side: 'right' });
      return;
    }

    const base = type === 'crit' ? 14 : type === 'heavy' ? 9 : 6;

    // The bot throws up a guard against plain strikes (finishers break through). Smarter levels
    // guard more the longer your combo runs, so a flawless string gets harder to keep going.
    const lvl = this.difficulty;
    if (lvl && lvl.guardChance > 0 && !finisher && !enemy.isAirborne) {
      const bonus = lvl.adaptive ? Math.min(0.22, this.hits * 0.012) : 0;
      if (Math.random() < lvl.guardChance + bonus) {
        enemy.guardTimer = 0.35;
        enemy.takeHit(base * 0.2 * this.damageMultiplier(), { knock: 0.03, quiet: true, stagger: false });
        this.fx.hitSpark((hero.x + enemy.x) / 2 + hero.facing * 0.2, enemy.y + 1.2, { size: 0.8, color: 0x7dd3ff, count: 4 });
        this.fx.floatText('BLOCKED', enemy.x, enemy.y + 2.3, { color: '#9be8ff', size: 22, cls: 'fx-pop' });
        return;
      }
    }
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
    this.hitStop = Math.max(this.hitStop, finisher ? 0.06 : 0.03);
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

    // Three typos in quick succession earns an apology meme; a lone one only sometimes
    const now = performance.now();
    this.missStreak = now - this.lastMissAt < 3000 ? this.missStreak + 1 : 1;
    this.lastMissAt = now;
    if (this.memes) {
      if (this.missStreak >= 3) {
        this.missStreak = 0;
        this.memes.trigger('typo', { priority: 1, side: 'left' });
      } else {
        this.memes.trigger('typo', { priority: 1, chance: 0.12, side: 'left' });
      }
    }
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
        if (this.memes) this.memes.trigger('praise', { priority: 2, chance: 0.7, side: 'right' });
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

    // Hard bots read the launcher coming and step out of it
    const lvl = this.difficulty;
    if (lvl && lvl.readsLauncher > 0 && !enemy.isAirborne && enemy.pose !== 'hurt' && Math.random() < lvl.readsLauncher) {
      const away = Math.sign(enemy.x - hero.x) || 1;
      enemy.slideTo(Math.max(-6, Math.min(6, enemy.x + away * 1.9)), 34);
      this.fx.afterimage(enemy, '#ff9a9a', 0.3);
      this.fx.floatText('READ YOU', enemy.x, enemy.y + 2.4, { color: '#ff9a9a', size: 28, cls: 'fx-pop' });
      hero.setPose('launcher', 0.35, true);
      hero.jump(6);
      if (this.memes) this.memes.trigger('dodge', { priority: 2, side: 'right' });
      return;
    }

    const dist = Math.abs(enemy.x - hero.x);
    if (dist > 1.25) this.lunge(hero, enemy, 0.95);
    hero.setPose('launcher', 0.35, true);
    hero.jump(9.5);
    enemy.takeHit(10 * this.damageMultiplier(), { launch: 11.5, knock: 0.15 });

    const cx = (hero.x + enemy.x) / 2;
    this.fx.hitSpark(cx, 1.6, { size: 1.6, color: this.sparkColor(), count: 12 });
    this.fx.shockwave(enemy.x, 3, this.sparkColor(), 0.4);
    this.fx.floatText('AIR LAUNCH!', enemy.x, 3.2, { color: '#7de3ff', size: 32, cls: 'fx-pop' });
    if (this.memes) this.memes.trigger('launch', { priority: 1, chance: 0.3, side: 'right' });
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
      if (this.memes) this.memes.trigger('slam', { priority: 2, chance: 0.8, side: 'right' });
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
      if (dist > 2.1) {
        dir = toward; // gap closer
        if (this.onDashIn) this.onDashIn();
      }
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

  triggerJump(hero) {
    if (!hero || hero.lockTimer > 0 || hero.health <= 0 || hero.isAirborne || hero.hover) return;
    hero.jump(8.4);
    this.audio.playSpecialKey('tab');
    this.fx.dust(hero.x, 4);
    this.lastActionAt = performance.now();
  }

  // Sentence finisher: charge a beam, fire it down the lane
  triggerBeam(hero, enemy, { quiet = false } = {}) {
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
        if (this.memes && !quiet) this.memes.trigger('beam', { priority: 3, side: 'right' });
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
    this.score += Math.round(1000 * (this.difficulty ? this.difficulty.score : 1));
    this.slowTimer = 0.4;
    this.audio.playSound('knockdown');
    this.arena.triggerScreenShake(0.8);
    this.arena.punchZoom(0.9);
    this.fx.flash('#ffffff', 0.5, 0.4);
    this.fx.floatText('K.O.!', enemy.x, 3.4, { color: '#ff3344', size: 64, cls: 'fx-pop fx-big' });
    if (this.memes) this.memes.trigger('ko', { priority: 3, side: 'right' });
    this.fx.shockwave(enemy.x, 5.5, 0xff5560, 0.7);
    if (hero && hero.lockTimer <= 0) {
      hero.setPose('victory', 1.4, true);
    }
  }

  later(seconds, fn) {
    this.scheduled.push({ t: seconds, fn });
  }

  // ------------------------------------------------------------- word & sentence payoffs
  // Finishing a word in the meme's catchphrase lands a bonus hit.
  registerWord(word, hero, enemy) {
    this.score += 40 * word.length;
    this.addStylePoints(6);
    if (!hero || !enemy || hero.lockTimer > 0 || enemy.health <= 0) return;
    const res = enemy.takeHit(4 * this.damageMultiplier(), { knock: 0.35, quiet: true, stun: 0.2 });
    const cx = (hero.x + enemy.x) / 2 + hero.facing * 0.15;
    this.fx.hitSpark(cx, enemy.y + 1.35, { size: 1.25, color: this.sparkColor(), count: 9 });
    this.fx.floatText(word, enemy.x, enemy.y + 2.35, { color: '#ffffff', size: 24, cls: 'fx-pop' });
    this.arena.triggerScreenShake(0.2);
    this.hitStop = Math.max(this.hitStop, 0.05);
    if (res.ko) this.onKO(enemy, hero);
  }

  // Finishing the whole phrase freezes the fight, plays that meme's clip as a cutscene, and only
  // then unleashes the special move the meme was matched to.
  triggerSpecial(hero, enemy, item) {
    if (!hero) return;
    const move = (item && item.move) || 'beam';
    if (hero.lockTimer > 0 || hero.health <= 0) {
      this.pendingSpecial = item || { move };
      return;
    }
    this.specials++;

    const perform = () => {
      if (hero.health <= 0) return;
      this.fx.floatText(SPECIAL_LABELS[move] || 'SPECIAL', hero.x, 3.2, { color: '#ffd23a', size: 36, cls: 'fx-pop' });
      this.score += 500;
      switch (move) {
        case 'slam': return this.specialMeteor(hero, enemy);
        case 'flurry': return this.specialFlurry(hero, enemy);
        case 'timeskip': return this.specialTimeSkip(hero, enemy, item);
        case 'powerup': return this.specialPowerSurge(hero);
        default: return this.triggerBeam(hero, enemy, { quiet: true });
      }
    };

    if (this.memes && item && item.clip) {
      // Freeze-frame on the final keystroke, play the meme, then the move fires
      const played = this.memes.playClip(item.clip, { side: 'right', priority: 3, caption: item.phrase, onEnd: perform });
      if (!played) perform(); // memes switched off: go straight to the move
    } else {
      if (this.memes) this.memes.trigger('hype', { priority: 2, side: 'right' });
      perform();
    }
  }

  alive(enemy) {
    return enemy && enemy.health > 0;
  }

  // Launch the enemy skyward, then spike them back down.
  specialMeteor(hero, enemy) {
    if (!this.alive(enemy)) return hero.setPose('launcher', 0.4, true);
    if (Math.abs(enemy.x - hero.x) > 1.25) this.lunge(hero, enemy, 0.95);
    hero.setPose('launcher', 0.35, true);
    hero.jump(9.5);
    enemy.takeHit(10 * this.damageMultiplier(), { launch: 12.5, knock: 0.15 });
    this.fx.hitSpark((hero.x + enemy.x) / 2, 1.6, { size: 1.7, color: this.sparkColor(), count: 12 });
    this.fx.shockwave(enemy.x, 3.2, this.sparkColor(), 0.4);
    this.arena.triggerScreenShake(0.4);
    this.hits += 2;
    this.later(0.5, () => this.triggerGroundSlam(hero, enemy));
  }

  // Ten rapid strikes, the last one a launching finisher.
  specialFlurry(hero, enemy) {
    if (!this.alive(enemy)) return hero.setPose('punch', 0.4, true);
    if (Math.abs(enemy.x - hero.x) > 1.2) this.lunge(hero, enemy, 0.95);
    const strikes = 10;
    const mult = this.damageMultiplier();
    hero.lock(0.2 + strikes * 0.085 + 0.2);
    for (let i = 0; i < strikes; i++) {
      this.later(0.12 + i * 0.085, () => {
        if (!this.alive(enemy)) return;
        const last = i === strikes - 1;
        hero.setPose(last ? 'kick' : i % 3 === 0 ? 'punch' : i % 2 ? 'jab2' : 'jab', 0.1, true);
        const res = enemy.takeHit((last ? 14 : 4) * mult, {
          knock: last ? 1.6 : 0.04,
          launch: last ? 6 : 0,
          quiet: !last,
          stun: 0.12
        });
        const cx = (hero.x + enemy.x) / 2 + hero.facing * 0.1;
        this.fx.hitSpark(cx, enemy.y + 0.6 + Math.random() * 1.1, {
          size: last ? 1.8 : 0.85,
          color: this.sparkColor(),
          count: last ? 12 : 4
        });
        this.audio.playCombatHit(last ? 'crit' : 'light');
        this.arena.triggerScreenShake(last ? 0.5 : 0.1);
        this.hits++;
        this.comboTimer = this.comboTimeout;
        if (last) this.arena.punchZoom(0.6);
        if (res.ko) this.onKO(enemy, hero);
      });
    }
    this.addStylePoints(40);
    this.score += 700;
  }

  // The world goes dark, a title card flashes up, and the damage lands all at once afterwards.
  specialTimeSkip(hero, enemy, item) {
    hero.lock(1.6);
    hero.invulnTimer = Math.max(hero.invulnTimer, 1.7);
    this.fx.flash('#050505', 0.8, 1.2);
    this.later(0.15, () =>
      this.fx.floatText(item && item.phrase ? item.phrase : 'TIME SKIP', hero.x + 0.8, 2.6, { color: '#ffffff', size: 52, cls: 'fx-pop fx-big' })
    );
    if (!this.alive(enemy)) return;
    enemy.setPose('windup', 1.1, true);
    enemy.lock(1.1);
    enemy.vx = 0;
    const dir = Math.sign(enemy.x - hero.x) || 1;
    this.later(0.4, () => {
      hero.slideTo(enemy.x + dir * 1.5, 46);
      this.fx.speedLines(hero.x, 1.1, dir);
    });
    [0.4, 0.46, 0.52, 0.58].forEach((t) => this.later(t, () => this.fx.afterimage(hero, '#ffffff', 0.5)));
    this.later(0.95, () => {
      if (!this.alive(enemy)) return;
      const res = enemy.takeHit(45 * this.damageMultiplier(), { knock: 2.2, launch: 7 });
      for (let i = 0; i < 6; i++) {
        this.fx.hitSpark(enemy.x + (Math.random() - 0.5) * 1.2, enemy.y + 0.5 + Math.random() * 1.5, {
          size: 1.3 + Math.random() * 0.8,
          color: 0xffffff,
          count: 8
        });
      }
      this.fx.flash('#ffffff', 0.7, 0.4);
      this.fx.floatText('ALL THE DAMAGE AT ONCE', enemy.x, 3.3, { color: '#ffe066', size: 34, cls: 'fx-pop' });
      this.arena.triggerScreenShake(0.9);
      this.arena.punchZoom(0.8);
      this.hitStop = Math.max(this.hitStop, 0.12);
      this.hits += 6;
      if (res.ko) this.onKO(enemy, hero);
    });
    this.addStylePoints(50);
    this.score += 1000;
  }

  // Jump to the next power form for a while, and recover some health.
  specialPowerSurge(hero) {
    const next = FORM_ORDER[Math.min(FORM_ORDER.length - 1, FORM_ORDER.indexOf(this.form) + 1)];
    this.surgeForm = next;
    this.surgeTimer = 10;
    hero.health = Math.min(hero.maxHealth, hero.health + 25);
    this.fx.floatText('+25 HP', hero.x, 2.4, { color: '#7dff9a', size: 28, cls: 'fx-pop' });
    if (next === this.form) {
      // already at the top form: replay the burst so the move still reads
      hero.setPose('charge', 0.8, true);
      hero.lock(0.8);
      hero.auraBoost = 1.1;
      this.fx.powerUpBurst(hero, this.form);
      this.arena.triggerScreenShake(0.7);
    } else {
      this.setForm(next, true);
    }
    this.addStylePoints(60);
  }

  triggerRageMode() {
    this.isRageMode = !this.isRageMode;
    if (this.isRageMode) {
      this.rageTimer = 7.0;
      this.audio.playSpecialKey('caps');
      this.arena.triggerScreenShake(0.5);
      this.fx.flash('#ff2030', 0.35, 0.4);
      if (this.hero) this.fx.floatText('RAGE!', this.hero.x, 3.0, { color: '#ff4455', size: 44, cls: 'fx-pop' });
      if (this.memes) this.memes.trigger('rage', { priority: 2, side: 'left' });
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
    if (this.surgeTimer > 0 && this.surgeForm && FORM_ORDER.indexOf(this.surgeForm) > FORM_ORDER.indexOf(f)) f = this.surgeForm;
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
      if (this.memes) this.memes.trigger('powerup', { priority: 3, side: 'left' });
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
    if (this.surgeTimer > 0) this.surgeTimer -= delta;

    for (let i = this.scheduled.length - 1; i >= 0; i--) {
      this.scheduled[i].t -= delta;
      if (this.scheduled[i].t <= 0) {
        const { fn } = this.scheduled[i];
        this.scheduled.splice(i, 1);
        fn();
      }
    }
    if (this.pendingSpecial && this.hero && this.hero.lockTimer <= 0 && this.hero.health > 0) {
      const item = this.pendingSpecial;
      this.pendingSpecial = null;
      this.triggerSpecial(this.hero, this.enemy, item);
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
