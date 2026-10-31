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

    // Performance metrics (matching Steam HUD: GOOD / MISS / % / TIME)
    this.goodCount = 0;
    this.missCount = 0;
    this.startTime = Date.now();
    this.elapsedSeconds = 0;
  }

  // items: [{ phrase, clip, move }]. Reorders so the same special move never repeats back to back.
  setQueue(items) {
    const pool = [...items].sort(() => Math.random() - 0.5);
    const ordered = [];
    while (pool.length) {
      const prev = ordered[ordered.length - 1];
      let i = pool.findIndex((it) => !prev || it.move !== prev.move);
      if (i < 0) i = 0;
      ordered.push(pool.splice(i, 1)[0]);
    }
    this.queue = ordered;
    this.queuePos = 0;
    if (this.queue.length) this.loadItem(this.queue[0]);
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

  handleKeyPress(key) {
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
