// Meme Duel - online lobby: quick match, create a room, or join one by code.
import { quickMatch, createRoom, joinRoom, cleanCode, diagnose } from '../net/netSession.js';

export class OnlineLobby {
  constructor(container, { onSession, invite, arenaPicker }) {
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

    if (arenaPicker) this.root.querySelector('.ol-grid').insertAdjacentElement('afterend', arenaPicker);
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
    if (this.inRoom) {
      if (e.code === 'KeyR') this.roomAct('ready');
      else if (e.code === 'Escape') this.roomAct('leave');
      e.preventDefault();
      e.stopPropagation();
      return;
    }
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
      if (err.code === 'connect-failed') {
        diagnose().then((d) => {
          if (this.busyNow) return;
          const why = !d.direct
            ? 'Your network does not allow direct player-to-player links (common on hotspots, campus, office and VPN connections).'
            : 'Your side looks fine, so the other player\'s network is probably the one blocking the link.';
          this.status(`${this.explain(err)} ${why}${d.relayConfigured ? '' : ' This game has no relay server set up yet.'}`, 'err');
        });
      }
    };
    const done = (session, kind = 'room') => {
      if (this.cancelled) return session.close();
      this.pending = null;
      this.showRoom({ kind, code: this.roomCode || null, session });
    };

    if (name === 'quick') {
      this.status('Looking for an opponent...');
      quickMatch({
        isCancelled: () => this.cancelled,
        onStatus: (s) => this.status(s === 'waiting' ? 'Waiting for another player to search...' : 'Looking for an opponent...')
      })
        .then((session) => done(session, 'quick'))
        .catch(fail);
    } else if (name === 'create') {
      this.status('Opening a room...');
      createRoom({ onStatus: () => this.status('Reconnecting to the matchmaking service...') })
        .then((room) => {
          if (this.cancelled) return room.cancel();
          this.pending = room;
          this.code = room.code;
          this.roomCode = room.code;
          // the host goes straight into the room and waits there for a friend
          this.showRoom({ kind: 'room', code: room.code, session: null, host: true });
          room.ready.then((session) => done(session)).catch(fail);
        })
        .catch(fail);
    } else if (name === 'join') {
      const code = cleanCode(this.input.value);
      this.status(`Joining room ${code || '...'}`);
      this.roomCode = code;
      joinRoom(code).then((session) => done(session)).catch(fail);
    }
  }

  // The room: both players see who is in, then press READY. The match starts when both are ready.
  showRoom({ kind, code, session, host = false }) {
    this.stateRoom = { kind, code, session, host, me: false, foe: false };
    const card = this.root.querySelector('.ol-card');
    const title = kind === 'quick' ? 'QUICK MATCH' : `ROOM ${code}`;
    card.innerHTML = `
      <p class="ol-kicker">${kind === 'quick' ? 'OPPONENT FOUND' : 'PRIVATE ROOM'}</p>
      <h2 class="ol-title">${title}</h2>
      <div class="ol-slots">
        <div class="ol-slot in" id="slot-me"><span class="ol-role">YOU${session ? (session.role === 'host' ? ' &middot; HOST' : ' &middot; GUEST') : ' &middot; HOST'}</span><span class="ol-state" id="slot-me-state">NOT READY</span></div>
        <div class="ol-slot${session ? ' in' : ''}" id="slot-foe"><span class="ol-role" id="slot-foe-role">${session ? 'RIVAL' : 'EMPTY SEAT'}</span><span class="ol-state" id="slot-foe-state">${session ? 'NOT READY' : 'WAITING FOR A PLAYER'}</span></div>
      </div>
      ${code && kind === 'room' ? `<div class="ol-share"><span class="ol-code" id="ol-code">${code}</span><button class="ol-link" id="ol-copy">Copy invite link</button></div>` : ''}
      <p class="ol-status ok" id="ol-status" role="status"></p>
      <div class="ol-foot ol-foot-row">
        <button class="menu-btn compact" data-room="ready" id="room-ready"><span class="mb-label">Ready</span><span class="mb-sub">&nbsp;</span><span class="mb-key">R</span></button>
        <button class="menu-btn compact" data-room="leave"><span class="mb-label">Leave</span><span class="mb-sub">&nbsp;</span><span class="mb-key">Esc</span></button>
      </div>`;
    this.statusEl = card.querySelector('#ol-status');
    this.copyEl = card.querySelector('#ol-copy');
    if (this.copyEl) this.copyEl.addEventListener('click', () => this.copyLink());
    card.querySelectorAll('[data-room]').forEach((b) => b.addEventListener('click', () => this.roomAct(b.dataset.room)));
    this.inRoom = true;
    this.roomButton = card.querySelector('#room-ready');
    this.roomButton.disabled = !session;
    this.status(session ? 'Opponent connected. Press READY when you are set.' : 'Room open. Waiting for another player to join with this code...');
    if (session) this.attachSession(session);
  }

  attachSession(session) {
    const st = this.stateRoom;
    st.session = session;
    const slot = this.root.querySelector('#slot-foe');
    slot.classList.add('in');
    this.root.querySelector('#slot-foe-role').textContent = 'RIVAL';
    this.root.querySelector('#slot-foe-state').textContent = 'NOT READY';
    this.roomButton.disabled = false;
    this.status('Opponent connected. Press READY when you are set.');
    session.onMessage((m) => {
      if (m.t !== 'rdy') return;
      st.foe = !!m.v;
      this.paintRoom();
      this.maybeStart();
    });
    session.onClose(() => {
      if (!this.inRoom) return;
      this.status('Your opponent left the room.', 'err');
      this.root.querySelector('#slot-foe').classList.remove('in');
      this.root.querySelector('#slot-foe-role').textContent = 'LEFT';
      this.root.querySelector('#slot-foe-state').textContent = 'DISCONNECTED';
      this.roomButton.disabled = true;
    });
  }

  roomAct(what) {
    const st = this.stateRoom;
    if (what === 'leave') {
      this.inRoom = false;
      if (st.session) {
        st.session.send({ t: 'bye' });
        st.session.close();
      }
      if (this.pending) this.pending.cancel();
      location.href = location.pathname;
      return;
    }
    if (!st.session) return;
    st.me = !st.me;
    st.session.send({ t: 'rdy', v: st.me });
    this.paintRoom();
    this.maybeStart();
  }

  paintRoom() {
    const st = this.stateRoom;
    const paint = (id, ready) => {
      const el = this.root.querySelector(id);
      el.textContent = ready ? 'READY' : 'NOT READY';
      el.parentElement.classList.toggle('ready', ready);
    };
    paint('#slot-me-state', st.me);
    paint('#slot-foe-state', st.foe);
    this.roomButton.querySelector('.mb-label').textContent = st.me ? 'Not ready' : 'Ready';
    if (!(st.me && st.foe)) {
      this.status(st.me ? 'You are ready. Waiting for your opponent...' : st.foe ? 'Your opponent is ready. Press READY!' : 'Opponent connected. Press READY when you are set.');
    }
  }

  maybeStart() {
    const st = this.stateRoom;
    if (!(st.me && st.foe) || this.starting) return;
    this.starting = true;
    this.status('Both ready. Fight starts now!', 'ok');
    setTimeout(() => {
      this.inRoom = false;
      this.isOpen = false;
      this.root.remove();
      this.onSession(st.session);
    }, 700);
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
