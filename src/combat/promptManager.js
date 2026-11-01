// Meme Duel - Floating Typing Prompt, Meme Queue & Real-Time Red Cursor Engine
//
// Prompts normally come from the meme queue: each item is a meme's catchphrase, the clip
// that goes with it, and the special move that finishing it unleashes. Custom phrases typed
// into the menu bypass the queue for one sentence. If no memes are loaded the built-in
// phrase list is used instead.
export class PromptManager {
  constructor(onSentenceComplete, onWordComplete) {
    this.onSentenceComplete = onSentenceComplete; // (item|null) => void
    this.onWordComplete = onWordComplete; // (word) => void

    this.defaultPrompts = [
      'THIS IS A TYPING GAME.',
      'MEME COMBO MAKER',
      'I AM THE STORM THAT IS APPROACHING',
      'STANDING HERE I REALIZE',
      'RULES OF NATURE',
      'WHY DO I HEAR BOSS MUSIC',
      'YOU SHALL NOT PASS',
      'KEYBOARD WARRIOR UNLEASHED',
      'MAXIMUM OVERDRIVE ACTIVATED',
      'SKIBIDI TOILET IN OHIO',
      'IT IS OVER NINE THOUSAND',
      'NEVER GONNA GIVE YOU UP',
      'UNLIMITED BLADE WORKS',
      'SHOW ME A GOOD TIME JACK'
    ];

    this.promptIndex = 0;
    this.currentText = this.defaultPrompts[0];
    this.currentItem = null; // queue item for the current sentence, if any
    this.charIndex = 0;

    this.onAdvance = null; // called whenever the queue moves to the next meme

    // Meme queue
    this.queue = [];
    this.queuePos = 0;
    this.completed = 0;
    this.tactical = false;
    this.choices = [];
    this.chosen = null;
    this.completedChoice = null;

    // Performance metrics (matching Steam HUD: GOOD / MISS / % / TIME)
    this.goodCount = 0;
    this.missCount = 0;
    this.startTime = Date.now();
    this.elapsedSeconds = 0;
  }

  // items: [{ phrase, clip, move }]. Every call builds a fresh random queue: memes are shuffled
  // (Fisher-Yates) inside each move type, then dealt out in a random move order that never repeats
  // the same move back to back and never opens with the same meme as the previous queue. Each meme
  // keeps its own move, so the special attack always matches the meme you typed.
  setQueue(items) {
    this.sourceItems = items;
    const LADDER = ['flurry', 'slam', 'powerup', 'beam', 'timeskip'];
    const shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    const buckets = {};
    shuffle([...items]).forEach((it) => {
      const mv = LADDER.includes(it.move) ? it.move : 'other';
      (buckets[mv] = buckets[mv] || []).push(it);
    });
    const ordered = [];
    let last = null;
    while (ordered.length < items.length) {
      const avail = Object.keys(buckets).filter((k) => buckets[k].length);
      if (!avail.length) break;
      // weight by how many memes each move still has, so big buckets don't pile up at the end
      const pool = avail.filter((k) => k !== last);
      const from = pool.length ? pool : avail;
      const total = from.reduce((n, k) => n + buckets[k].length, 0);
      let r = Math.random() * total;
      let pick = from[from.length - 1];
      for (const k of from) {
        r -= buckets[k].length;
        if (r < 0) { pick = k; break; }
      }
      ordered.push(buckets[pick].shift());
      last = pick;
    }
    // don't open with the meme the previous queue opened with
    if (this.queue && this.queue.length > 1 && ordered.length > 1 && ordered[0] === this.queue[0]) {
      const k = 1 + Math.floor(Math.random() * (ordered.length - 1));
      [ordered[0], ordered[k]] = [ordered[k], ordered[0]];
    }
    this.queue = ordered;
    this.queuePos = 0;
    if (this.queue.length) this.loadItem(this.queue[0]);
  }

  // A fresh round: new shuffle of the meme queue, the half-typed phrase cleared, stats back to zero
  resetRound() {
    if (this.sourceItems && this.sourceItems.length) this.setQueue(this.sourceItems);
    else {
      this.promptIndex = 0;
      this.currentItem = null;
      this.currentText = this.defaultPrompts[0];
    }
    this.charIndex = 0;
    this.completed = 0;
    if (this.tactical) this.rollChoices();
    this.reset();
  }

  hasQueue() {
    return this.queue.length > 0;
  }

  loadItem(item) {
    this.currentItem = item;
    this.currentText = item.phrase;
    this.charIndex = 0;
  }

  // The next n queue items after the current one (wraps around)
  peek(n = 3) {
    if (!this.queue.length) return [];
    const out = [];
    for (let k = 1; k <= Math.min(n, this.queue.length - 1); k++) {
      out.push(this.queue[(this.queuePos + k) % this.queue.length]);
    }
    return out;
  }

  setCustomPrompt(text) {
    if (!text || text.trim() === '') return;
    this.currentItem = null;
    this.currentText = text.trim().toUpperCase();
    this.charIndex = 0;
  }

  reset() {
    this.charIndex = 0;
    this.goodCount = 0;
    this.missCount = 0;
    this.startTime = Date.now();
    this.elapsedSeconds = 0;
  }

  getCurrentChar() {
    if (this.charIndex >= this.currentText.length) return null;
    return this.currentText[this.charIndex];
  }

  // The word being typed right now, e.g. for the word-bonus popup
  wordBefore(index) {
    const upTo = this.currentText.slice(0, index);
    return upTo.split(' ').pop();
  }

  // ---- tactical mode: three memes offered at a time, each carrying a different buff
  setTactical(on) {
    this.tactical = !!on;
    if (this.tactical) this.rollChoices();
  }

  // Three memes whose phrases start with different letters, so the first letter you type picks one.
  rollChoices() {
    const pool = (this.sourceItems && this.sourceItems.length >= 3
      ? this.sourceItems
      : this.defaultPrompts.map((phrase) => ({ phrase, clip: null, move: 'beam' }))
    ).slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const picks = [];
    const letters = new Set();
    for (const it of pool) {
      if (letters.has(it.phrase[0])) continue;
      letters.add(it.phrase[0]);
      picks.push(it);
      if (picks.length === 3) break;
    }
    const buffs = ['attack', 'defense', 'health'].sort(() => Math.random() - 0.5);
    this.choices = picks.map((item, i) => ({ item, phrase: item.phrase, buff: buffs[i] }));
    this.chosen = null;
    this.currentItem = null;
    this.currentText = '';
    this.charIndex = 0;
  }

  handleKeyPress(key) {
    if (this.tactical && !this.chosen) {
      // Choosing: the first letter of a card's phrase picks that meme, then typing carries on through it
      const k = key.toUpperCase();
      const pick = this.choices.find((c) => c.phrase[0] === k);
      if (!pick) {
        this.missCount++;
        return { status: 'miss', expected: '?', actual: k };
      }
      this.chosen = pick;
      this.loadItem(pick.item);
    }
    const targetChar = this.getCurrentChar();
    if (!targetChar) return { status: 'completed' };

    const inputChar = key.toUpperCase();

    if (inputChar === targetChar) {
      // Correct keystroke!
      this.goodCount++;
      this.charIndex++;

      const isFinished = this.charIndex >= this.currentText.length;
      if (isFinished) {
        const item = this.currentItem;
        this.completedChoice = this.chosen;
        this.completed++;
        if (this.onSentenceComplete) this.onSentenceComplete(item);
        this.nextPrompt();
        return { status: 'sentence_complete', targetChar, item };
      }

      // Typing the space after a word completes that word
      if (targetChar === ' ') {
        const word = this.wordBefore(this.charIndex - 1);
        if (word && this.onWordComplete) this.onWordComplete(word);
        return { status: 'good', targetChar, wordComplete: word };
      }

      return { status: 'good', targetChar };
    } else {
      // Typo / Miss!
      this.missCount++;
      return { status: 'miss', expected: targetChar, actual: inputChar };
    }
  }

  nextPrompt() {
    if (this.tactical) {
      this.rollChoices();
      return;
    }
    if (this.queue.length) {
      this.queuePos = (this.queuePos + 1) % this.queue.length;
      this.loadItem(this.queue[this.queuePos]);
      if (this.onAdvance) this.onAdvance();
      return;
    }
    this.currentItem = null;
    this.promptIndex = (this.promptIndex + 1) % this.defaultPrompts.length;
    this.currentText = this.defaultPrompts[this.promptIndex];
    this.charIndex = 0;
  }

  getAccuracy() {
    const total = this.goodCount + this.missCount;
    if (total === 0) return 100;
    return Math.round((this.goodCount / total) * 100);
  }

  getElapsedFormatted() {
    const mins = Math.floor(this.elapsedSeconds / 60);
    const secs = Math.floor(this.elapsedSeconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  getWPM() {
    const minutes = Math.max(1 / 60, this.elapsedSeconds / 60);
    const words = this.goodCount / 5;
    return Math.round(words / minutes);
  }

  getProgress() {
    if (!this.currentText || this.currentText.length === 0) return 0;
    return this.charIndex / this.currentText.length;
  }

  update(delta) {
    this.elapsedSeconds = (Date.now() - this.startTime) / 1000;
  }
}
