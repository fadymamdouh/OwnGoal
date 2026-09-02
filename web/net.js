// OWN GOAL — room layer over Firebase Realtime Database.
//
// There is no server in this build, so one browser has to be the referee. The
// room creator is the HOST: it owns the Game instance, applies actions, and
// publishes a per-seat view for every player. Guests never hold game state —
// they read their own view and push actions.
//
//   /rooms/{code}/meta          host uid, mode, format, size, started, hostLeftAt
//   /rooms/{code}/players/{uid} name, seat, joined
//   /rooms/{code}/views/{uid}   that player's view — readable by them alone
//   /rooms/{code}/actions/{id}  queue of submitted actions, drained by the host
//
// database.rules.json enforces that a player can only read their OWN view and
// can only push actions signed with their own uid. That keeps hands hidden from
// the opponent. The host, however, holds the deck in memory — so the host can
// see what is coming. Fine among friends; not a public-release design.
//
// LEAVING A ROOM
// A tab can vanish without warning (phone locked, wifi dropped), so presence is
// tracked server-side with onDisconnect:
//
//   * In the lobby, a disconnect frees the player's seat immediately, otherwise
//     the room sits forever waiting for someone who already closed the tab.
//   * Once the match starts that handler is CANCELLED, because join() restores a
//     player to their original seat and killing the seat would break reconnect.
//   * The host's disconnect stamps meta/hostLeftAt. If the host comes back the
//     stamp is cleared and play continues. If it is still there after
//     GRACE_MS, whichever player is still watching deletes the whole room.
//
// GRACE_MS below must match the 90000 in database.rules.json, which is what
// actually authorises that delete. Change one and you must change the other.

import { FIREBASE, SDK } from './firebase-config.js';
import { Game, botAction } from './engine.js';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no O/0, no I/1/L
const FORMATS = { bot: ['ONE_V_ONE', 1], '1v1': ['ONE_V_ONE', 2], '2v2': ['TWO_V_TWO', 4] };

// How long a room outlives a vanished host. MUST match database.rules.json.
const GRACE_MS = 90000;

let fb = null;   // lazily loaded SDK bundle

async function loadFirebase() {
  if (fb) return fb;
  const [app, auth, db] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-database.js`),
  ]);
  const application = app.initializeApp(FIREBASE);
  fb = { ...auth, ...db, app: application, db: db.getDatabase(application) };
  const credential = await fb.signInAnonymously(fb.getAuth(application));
  fb.uid = credential.user.uid;
  return fb;
}

const newCode = () =>
  Array.from({ length: 5 }, () =>
    CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

/**
 * A room, online or purely local.
 *
 * onView(view)   called whenever this player's view changes
 * onLobby(info)  called whenever the player list or room meta changes
 * onError(msg)   called with a human-readable Arabic message
 */
export class Room {
  constructor({ onView, onLobby, onError }) {
    this.onView = onView;
    this.onLobby = onLobby;
    this.onError = onError || (() => {});
    this.game = null;
    this.isHost = false;
    this.local = false;      // solo vs bot: no network at all
    this.seat = 0;
    this.code = null;
    this.uid = null;
    this.seatOf = {};        // uid -> seat
    this.unsubs = [];
    this.seatHold = null;    // onDisconnect handle that frees our lobby seat
    this.reapTimer = null;   // pending host-grace deletion
    this.left = false;       // leave() has run; ignore late callbacks
  }

  // ------------------------------------------------------------- local bot

  startBotMatch(mode, name) {
    this.local = true;
    this.isHost = true;
    this.seat = 0;
    this.code = 'BOT';
    this.game = new Game({ mode, matchType: 'ONE_V_ONE', names: [name || 'انت', 'البوت'] });
    this.onLobby({ code: 'BOT', started: true, size: 1, players: [
      { seat: 0, name: name || 'انت', bot: false }, { seat: 1, name: 'البوت', bot: true },
    ] });
    this._publish();
    this._runBot();
  }

  _runBot() {
    /* Let the bot act until the turn returns to the human.
       A turnover is where play is hardest to follow: a successful defense wins
       the ball, so the bot answers your attack and then immediately attacks
       with a card of its own. Those two cards belong to different possessions,
       and the divider on the table says so, but they still need a longer beat
       between them or they read as one move. */
    const BEAT = 1100;
    const TURNOVER_BEAT = 2000;

    const step = () => {
      if (!this.game || this.game.over) return;
      const actor = this.game.seats.map(s => s.index)
        .find(i => this.game.legalActions(i).length);
      if (actor === undefined || actor === this.seat) return;
      const action = botAction(this.game, actor);
      if (!action) return;
      const before = this.game.log.length;
      this.game.apply(actor, action);
      const fresh = this.game.log.slice(before);
      this._publish();
      const turnover = fresh.some(e =>
        (e.kind === 'defense_played' && e.stopped) ||
        e.kind === 'counter_attack' || e.kind === 'goal');
      setTimeout(step, turnover ? TURNOVER_BEAT : BEAT);
    };
    setTimeout(step, BEAT);
  }

  // ------------------------------------------------------------- online

  async create(mode, fmt, name) {
    const [matchType, size] = FORMATS[fmt] || FORMATS['1v1'];
    if (fmt === 'bot') return this.startBotMatch(mode, name);

    const f = await loadFirebase();
    this.uid = f.uid;
    this.isHost = true;
    this.seat = 0;
    this.code = newCode();
    this.mode = mode;
    this.matchType = matchType;
    this.size = size;

    await f.set(f.ref(f.db, `rooms/${this.code}/meta`), {
      host: this.uid, mode, fmt, size, started: false, created: f.serverTimestamp(),
    });
    await f.set(f.ref(f.db, `rooms/${this.code}/players/${this.uid}`), {
      name: name || 'لاعب', seat: 0,
    });
    this.seatOf[this.uid] = 0;

    await this._markHostPresence();
    await this._holdSeat();

    this._watchPlayers();
    this._watchActions();
    this._watchMyView();
    return this.code;
  }

  /**
   * Host only. Stamp meta/hostLeftAt the moment this tab drops off, and clear it
   * while we are alive. Guests read that stamp to decide whether the host is
   * merely reconnecting or actually gone.
   */
  async _markHostPresence() {
    const f = fb;
    const stamp = f.ref(f.db, `rooms/${this.code}/meta/hostLeftAt`);
    try {
      await f.onDisconnect(stamp).set(f.serverTimestamp());
      await f.set(stamp, null);
    } catch (err) {
      console.warn('presence unavailable', err.message);
    }
  }

  /** Free our seat if the tab dies before the match starts. Cancelled at kickoff. */
  async _holdSeat() {
    const f = fb;
    try {
      this.seatHold = f.onDisconnect(f.ref(f.db, `rooms/${this.code}/players/${this.uid}`));
      await this.seatHold.remove();
    } catch (err) {
      console.warn('seat hold unavailable', err.message);
      this.seatHold = null;
    }
  }

  /** Once play begins the seat must survive a disconnect so join() can restore it. */
  async _releaseSeatHold() {
    if (!this.seatHold) return;
    const hold = this.seatHold;
    this.seatHold = null;
    try { await hold.cancel(); } catch { /* already gone */ }
  }

  async join(code, name) {
    const f = await loadFirebase();
    this.uid = f.uid;
    this.code = (code || '').trim().toUpperCase();

    const metaSnap = await f.get(f.ref(f.db, `rooms/${this.code}/meta`));
    if (!metaSnap.exists()) { this.onError('الكود مش موجود'); return null; }
    const meta = metaSnap.val();
    this.mode = meta.mode;
    this.size = meta.size;
    this.isHost = meta.host === this.uid;

    const playersSnap = await f.get(f.ref(f.db, `rooms/${this.code}/players`));
    const players = playersSnap.val() || {};
    if (players[this.uid]) {
      this.seat = players[this.uid].seat;      // rejoin the same seat
    } else {
      if (Object.keys(players).length >= meta.size) {
        this.onError('الأوضة كاملة');
        return null;
      }
      this.seat = Object.keys(players).length;
      await f.set(f.ref(f.db, `rooms/${this.code}/players/${this.uid}`), {
        name: name || 'لاعب', seat: this.seat,
      });
    }

    if (this.isHost) await this._markHostPresence();
    if (!meta.started) await this._holdSeat();

    this._watchPlayers();
    this._watchMyView();
    if (this.isHost) this._watchActions();
    else this._watchHost();
    return this.code;
  }

  /**
   * Guests only. Watch meta for the host's disconnect stamp. A stamp that clears
   * means the host reconnected; a stamp that survives GRACE_MS means the room is
   * dead and the last player present deletes it.
   */
  _watchHost() {
    const f = fb;
    const r = f.ref(f.db, `rooms/${this.code}/meta`);
    const off = f.onValue(r, snap => {
      if (this.left) return;
      const meta = snap.val();

      if (!meta) {                       // room already reaped by someone else
        this._cancelReap();
        this.onError('الأوضة قفلت');
        return;
      }

      if (meta.started) this._releaseSeatHold();

      const leftAt = meta.hostLeftAt;
      if (!leftAt) { this._cancelReap(); return; }   // host is present
      if (this.reapTimer) return;                    // already counting down

      const wait = Math.max(0, GRACE_MS - (Date.now() - leftAt));
      this.onError(`الهوست وقع — مستنيينه ${Math.ceil(wait / 1000)} ثانية`);
      this.reapTimer = setTimeout(() => this._reap(), wait + 1000);
    });
    this.unsubs.push(off);
  }

  _cancelReap() {
    if (this.reapTimer) { clearTimeout(this.reapTimer); this.reapTimer = null; }
  }

  /** Delete a room whose host never came back. Authorised by the $code rule. */
  async _reap() {
    this.reapTimer = null;
    if (this.left) return;
    const f = fb;
    try {
      const snap = await f.get(f.ref(f.db, `rooms/${this.code}/meta/hostLeftAt`));
      if (!snap.exists()) return;                    // host returned in the meantime
      await f.remove(f.ref(f.db, `rooms/${this.code}`));
    } catch (err) {
      // Losing the race to another player is the expected outcome, not a fault.
      console.warn('reap skipped', err.message);
    }
    this.onError('الأوضة قفلت — الهوست مرجعش');
  }

  _watchPlayers() {
    const f = fb;
    const r = f.ref(f.db, `rooms/${this.code}/players`);
    const off = f.onValue(r, snap => {
      const players = snap.val() || {};
      this.seatOf = {};
      const list = Object.entries(players)
        .map(([uid, p]) => { this.seatOf[uid] = p.seat; return { uid, ...p }; })
        .sort((a, b) => a.seat - b.seat);
      this.players = list;
      this.onLobby({
        code: this.code, size: this.size, started: !!this.game,
        players: list.map(p => ({ seat: p.seat, name: p.name, bot: false })),
      });
      // the host starts the match as soon as the room fills
      if (this.isHost && !this.game && list.length >= this.size) this._startMatch(list);
    });
    this.unsubs.push(off);
  }

  _startMatch(list) {
    const f = fb;
    this.game = new Game({
      mode: this.mode, matchType: this.matchType || (this.size === 4 ? 'TWO_V_TWO' : 'ONE_V_ONE'),
      names: list.map(p => p.name),
    });
    f.update(f.ref(f.db, `rooms/${this.code}/meta`), { started: true });
    this._releaseSeatHold();
    this._publish();
  }

  _watchActions() {
    const f = fb;
    const r = f.ref(f.db, `rooms/${this.code}/actions`);
    const off = f.onChildAdded(r, snap => {
      const { uid, action } = snap.val() || {};
      f.remove(snap.ref);                       // drain the queue
      if (!this.game || uid === undefined) return;
      const seat = this.seatOf[uid];
      if (seat === undefined) return;
      try {
        this.game.apply(seat, action);
      } catch (err) {
        console.warn('rejected action', err.message);
        this._publish();                        // resync the offender
        return;
      }
      this._publish();
    });
    this.unsubs.push(off);
  }

  _watchMyView() {
    if (this.isHost) return;   // the host reads its own game directly
    const f = fb;
    const r = f.ref(f.db, `rooms/${this.code}/views/${this.uid}`);
    const off = f.onValue(r, snap => {
      const v = snap.val();
      if (v) this.onView(typeof v === 'string' ? JSON.parse(v) : v);
    });
    this.unsubs.push(off);
  }

  /** Host only: hand every player their own view, and nothing else. */
  _publish() {
    if (!this.game) return;
    this.onView(this.game.view(this.seat));
    if (this.local) return;
    const f = fb;
    const updates = {};
    for (const [uid, seat] of Object.entries(this.seatOf)) {
      if (uid === this.uid) continue;
      updates[uid] = JSON.stringify(this.game.view(seat));
    }
    if (Object.keys(updates).length) {
      f.update(f.ref(f.db, `rooms/${this.code}/views`), updates);
    }
  }

  // ------------------------------------------------------------- actions

  async submit(action) {
    if (this.isHost) {
      if (!this.game) return;
      try {
        this.game.apply(this.seat, action);
      } catch (err) {
        console.warn('illegal', err.message);
        this._publish();
        return;
      }
      this._publish();
      if (this.local) this._runBot();
      return;
    }
    const f = fb;
    await f.push(f.ref(f.db, `rooms/${this.code}/actions`), {
      uid: this.uid, action, at: f.serverTimestamp(),
    });
  }

  async rematch() {
    if (!this.isHost) return;
    if (this.local) {
      const names = this.game.seats.map(s => s.name);
      this.game = new Game({ mode: this.game.mode, matchType: 'ONE_V_ONE', names });
      this._publish();
      this._runBot();
      return;
    }
    this._startMatch(this.players);
  }

  /**
   * Graceful exit. The host tears the whole room down, since nobody else can
   * referee the match. A guest removes only their own presence — their seat and
   * their view — and leaves the match standing for everyone else.
   *
   * Safe to call twice, and safe to call on a local bot match.
   */
  async leave() {
    if (this.left) return;
    this.left = true;

    this._cancelReap();
    for (const off of this.unsubs) { try { off(); } catch { /* already off */ } }
    this.unsubs = [];

    const wasHost = this.isHost;
    const code = this.code;
    const uid = this.uid;
    const local = this.local;

    this.game = null;
    this.seatOf = {};

    if (local || !code || !uid || !fb) return;   // bot match: nothing published

    const f = fb;
    await this._releaseSeatHold();
    try { await f.onDisconnect(f.ref(f.db, `rooms/${code}/meta/hostLeftAt`)).cancel(); } catch { /* not host */ }

    try {
      if (wasHost) {
        await f.remove(f.ref(f.db, `rooms/${code}`));
      } else {
        await f.remove(f.ref(f.db, `rooms/${code}/players/${uid}`));
        await f.remove(f.ref(f.db, `rooms/${code}/views/${uid}`));
      }
    } catch (err) {
      console.warn('cleanup failed', err.message);
    }
  }
}
