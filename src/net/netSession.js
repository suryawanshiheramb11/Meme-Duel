// Meme Duel - online connection layer.
//
// Players connect browser-to-browser over WebRTC using PeerJS. The only shared infrastructure is
// PeerJS's public signalling broker (it just introduces two browsers; game traffic never touches it),
// so the game stays a plain static site with no server of its own.
//
// Two ways to get paired:
//   * Room code   host registers "md-room-CODE"; a friend connects to that id.
//   * Quick match players look for each other in a handful of numbered "waiting slots"
//                 (md-q1-0 ... md-q1-5). Searching, you try each slot as a guest; if nobody is waiting
//                 you claim the lowest free slot and wait there. A waiting player keeps re-checking the
//                 lower slots, so two people who claimed different slots at the same instant still find
//                 each other. Once a pair is made the host drops off the broker, freeing the slot.
const PEER_SCRIPT = 'assets/libs/peerjs.min.js';
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to misread aloud
const POOL = 'md-q1';
const SLOTS = 6;
const PROTOCOL = 1;

// Optional relay servers from src/net/ice.json: either a fixed "iceServers" list, or a "fetchUrl" that returns
// one (the way Metered.ca hands out fresh credentials: https://YOURAPP.metered.live/api/v1/turn/credentials?apiKey=KEY)
async function loadIceConfig() {
  try {
    const r = await fetch('src/net/ice.json', { cache: 'no-store' });
    const cfg = r.ok ? await r.json() : null;
    if (!cfg) return;
    if (Array.isArray(cfg.iceServers)) extraIce = [...cfg.iceServers];
    if (cfg.fetchUrl) {
      const res = await fetch(cfg.fetchUrl, { cache: 'no-store' });
      const list = res.ok ? await res.json() : null;
      const servers = Array.isArray(list) ? list : list && Array.isArray(list.iceServers) ? list.iceServers : [];
      extraIce = [...extraIce, ...servers];
    }
  } catch (e) {
    /* no relay configured, or it could not be reached: direct connections still work */
  }
}

let libPromise = null;
export function loadPeerLib() {
  if (window.Peer) return Promise.resolve();
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PEER_SCRIPT;
      s.onload = () => loadIceConfig().then(resolve);
      s.onerror = () => reject(new Error('Could not load the multiplayer library.'));
      document.head.appendChild(s);
    });
  }
  return libPromise;
}

export function randomCode(length = 5) {
  let out = '';
  for (let i = 0; i < length; i++) out += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  return out;
}
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

// A custom broker can be supplied as ?signal=host:port (handy for self-hosting `peerjs-server`)
// STUN lets each browser learn its public address so two browsers can connect directly. That works on most
// home networks. Networks that block it (mobile hotspots, many campus and office networks, some VPNs) need a
// TURN relay, which has to be a server with credentials: put yours in src/net/ice.json (see the README).
const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' }
];
let extraIce = [];

function peerOptions() {
  const config = { iceServers: [...STUN_SERVERS, ...extraIce] };
  const custom = new URLSearchParams(location.search).get('signal');
  if (!custom) return { config };
  const [host, port] = custom.split(':');
  const local = /^(localhost|127\.)/.test(host);
  return { host, port: Number(port) || (local ? 9000 : 443), path: '/', secure: !local, config };
}

function openPeer(id) {
  return new Promise((resolve, reject) => {
    const peer = id ? new window.Peer(id, peerOptions()) : new window.Peer(undefined, peerOptions());
    const settle = () => {
      clearTimeout(timer);
      peer.off('open', onOpen);
      peer.off('error', onError);
    };
    // These only watch the registration. Once the peer is open, later errors (like "nobody is
    // waiting in that slot") are ordinary and must not tear the peer down.
    const onOpen = () => {
      settle();
      resolve(peer);
    };
    const onError = (err) => {
      settle();
      peer.destroy();
      reject(Object.assign(new Error(err.message || String(err)), { code: err.type || 'peer-error' }));
    };
    const timer = setTimeout(() => {
      settle();
      peer.destroy();
      reject(Object.assign(new Error('The matchmaking service did not answer.'), { code: 'broker-timeout' }));
    }, 9000);
    peer.on('open', onOpen);
    peer.on('error', onError);
  });
}

/** One live duel connection between two browsers. */
export class NetSession {
  constructor(conn, peers, role) {
    this.conn = conn;
    this.peers = peers; // PeerJS objects to tear down on close
    this.role = role; // 'host' or 'guest'
    this.handlers = new Set();
    this.closeHandlers = new Set();
    this.closed = false;
    this.pingMs = null;

    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'ping') return this.send({ t: 'pong', ts: msg.ts });
      if (msg.t === 'pong') {
        this.pingMs = Math.round(performance.now() - msg.ts);
        return;
      }
      this.handlers.forEach((fn) => fn(msg));
    });
    const gone = () => this.shutdown(true);
    conn.on('close', gone);
    conn.on('error', gone);
    this.pinger = setInterval(() => this.send({ t: 'ping', ts: performance.now() }), 2000);
  }

  send(msg) {
    if (this.closed || !this.conn.open) return false;
    try {
      this.conn.send(msg);
      return true;
    } catch (e) {
      return false;
    }
  }

  onMessage(fn) {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  onClose(fn) {
    this.closeHandlers.add(fn);
  }

  shutdown(notify) {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.pinger);
    try {
      this.conn.close();
    } catch (e) {
      /* already closed */
    }
    this.peers.forEach((p) => {
      try {
        p.destroy();
      } catch (e) {
        /* ignore */
      }
    });
    if (notify) this.closeHandlers.forEach((fn) => fn());
  }

  close() {
    this.shutdown(false);
  }
}

// After a connection opens, host and guest exchange a hello so each knows the other is a Meme Duel
// client speaking the same protocol (and so stray connections to a slot are told they're not welcome).
function handshakeAsHost(conn) {
  return new Promise((resolve, reject) => {
    conn.send({ t: 'welcome', v: PROTOCOL });
    const timer = setTimeout(() => reject(new Error('no hello')), 15000);
    conn.on('data', function once(msg) {
      if (msg && msg.t === 'hello' && msg.v === PROTOCOL) {
        clearTimeout(timer);
        conn.off && conn.off('data', once);
        resolve();
      }
    });
  });
}

function handshakeAsGuest(conn, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no welcome')), timeoutMs);
    conn.on('data', function once(msg) {
      if (msg && msg.t === 'welcome' && msg.v === PROTOCOL) {
        clearTimeout(timer);
        conn.send({ t: 'hello', v: PROTOCOL });
        resolve();
      } else if (msg && msg.t === 'busy') {
        clearTimeout(timer);
        reject(new Error('busy'));
      }
    });
  });
}

// Try to connect to a specific waiting host. Resolves with the open connection, or null.
function tryJoin(peer, targetId, timeoutMs) {
  peer.joinWhy = null; // why the last attempt failed: 'unavailable' (nobody there) or 'connect' (found, could not link)
  return new Promise((resolve) => {
    const conn = peer.destroyed || peer.disconnected ? null : peer.connect(targetId, { reliable: true });
    if (!conn) return resolve(null);
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      peer.off('error', onPeerError);
      if (!value) {
        try {
          conn.close();
        } catch (e) {
          /* ignore */
        }
      }
      resolve(value);
    };
    const timer = setTimeout(() => {
      peer.joinWhy = peer.joinWhy || 'connect';
      finish(null);
    }, timeoutMs);
    const onPeerError = (err) => {
      if (err && err.type === 'peer-unavailable') {
        peer.joinWhy = 'unavailable'; // nobody is registered under that id
        finish(null);
      }
    };
    peer.on('error', onPeerError);
    conn.on('open', () => {
      handshakeAsGuest(conn, timeoutMs)
        .then(() => finish(conn))
        .catch(() => {
          peer.joinWhy = 'connect';
          finish(null);
        });
    });
    conn.on('error', () => {
      peer.joinWhy = 'connect';
      finish(null);
    });
  });
}

/**
 * Host a private room. Resolves { code, ready } immediately; `ready` resolves with a NetSession when a friend joins.
 */
export async function createRoom({ onStatus } = {}) {
  await loadPeerLib();
  let peer = null;
  let code = null;
  for (let attempt = 0; attempt < 6 && !peer; attempt++) {
    code = randomCode();
    try {
      peer = await openPeer(`md-room-${code}`);
    } catch (err) {
      if (err.code !== 'unavailable-id') throw err;
    }
  }
  if (!peer) throw new Error('Could not reserve a room code. Try again.');
  let cancelled = false;
  const ready = new Promise((resolve, reject) => {
    peer.on('connection', async (conn) => {
      if (cancelled) return;
      conn.on('open', async () => {
        try {
          await handshakeAsHost(conn);
          peer.disconnect(); // free the code on the broker; the data channel stays up
          resolve(new NetSession(conn, [peer], 'host'));
        } catch (e) {
          conn.close(); // wasn't a Meme Duel client: keep waiting for the real one
        }
      });
    });
    peer.on('error', (err) => !cancelled && reject(Object.assign(new Error(err.message), { code: err.type })));
    peer.on('disconnected', () => {
      if (cancelled) return;
      onStatus && onStatus('reconnecting');
      try {
        peer.reconnect();
      } catch (e) {
        /* the error handler above reports a dead broker */
      }
    });
  });
  return {
    code,
    ready,
    cancel() {
      cancelled = true;
      peer.destroy();
    }
  };
}

/** Join a friend's room by code. */
export async function joinRoom(rawCode) {
  const code = cleanCode(rawCode);
  if (code.length < 4) throw Object.assign(new Error('Enter the room code.'), { code: 'bad-code' });
  await loadPeerLib();
  const peer = await openPeer();
  const conn = await tryJoin(peer, `md-room-${code}`, 16000);
  if (!conn) {
    const why = peer.joinWhy;
    peer.destroy();
    if (why === 'connect') {
      throw Object.assign(new Error(`Found room ${code} but could not connect to its host. A firewall or strict network may be blocking the link; try another network or ask for a new room.`), { code: 'connect-failed' });
    }
    throw Object.assign(new Error(`No room "${code}" is open. Check the code, or ask your friend to make a new room.`), { code: 'room-not-found' });
  }
  return new NetSession(conn, [peer], 'guest');
}

/**
 * Quick match. Resolves with a NetSession as soon as another searching player is found.
 * `isCancelled()` is polled so the lobby's Cancel button can stop the search.
 */
export async function quickMatch({ onStatus, isCancelled }) {
  await loadPeerLib();
  const guestPeer = await openPeer();
  let hostPeer = null;
  let hostSlot = -1;
  let incoming = null; // a connection waiting for our handshake
  const cleanup = () => {
    [guestPeer, hostPeer].forEach((p) => {
      try {
        p && p.destroy();
      } catch (e) {
        /* ignore */
      }
    });
  };

  const waitForGuest = (ms) =>
    new Promise((resolve) => {
      const t = setTimeout(() => resolve(null), ms);
      incoming = (session) => {
        clearTimeout(t);
        resolve(session);
      };
    });

  try {
    for (;;) {
      if (isCancelled()) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });

      // 1. Look for someone already waiting (only in slots below ours if we are waiting too)
      const limit = hostSlot < 0 ? SLOTS : hostSlot;
      for (let s = 0; s < limit; s++) {
        if (isCancelled()) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
        onStatus && onStatus('looking');
        const conn = await tryJoin(guestPeer, `${POOL}-${s}`, 6000);
        if (conn) {
          const session = new NetSession(conn, [guestPeer, hostPeer].filter(Boolean), 'guest');
          return session;
        }
      }

      // 2. Nobody found: wait in the lowest free slot
      if (!hostPeer) {
        for (let s = 0; s < SLOTS && !hostPeer; s++) {
          try {
            hostPeer = await openPeer(`${POOL}-${s}`);
            hostSlot = s;
          } catch (err) {
            if (err.code !== 'unavailable-id') throw err; // someone is already waiting there
          }
        }
        if (hostPeer) {
          let busy = false;
          hostPeer.on('connection', (conn) => {
            conn.on('open', async () => {
              if (busy || !incoming) {
                try {
                  conn.send({ t: 'busy' });
                } catch (e) {
                  /* ignore */
                }
                setTimeout(() => conn.close(), 200);
                return;
              }
              busy = true;
              try {
                await handshakeAsHost(conn);
                hostPeer.disconnect(); // free the slot for the next pair
                const deliver = incoming;
                incoming = null;
                deliver(new NetSession(conn, [hostPeer, guestPeer], 'host'));
              } catch (e) {
                busy = false;
                conn.close();
              }
            });
          });
        } else {
          await new Promise((r) => setTimeout(r, 900)); // every slot is taken: breathe and rescan
          continue;
        }
      }

      // 3. Wait a few seconds for a visitor, then go round again (and re-check the lower slots)
      onStatus && onStatus('waiting');
      const session = await waitForGuest(3600);
      incoming = null;
      if (session) return session;
    }
  } catch (err) {
    cleanup();
    throw err;
  }
}

/**
 * Quick network check, shown when a connection fails: can this browser learn its public address (so a direct
 * link is possible), and is a TURN relay configured?
 */
export async function diagnose() {
  const out = { direct: false, relayConfigured: extraIce.some((s) => /^turns?:/.test([].concat(s.urls)[0])) };
  try {
    const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    pc.createDataChannel('probe');
    pc.onicecandidate = (e) => {
      if (e.candidate && e.candidate.type === 'srflx') out.direct = true;
    };
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise((r) => setTimeout(r, 3500));
    pc.close();
  } catch (e) {
    /* WebRTC blocked entirely */
  }
  return out;
}
