// Meme Duel - online lobby: quick match, create a room, or join one by code.
import { quickMatch, createRoom, joinRoom, cleanCode } from '../net/netSession.js';

export class OnlineLobby {
  constructor(container, { onSession, invite }) {
    this.onSession = onSession;
    this.cancelled = false;
    this.pending = null; // the room being hosted, if any
    this.isOpen = true; // captures the keyboard while it is up

    this.root = document.createElement('div');
    this.root.id = 'online-lobby';
    this.root.innerHTML = `
      <div class="ol-card">
        <p class="ol-kicker">ONLINE DUEL</p>
        <h2 class="ol-title">FIND AN OPPONENT</h2>
        <div class="ol-grid">
          <section class="ol-opt">
            <h3>QUICK MATCH</h3>
            <p>Get paired with the next person searching. First to two rounds wins.</p>
            <button class="menu-btn compact" data-act="quick"><span class="mb-label">Find match</span><span class="mb-sub">&nbsp;</span><span class="mb-key">1</span></button>
          </section>
          <section class="ol-opt">
            <h3>CREATE ROOM</h3>
            <p>Get a code and send it to a friend. They join, you fight.</p>
            <div class="ol-code" id="ol-code" hidden></div>
            <button class="menu-btn compact" data-act="create"><span class="mb-label">Create room</span><span class="mb-sub">&nbsp;</span><span class="mb-key">2</span></button>
            <button class="ol-link" id="ol-copy" hidden>Copy invite link</button>
          </section>
          <section class="ol-opt">
            <h3>JOIN ROOM</h3>
            <p>Got a code from a friend? Type it in.</p>
            <input class="ol-input" id="ol-input" maxlength="6" placeholder="CODE" autocomplete="off" spellcheck="false" aria-label="Room code">
            <button class="menu-btn compact" data-act="join"><span class="mb-label">Join room</span><span class="mb-sub">&nbsp;</span><span class="mb-key">3</span></button>
          </section>
        </div>
        <p class="ol-status" id="ol-status" role="status"></p>
        <div class="ol-foot">
          <button class="menu-btn compact" data-act="cancel"><span class="mb-label">Back</span><span class="mb-sub">&nbsp;</span><span class="mb-key">Esc</span></button>
        </div>
      </div>`;
    container.appendChild(this.root);

    this.statusEl = this.root.querySelector('#ol-status');
    this.codeEl = this.root.querySelector('#ol-code');
    this.copyEl = this.root.querySelector('#ol-copy');
    this.input = this.root.querySelector('#ol-input');

    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) this.act(b.dataset.act);
    });
    this.input.addEventListener('input', () => (this.input.value = cleanCode(this.input.value)));
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.act('join');
      e.stopPropagation();
    });
    this.copyEl.addEventListener('click', () => this.copyLink());
    window.addEventListener('keydown', (e) => this.onKey(e), true);

    if (invite) {
      this.input.value = invite;
      this.act('join');
    }
  }

  onKey(e) {
    if (!this.isOpen || e.target === this.input) return;
    const map = { Digit1: 'quick', Digit2: 'create', Digit3: 'join', Escape: 'cancel' };
    if (map[e.code]) {
      e.preventDefault();
      e.stopPropagation();
      this.act(map[e.code]);
    } else {
      e.stopPropagation();
    }
  }

  status(text, kind = '') {
    this.statusEl.textContent = text;
    this.statusEl.className = `ol-status ${kind}`;
  }

  busy(on) {
    this.root.querySelectorAll('[data-act="quick"],[data-act="create"],[data-act="join"]').forEach((b) => (b.disabled = on));
    this.input.disabled = on;
  }

  stop() {
    this.cancelled = true;
    if (this.pending) this.pending.cancel();
    this.pending = null;
    this.codeEl.hidden = true;
    this.copyEl.hidden = true;
  }

  act(name) {
    if (name === 'cancel') {
      if (this.busyNow) {
        this.stop();
        this.busyNow = false;
        this.busy(false);
        this.status('Cancelled.');
      } else {
        location.href = location.pathname;
      }
      return;
    }
    if (this.busyNow) return;
    this.cancelled = false;
    this.busyNow = true;
    this.busy(true);
    const fail = (err) => {
      if (this.cancelled || err.code === 'cancelled') return;
      this.busyNow = false;
      this.busy(false);
      this.codeEl.hidden = true;
      this.copyEl.hidden = true;
      this.status(this.explain(err), 'err');
    };
    const done = (session) => {
      if (this.cancelled) return session.close();
      this.isOpen = false;
      this.root.remove();
      this.onSession(session);
    };

    if (name === 'quick') {
      this.status('Looking for an opponent...');
      quickMatch({
        isCancelled: () => this.cancelled,
        onStatus: (s) => this.status(s === 'waiting' ? 'Waiting for another player to search...' : 'Looking for an opponent...')
      })
        .then(done)
        .catch(fail);
    } else if (name === 'create') {
      this.status('Opening a room...');
      createRoom({ onStatus: () => this.status('Reconnecting to the matchmaking service...') })
        .then((room) => {
          if (this.cancelled) return room.cancel();
          this.pending = room;
          this.code = room.code;
          this.codeEl.textContent = room.code;
          this.codeEl.hidden = false;
          this.copyEl.hidden = false;
          this.status('Waiting for your friend to join. Share the code or the invite link.', 'ok');
          room.ready.then(done).catch(fail);
        })
        .catch(fail);
    } else if (name === 'join') {
      const code = cleanCode(this.input.value);
      this.status(`Joining room ${code || '...'}`);
      joinRoom(code).then(done).catch(fail);
    }
  }

  async copyLink() {
    const url = `${location.origin}${location.pathname}?room=${this.code}`;
    try {
      await navigator.clipboard.writeText(url);
      this.status('Invite link copied. Send it to your friend.', 'ok');
    } catch (e) {
      this.status(url, 'ok');
    }
  }

  explain(err) {
    if (err.code === 'broker-timeout' || err.code === 'network' || err.code === 'server-error' || err.code === 'socket-error') {
      return 'Could not reach the matchmaking service. Check your connection and try again.';
    }
    return err.message || 'Something went wrong. Try again.';
  }
}
