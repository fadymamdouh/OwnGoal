// OWN GOAL — game engine, browser build.
//
// A faithful port of scripts/engine.py. Same phases, same action shapes, same
// event names, so the Python server and this browser build cannot drift apart
// in behaviour. Rules come from rules.js, generated from references/rules.json.
//
// In this build the engine runs inside one player's browser rather than on a
// server, so `view(seat)` is what gets published per player and is still the
// only thing an opponent should ever receive.

import { RULES } from './rules.js';

// ═══════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════

/** Phase identifiers — every value the `phase` field can hold. */
const PHASES = {
  ATTACK_DRAW:       'attack_draw',
  ATTACK:            'attack',
  DEFENSE_DRAW:      'defense_draw',
  DEFENSE:           'defense',
  REACT_OWN_GOAL:    'react_own_goal',
  REACT_VAR:         'react_var',
  REACT_VAR_OFFSIDE: 'react_var_offside',
  RESHUFFLE_PICK:    'reshuffle_pick',
  OVER:              'over',
};

/** Event kind identifiers — every value the `kind` field in a log entry can hold. */
const EVENTS = {
  ATTACK_PLAYED:        'attack_played',
  CHAIN_PASSED:         'chain_passed',
  COUNTER_ATTACK:       'counter_attack',
  DECK_RECYCLED:        'deck_recycled',
  DEFENSE_PLAYED:       'defense_played',
  DREW:                 'drew',
  GOAL:                 'goal',
  GOAL_OVERTURNED:      'goal_overturned',
  LEFTOVER_BURNED:      'leftover_burned',
  MATCH_OVER:           'match_over',
  OFFSIDE_OVERTURNED:   'offside_overturned',
  OWN_GOAL_PLAYED:      'own_goal_played',
  POSSESSION_CONCEDED:  'possession_conceded',
  RESHUFFLE_OPENED:     'reshuffle_opened',
  RESHUFFLE_PICKED:     'reshuffle_picked',
  RESHUFFLE_TURN:       'reshuffle_turn',
  RESHUFFLED:           'reshuffled',
  STAGE_PASSED:         'stage_passed',
  VAR:                  'var',
};

/** Action type identifiers. */
const ACTIONS = {
  PLAY:                'play',
  SPECIAL:             'special',
  DRAW:                'draw',
  PICK:                'pick',
  PASS:                'pass',
  CONCEDE_POSSESSION:  'concede_possession',
};

const COUNTERS = {};
for (const c of RULES.counters) COUNTERS[c.defense] = new Set(c.stops);
const POSSESSION = RULES.possession_after_successful_defense;
const CARD_RULES = RULES.cards;   // rules metadata, not the display text
/** @type {number} */
export const GOALS_TO_WIN = RULES.match.goals_to_win;
/** @type {number} */
export const HAND = RULES.match.hand_size;

const SHOT_STAGE = new Set(
  Object.entries(CARD_RULES).filter(([, c]) => c.stage === 'shot').map(([f]) => f));
const DEFENSE_FACES = new Set([
  ...Object.entries(CARD_RULES).filter(([, c]) => c.class === 'defense').map(([f]) => f),
  'CHAIN',
]);

// ═══════════════════════════════════════
// RNG
// ═══════════════════════════════════════

/**
 * Create a seeded PRNG so a match can be replayed exactly from its seed.
 * @param {number|null} seed - Integer seed, or null for a random one.
 * @returns {{ next(): number, int(n: number): number, pick(a: any[]): any, shuffle(a: any[]): any[] }}
 */
function makeRng(seed) {
  let s = (seed ?? Math.floor(Math.random() * 2 ** 31)) | 0 || 1;
  return {
    next() { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 2 ** 32; },
    int(n) { return Math.floor(this.next() * n); },
    pick(a) { return a[this.int(a.length)]; },
    shuffle(a) {
      for (let i = a.length - 1; i > 0; i--) {
        const j = this.int(i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}

// ═══════════════════════════════════════
// CARD/SEAT CLASSES
// ═══════════════════════════════════════

/**
 * Return the first face on *card* whose rules class matches *klass*, or null.
 * @param {{ faces: string[] }} card
 * @param {string} klass - 'attack' or 'defense'
 * @returns {string|null}
 */
const faceOfClass = (card, klass) =>
  card.faces.find(f => CARD_RULES[f].class === klass) || null;

/** One player seat. Tracks hand, flags, and helpers. */
class Seat {
  /**
   * @param {number} index - Seat index (0-based).
   * @param {string} name - Display name.
   */
  constructor(index, name) {
    this.index = index;
    this.name = name;
    /** @type {Array<{id: string, faces: string[], kind: string}>} */
    this.hand = [];
    this.fouled = false;         // may play Penalty
    this.goalUnlocked = false;    // partner's Assist landed
  }

  /**
   * Check if the hand contains a card with the given face.
   * @param {string} face
   * @returns {boolean}
   */
  has(face) { return this.hand.some(c => c.faces.includes(face)); }

  /**
   * Find a card in hand by id.
   * @param {string} id
   * @returns {object|undefined}
   */
  find(id) { return this.hand.find(c => c.id === id); }
}

// ═══════════════════════════════════════
// GAME CLASS
// ═══════════════════════════════════════

export class Game {
  /**
   * Create a new OWN GOAL match.
   * @param {object} [opts]
   * @param {string} [opts.mode='LUCK'] - 'LUCK' or 'STRATEGY'
   * @param {string} [opts.matchType='ONE_V_ONE'] - 'ONE_V_ONE' or 'TWO_V_TWO'
   * @param {string[]|null} [opts.names=null] - Player names.
   * @param {number|null} [opts.seed=null] - RNG seed for reproducibility.
   */
  constructor({ mode = 'LUCK', matchType = 'ONE_V_ONE', names = null, seed = null } = {}) {
    if (!RULES.play_modes[mode]) throw new Error(`unknown mode ${mode}`);
    this.mode = mode;
    this.matchType = matchType;
    this.rng = makeRng(seed);
    this.n = matchType === 'ONE_V_ONE' ? 2 : 4;
    const nm = names || Array.from({ length: this.n }, (_, i) => `P${i + 1}`);
    this.seats = Array.from({ length: this.n }, (_, i) => new Seat(i, nm[i]));
    this.score = [0, 0];
    this.log = [];
    this.eventId = 0;

    this.deck = this._buildDeck();
    this.discard = [];
    for (const s of this.seats) for (let i = 0; i < HAND; i++) s.hand.push(this._draw());

    this.possession = this.rng.int(this.n);
    this.defender = this._next(this.possession);
    this.chain = [];
    this.owed = 0;
    this.defOwed = 0;
    this.noVarReview = false;   // set when a goal has already had its VAR review
    this.pending = null;
    this.over = false;
    this.winner = null;
    this.phase = this._openAttack();
  }

  /** @returns {object[]} Shuffled deck of card objects. */
  _buildDeck() {
    const removed = new Set(RULES.match_types_detail[this.matchType].removed_cards);
    const disabled = new Set(RULES.play_modes[this.mode].disabled_cards);
    const deck = [];
    let id = 0;
    for (const spec of RULES.physical_cards) {
      if (spec.faces.some(f => removed.has(f) || disabled.has(f))) continue;
      for (let i = 0; i < spec.copies; i++) {
        deck.push({ id: `c${id++}`, faces: [...spec.faces], kind: spec.type });
      }
    }
    return this.rng.shuffle(deck);
  }

  // ── helpers ──────────────────────────────────────────────────────

  /**
   * Return team index (0 or 1) for the given seat.
   * @param {number} i - Seat index.
   * @returns {number}
   */
  team(i) { return i % 2; }

  /**
   * @param {number} i
   * @returns {number}
   */
  _partner(i) { return (i + 2) % this.n; }

  /**
   * @param {number} i
   * @returns {number}
   */
  _next(i) { return (i + 1) % this.n; }

  /**
   * Draw one card from the deck, recycling discards if needed.
   * @returns {object|null}
   */
  _draw() {
    if (!this.deck.length) {
      if (!this.discard.length) return null;
      this.deck = this.rng.shuffle(this.discard);
      this.discard = [];
      this._emit(EVENTS.DECK_RECYCLED);
    }
    return this.deck.pop();
  }

  /**
   * Remove a card from a seat's hand and put it in the discard pile.
   * @param {Seat} seat
   * @param {object} card
   */
  _burn(seat, card) {
    seat.hand.splice(seat.hand.indexOf(card), 1);
    this.discard.push(card);
  }

  /**
   * Append an event to the log.
   * @param {string} kind - Event kind.
   * @param {object} [extra={}] - Additional event fields.
   * @returns {object} The emitted event.
   */
  _emit(kind, extra = {}) {
    const e = { id: ++this.eventId, kind, ...extra };
    this.log.push(e);
    return e;
  }

  /**
   * Top up a seat's hand to HAND size.
   * @param {Seat} seat
   */
  _refill(seat) {
    while (seat.hand.length < HAND) {
      const c = this._draw();
      if (!c) break;
      seat.hand.push(c);
    }
  }

  /** Refill all seats. */
  _refillAll() { for (const s of this.seats) this._refill(s); }

  /** @returns {boolean} True if the current mode is STRATEGY. */
  _strategy() { return this.mode === 'STRATEGY'; }

  /**
   * L18: cards drawn but never played are burned, so a hand never grows.
   * @param {number} seatIndex
   * @param {number} n - Number of cards to burn.
   */
  _burnOwed(seatIndex, n) {
    const seat = this.seats[seatIndex];
    for (let i = 0; i < n; i++) {
      if (!seat.hand.length) break;
      this._burn(seat, seat.hand[this.rng.int(seat.hand.length)]);
      this._emit(EVENTS.LEFTOVER_BURNED, { seat: seatIndex });
    }
  }

  /**
   * Return attack faces this seat may legally play right now.
   * @param {Seat} seat
   * @param {boolean} lastOfChain
   * @returns {Array<[object, string]>}
   */
  _playableAttacks(seat, lastOfChain) {
    const out = [];
    for (const c of seat.hand) {
      const f = faceOfClass(c, 'attack');
      if (!f) continue;
      if (f === 'PENALTY' && !seat.fouled) continue;
      if (f === 'GOAL' && !seat.goalUnlocked) continue;
      // a shot closes the chain, so it may only be the final card
      if (SHOT_STAGE.has(f) && !lastOfChain && this._strategy()) continue;
      out.push([c, f]);
    }
    return out;
  }

  // ═══════════════════════════════════════
  // PHASES
  // ═══════════════════════════════════════

  /**
   * Start a new attack turn.
   * @returns {string} The new phase.
   */
  _openAttack() {
    this.chain = [];
    this.defender = this._next(this.possession);
    if (this._strategy()) { this.owed = 0; return PHASES.ATTACK_DRAW; }
    this.owed = 1;
    const c = this._draw();
    if (c) this.seats[this.possession].hand.push(c);
    return PHASES.ATTACK;
  }

  /**
   * Start the defense phase.
   * @returns {string} The new phase.
   */
  _openDefense() {
    if (this._strategy()) { this.defOwed = 0; return PHASES.DEFENSE_DRAW; }
    this.defOwed = 1;
    const c = this._draw();
    if (c) this.seats[this.defender].hand.push(c);
    return PHASES.DEFENSE;
  }

  // ── view ─────────────────────────────────────────────────────────

  /**
   * Return game state visible to the given seat (safe to send over the wire).
   * @param {number} seatIndex
   * @returns {object}
   */
  view(seatIndex) {
    const me = this.seats[seatIndex];
    return {
      you: seatIndex,
      mode: this.mode,
      match_type: this.matchType,
      phase: this.phase,
      possession: this.possession,
      defender: this.defender,
      chain: [...this.chain],
      score: [...this.score],
      goals_to_win: GOALS_TO_WIN,
      deck_left: this.deck.length,
      discard: this.discard.length,
      over: this.over,
      winner: this.winner,
      owed: seatIndex === this.possession ? this.owed : this.defOwed,
      pending: this.pending,
      hand: me.hand.map(c => ({ id: c.id, faces: [...c.faces], kind: c.kind })),
      flags: { fouled: me.fouled, goal_unlocked: me.goalUnlocked },
      seats: this.seats.map(s => ({
        index: s.index, name: s.name, team: this.team(s.index), cards: s.hand.length,
      })),
      legal: this.legalActions(seatIndex),
      log: this.log.slice(-12),
    };
  }

  // ── legality ─────────────────────────────────────────────────────

  /**
   * Return all legal actions for the given seat in the current phase.
   * @param {number} seatIndex
   * @returns {object[]}
   */
  legalActions(seatIndex) {
    if (this.over) return [];
    const me = this.seats[seatIndex];
    const acts = [];
    const drawTop = Math.min(3, Math.max(1, this.deck.length + this.discard.length));

    if (this.phase === PHASES.ATTACK_DRAW && seatIndex === this.possession) {
      return Array.from({ length: drawTop }, (_, i) => ({ type: ACTIONS.DRAW, n: i + 1 }));
    }
    if (this.phase === PHASES.DEFENSE_DRAW && seatIndex === this.defender) {
      return Array.from({ length: drawTop }, (_, i) => ({ type: ACTIONS.DRAW, n: i + 1 }));
    }

    if (this.phase === PHASES.ATTACK && seatIndex === this.possession) {
      for (const [c, f] of this._playableAttacks(me, this.owed <= 1)) {
        acts.push({ type: ACTIONS.PLAY, card_id: c.id, face: f });
      }
      for (const f of ['RESHUFFLE', 'END_MATCH']) {
        const c = me.hand.find(x => x.faces.includes(f));
        if (!c) continue;
        if (f === 'END_MATCH') { acts.push({ type: ACTIONS.SPECIAL, card_id: c.id, face: f }); continue; }
        // Reshuffle: swap with the deck, or in 2v2 trade with your partner
        acts.push({ type: ACTIONS.SPECIAL, card_id: c.id, face: f, swap: 'deck' });
        if (this.n > 2) {
          acts.push({ type: ACTIONS.SPECIAL, card_id: c.id, face: f, swap: 'partner' });
        }
      }
      if (!acts.some(a => a.type === ACTIONS.PLAY)) acts.push({ type: ACTIONS.CONCEDE_POSSESSION });
      return acts;
    }

    if (this.phase === PHASES.DEFENSE && seatIndex === this.defender) {
      const target = this.chain[this.chain.length - 1];
      for (const c of me.hand) {
        // VAR answers a Goal or a Penalty as a review — the caller picks a side
        if (c.faces.includes('VAR') && (COUNTERS.VAR || new Set()).has(target)) {
          acts.push({ type: ACTIONS.PLAY, card_id: c.id, face: 'VAR', counters: true });
          continue;
        }
        let f = faceOfClass(c, 'defense');
        if (!f && c.faces.includes('CHAIN')) f = 'CHAIN';
        if (f && DEFENSE_FACES.has(f)) {
          acts.push({
            type: ACTIONS.PLAY, card_id: c.id, face: f,
            counters: (COUNTERS[f] || new Set()).has(target),
          });
        } else {
          // L35: END_MATCH cannot be activated while defending — skip it entirely
          if (c.faces.includes('END_MATCH')) continue;
          // mandatory attempt: any card may be burned
          acts.push({ type: ACTIONS.PLAY, card_id: c.id, face: c.faces[0], counters: false });
        }
      }
      return acts;
    }

    /* L33: each player picks the cards leaving their OWN hand, one tap at a
       time. Exactly 2, and never chosen at random. */
    if (this.phase === PHASES.RESHUFFLE_PICK && seatIndex === this.pending.seat) {
      const chosen = this.pending.chosen;
      for (const c of me.hand) {
        if (!chosen.includes(c.id)) acts.push({ type: ACTIONS.PICK, card_id: c.id });
      }
      return acts;
    }

    /* L34: after OFFSIDE stops an attack, the attacker can contest with VAR.
       The attacker calls heads/tails — they are the side contesting the call. */
    if (this.phase === PHASES.REACT_VAR_OFFSIDE && seatIndex === this.pending.seat) {
      for (const c of me.hand) {
        if (c.faces.includes('VAR')) {
          acts.push({ type: ACTIONS.PLAY, card_id: c.id, face: 'VAR', counters: true });
        }
      }
      acts.push({ type: ACTIONS.PASS });   // always offered — attacker can waive
      return acts;
    }

    if (this.phase === PHASES.REACT_OWN_GOAL && seatIndex === this.pending.seat) {
      for (const c of me.hand) {
        if (c.faces.includes('OWN_GOAL')) {
          acts.push({ type: ACTIONS.PLAY, card_id: c.id, face: 'OWN_GOAL' });
        }
      }
      acts.push({ type: ACTIONS.PASS });
      return acts;
    }

    if (this.phase === PHASES.REACT_VAR && seatIndex === this.pending.seat) {
      for (const c of me.hand) {
        if (c.faces.includes('VAR')) {
          acts.push({ type: ACTIONS.PLAY, card_id: c.id, face: 'VAR' });
        }
      }
      acts.push({ type: ACTIONS.PASS });
      return acts;
    }

    return acts;
  }

  /**
   * Validate that *action* is legal for *seatIndex*; return the matched action.
   * @param {number} seatIndex
   * @param {object} action
   * @returns {object}
   */
  _check(seatIndex, action) {
    const match = this.legalActions(seatIndex).find(a =>
      Object.entries(action).every(([k, v]) => a[k] === v));
    if (!match) {
      throw new Error(`illegal action for seat ${seatIndex}: ${JSON.stringify(action)}`);
    }
    return match;
  }

  // ── apply ────────────────────────────────────────────────────────

  /**
   * Validate and apply an action for the given seat. Returns new log entries.
   * @param {number} seatIndex
   * @param {object} action
   * @returns {object[]}
   */
  apply(seatIndex, action) {
    this._check(seatIndex, action);
    const before = this.log.length;
    const handler = {
      [PHASES.ATTACK_DRAW]:       'doDraw',
      [PHASES.DEFENSE_DRAW]:      'doDraw',
      [PHASES.ATTACK]:            'doAttack',
      [PHASES.DEFENSE]:           'doDefense',
      [PHASES.REACT_OWN_GOAL]:    'doOwnGoal',
      [PHASES.REACT_VAR]:         'doVar',
      [PHASES.REACT_VAR_OFFSIDE]: 'doVarOffside',
      [PHASES.RESHUFFLE_PICK]:    'doReshufflePick',
    }[this.phase];
    this[handler](seatIndex, action);
    return this.log.slice(before);
  }

  /**
   * Handle a draw action (attack_draw or defense_draw phase).
   * @param {number} seatIndex
   * @param {object} action
   */
  doDraw(seatIndex, action) {
    const seat = this.seats[seatIndex];
    for (let i = 0; i < action.n; i++) {
      const c = this._draw();
      if (c) seat.hand.push(c);
    }
    this._emit(EVENTS.DREW, { seat: seatIndex, n: action.n });
    if (this.phase === PHASES.ATTACK_DRAW) {
      this.owed = action.n;
      this.phase = PHASES.ATTACK;
      if (!this._playableAttacks(seat, this.owed <= 1).length) this._concede();
    } else {
      this.defOwed = action.n;
      this.phase = PHASES.DEFENSE;
    }
  }

  /**
   * Handle an attack-phase action (play, special, or concede).
   * @param {number} seatIndex
   * @param {object} action
   */
  doAttack(seatIndex, action) {
    const seat = this.seats[seatIndex];
    if (action.type === ACTIONS.CONCEDE_POSSESSION) { this._concede(); return; }
    const card = seat.find(action.card_id);
    const face = action.face;

    if (action.type === ACTIONS.SPECIAL) {
      this._burn(seat, card);
      if (face === 'END_MATCH') this._endMatch(seatIndex);
      else this._openReshuffle(seatIndex, action.swap || 'deck');
      return;
    }

    this._burn(seat, card);
    this.chain.push(face);
    this.owed -= 1;
    this._emit(EVENTS.ATTACK_PLAYED, { seat: seatIndex, face });
    if (face === 'PENALTY') seat.fouled = false;

    // A shot always closes the chain and is always defended.
    if (SHOT_STAGE.has(face)) {
      this._burnOwed(seatIndex, this.owed);
      this.owed = 0;
      this.phase = this._openDefense();
      return;
    }

    if (this._strategy() && this.owed > 0) {
      this._emit(EVENTS.CHAIN_PASSED, { face });
      if (!this._playableAttacks(seat, this.owed <= 1).length) {
        this._burnOwed(seatIndex, this.owed);
        this.owed = 0;
        this.phase = this._openDefense();
      }
      return;
    }

    this.phase = this._openDefense();
  }

  /**
   * Handle a defense-phase action.
   * @param {number} seatIndex
   * @param {object} action
   */
  doDefense(seatIndex, action) {
    const seat = this.seats[seatIndex];
    const card = seat.find(action.card_id);
    const face = action.face;
    const target = this.chain[this.chain.length - 1];
    this._burn(seat, card);
    this.defOwed -= 1;
    const answers = (COUNTERS[face] || new Set()).has(target);

    /* Own Goal does NOT stop a scoring card — it flips it. The point goes to
       the defender and the ball to the attacker. Same resolution as the
       react_own_goal path, so it no longer matters whether the defender plays
       it directly or burns a card first. (rulebook: Own Goal) */
    if (face === 'OWN_GOAL' && answers) {
      this._emit(EVENTS.DEFENSE_PLAYED, { seat: seatIndex, face, stopped: false });
      this._burnOwed(seatIndex, this.defOwed);
      this.defOwed = 0;
      this._emit(EVENTS.OWN_GOAL_PLAYED, { seat: seatIndex });
      this._score(seatIndex, 'OWN_GOAL', this.possession);
      return;
    }

    /* VAR is a coin-flip review, never a duel: tails overturns the decision,
       heads confirms it. The caller picks a side first, which is recorded but
       does not change the outcome. One review per event, so a confirmed goal
       cannot then be reviewed again from the react_var phase.
       (rulebook: VAR) */
    if (face === 'VAR' && answers) {
      this._burnOwed(seatIndex, this.defOwed);
      this.defOwed = 0;
      const flip = this.rng.pick(['heads', 'tails']);
      const overturned = flip === 'tails';
      this._emit(EVENTS.VAR, { seat: seatIndex, flip, overturned, reviewing: target });
      this._emit(EVENTS.DEFENSE_PLAYED, { seat: seatIndex, face, stopped: overturned });
      if (overturned) { this._resolveStopped('VAR', seatIndex); return; }
      this.noVarReview = true;     // this event has had its one review
      this._shotSucceeded(seatIndex);
      return;
    }

    const stopped = answers;
    this._emit(EVENTS.DEFENSE_PLAYED, { seat: seatIndex, face, stopped });

    if (stopped) { this._resolveStopped(face, seatIndex); return; }
    if (this.defOwed > 0) return;   // keep trying with the next drawn card

    if (SHOT_STAGE.has(target)) {
      this._shotSucceeded(seatIndex);
    } else {
      this._emit(EVENTS.STAGE_PASSED, { face: target });
      this._refillAll();
      if (this._strategy()) {
        this.phase = PHASES.ATTACK_DRAW;
      } else {
        this.phase = PHASES.ATTACK;
        const c = this._draw();
        if (c) this.seats[this.possession].hand.push(c);
        this.owed = 1;
        if (!this._playableAttacks(this.seats[this.possession], true).length) this._concede();
      }
    }
  }

  /**
   * After a defense stops the attack, resolve possession and phase transition.
   * @param {string} face - The defense face that stopped the attack.
   * @param {number} defSeat - The defender's seat index.
   */
  _resolveStopped(face, defSeat) {
    const outcome = POSSESSION[face] || 'neutral';
    if (face === 'FOUL') this.seats[this.possession].fouled = true;

    /* L34: after OFFSIDE stops an attack, the attacker may contest with VAR. */
    if (face === 'OFFSIDE') {
      const atk = this.possession;
      const attacker = this._nextOfTeam(atk, this.team(atk));
      if (!this.noVarReview && this.seats[attacker].has('VAR')) {
        this.noVarReview = false;
        this.pending = { seat: attacker, reason: 'offside', defSeat };
        this.phase = PHASES.REACT_VAR_OFFSIDE;
        return;
      }
    }

    if (outcome === 'defender') {
      this.possession = this._partner(defSeat);
      // Strategy: whatever the defender has left becomes a counter-attack
      if (this._strategy() && this.defOwed > 0 && this.n === 2) {
        this._refillAll();
        this.owed = this.defOwed;
        this.defOwed = 0;
        this.chain = [];
        this.defender = this._next(this.possession);
        this._emit(EVENTS.COUNTER_ATTACK, { seat: this.possession, cards: this.owed });
        this.phase = PHASES.ATTACK;
        if (!this._playableAttacks(this.seats[this.possession], this.owed <= 1).length) {
          this._concede();
        }
        return;
      }
    } else if (outcome !== 'attacker') {
      this.possession = this._nextWithAttack(this._next(defSeat));
    }
    this._burnOwed(defSeat, this.defOwed);
    this.defOwed = 0;
    this._refillAll();
    this.phase = this._openAttack();
  }

  /**
   * A shot got through defense — check for Own Goal reaction, then score.
   * @param {number} defSeat
   */
  _shotSucceeded(defSeat) {
    this._burnOwed(defSeat, this.defOwed);
    this.defOwed = 0;
    if (this.seats[defSeat].has('OWN_GOAL')) {
      this.pending = { seat: defSeat, reason: 'shot', face: this.chain[this.chain.length - 1] };
      this.phase = PHASES.REACT_OWN_GOAL;
      return;
    }
    this._score(this.possession, this.chain[this.chain.length - 1]);
  }

  /**
   * Handle VAR-on-offside reaction.
   * @param {number} seatIndex
   * @param {object} action
   */
  doVarOffside(seatIndex, action) {
    const p = this.pending;
    const { defSeat } = p;
    this.pending = null;
    if (action.type === ACTIONS.PASS) {
      // attacker waives VAR — set guard so _resolveStopped won't re-open
      this.noVarReview = true;
      this._resolveStopped('OFFSIDE', defSeat);
      return;
    }
    // VAR coin flip
    const seat = this.seats[seatIndex];
    const card = seat.find(action.card_id);
    this._burn(seat, card);
    const flip = this.rng.pick(['heads', 'tails']);
    const overturned = flip === 'tails';   // tails = offside confirmed (stands)
    this._emit(EVENTS.VAR, {
      seat: seatIndex, flip, overturned, reviewing: 'OFFSIDE',
    });
    if (overturned) {
      // offside confirmed — resolve it normally
      this._resolveStopped('OFFSIDE', defSeat);
    } else {
      // offside overturned — attack continues from where it was
      this.noVarReview = true;
      this._emit(EVENTS.OFFSIDE_OVERTURNED, { seat: seatIndex });
      this._refillAll();
      if (this._strategy()) {
        this.phase = PHASES.ATTACK_DRAW;
      } else {
        this.phase = PHASES.ATTACK;
        const c = this._draw();
        if (c) this.seats[this.possession].hand.push(c);
        this.owed = 1;
      }
    }
  }

  /**
   * Handle Own Goal reaction.
   * @param {number} seatIndex
   * @param {object} action
   */
  doOwnGoal(seatIndex, action) {
    if (action.type === ACTIONS.PASS) {
      this.pending = null;
      this._score(this.possession, this.chain[this.chain.length - 1]);
      return;
    }
    const seat = this.seats[seatIndex];
    this._burn(seat, seat.find(action.card_id));
    this._emit(EVENTS.OWN_GOAL_PLAYED, { seat: seatIndex });
    this.pending = null;
    this._score(seatIndex, 'OWN_GOAL', this.possession);
  }

  /**
   * Record a goal, check for VAR reaction, then proceed.
   * @param {number} scorer
   * @param {string} face
   * @param {number|null} [conceder=null]
   */
  _score(scorer, face, conceder = null) {
    const c = conceder === null ? this._next(scorer) : conceder;
    this.score[this.team(scorer)] += 1;
    const ev = this._emit(EVENTS.GOAL, {
      scorer, face, conceder: c, score: [...this.score],
    });
    const victim = this._nextOfTeam(this._next(scorer), this.team(c));
    const reviewed = this.noVarReview;   // already reviewed during the defense
    this.noVarReview = false;
    if (!reviewed && this.seats[victim].has('VAR')) {
      this.pending = { seat: victim, reason: 'goal', event: ev.id, scorer, conceder: c };
      this.phase = PHASES.REACT_VAR;
      return;
    }
    this._afterGoal(c);
  }

  /**
   * Handle VAR reaction on a goal.
   * @param {number} seatIndex
   * @param {object} action
   */
  doVar(seatIndex, action) {
    const p = this.pending;
    if (action.type === ACTIONS.PASS) {
      this.pending = null;
      this._afterGoal(p.conceder);
      return;
    }
    const seat = this.seats[seatIndex];
    this._burn(seat, seat.find(action.card_id));
    const flip = this.rng.pick(['heads', 'tails']);
    // heads confirms the decision, tails overturns it
    const overturned = flip === 'tails';
    this._emit(EVENTS.VAR, {
      seat: seatIndex, flip, overturned,
    });
    if (overturned) {
      this.score[this.team(p.scorer)] -= 1;
      this._emit(EVENTS.GOAL_OVERTURNED, { scorer: p.scorer, score: [...this.score] });
    }
    this.pending = null;
    this._afterGoal(p.conceder);
  }

  /**
   * After a goal is resolved, check for match end and set up next attack.
   * @param {number} conceder
   */
  _afterGoal(conceder) {
    this._refillAll();
    for (const t of [0, 1]) {
      if (this.score[t] >= GOALS_TO_WIN) {
        this.over = true;
        this.winner = t;
        this.phase = PHASES.OVER;
        this._emit(EVENTS.MATCH_OVER, { winner: t, reason: 'goals', score: [...this.score] });
        return;
      }
    }
    this.possession = this._nextOfTeam(this._next(this.defender), this.team(conceder));
    this.phase = this._openAttack();
  }

  // ── misc ─────────────────────────────────────────────────────────

  /**
   * Find the next seat (from *start*) that has a playable attack face.
   * @param {number} start
   * @returns {number}
   */
  _nextWithAttack(start) {
    for (let k = 0; k < this.n; k++) {
      const i = (start + k) % this.n;
      if (this._playableAttacks(this.seats[i], true).length) return i;
    }
    return start;
  }

  /**
   * Find the next seat (from *start*) belonging to *team*.
   * @param {number} start
   * @param {number} team
   * @returns {number}
   */
  _nextOfTeam(start, team) {
    for (let k = 0; k < this.n; k++) {
      const i = (start + k) % this.n;
      if (this.team(i) === team) return i;
    }
    return start;
  }

  /** Concede possession and start a new attack for the opponent. */
  _concede() {
    this._emit(EVENTS.POSSESSION_CONCEDED, { seat: this.possession });
    this._burnOwed(this.possession, this.owed);
    this.owed = 0;
    this.defOwed = 0;
    this._refillAll();
    this.possession = this._next(this.possession);
    this.phase = this._openAttack();
  }

  /* ── reshuffle ────────────────────────────────────────────────────
     L33: the player picks which cards leave their own hand. Playing the card
     already discarded it, so the hand is at 3 here and exactly 2 more go.

     A partner trade needs BOTH players to choose, each from their own hand, so
     the phase runs twice: the player who played the card picks first, then the
     partner. Nobody reaches into anyone else's hand.

     Reshuffle does not consume the attack, so `owed` is left alone and play
     returns to the attack phase when the picking is done.                    */

  /**
   * Open a reshuffle sub-phase.
   * @param {number} seatIndex
   * @param {string} swap - 'deck' or 'partner'
   */
  _openReshuffle(seatIndex, swap) {
    const seat = this.seats[seatIndex];
    const partner = this._partner(seatIndex);
    const withPartner = swap === 'partner' && this.n > 2 && partner !== seatIndex;

    this.pending = {
      kind: 'reshuffle',
      swap: withPartner ? 'partner' : 'deck',
      seat: seatIndex,          // whose turn it is to pick, right now
      owner: seatIndex,         // who played the card
      partner: withPartner ? partner : null,
      chosen: [],               // card ids picked by the seat currently choosing
      taken: {},                // seat -> [cards] pulled out of that hand
    };
    this.phase = PHASES.RESHUFFLE_PICK;
    this._emit(EVENTS.RESHUFFLE_OPENED, {
      seat: seatIndex, swap: this.pending.swap,
      partner: withPartner ? partner : null,
    });
    // a hand too short to pick from resolves straight away
    this._maybeFinishPicking();
  }

  /**
   * Handle a reshuffle pick action.
   * @param {number} seatIndex
   * @param {object} action
   */
  doReshufflePick(seatIndex, action) {
    const p = this.pending;
    p.chosen.push(action.card_id);
    this._emit(EVENTS.RESHUFFLE_PICKED, { seat: seatIndex, count: p.chosen.length });
    this._maybeFinishPicking();
  }

  /** Finish picking once enough cards have been chosen. */
  _maybeFinishPicking() {
    const p = this.pending;
    const seat = this.seats[p.seat];
    const want = Math.min(2, seat.hand.length);
    if (p.chosen.length < want) return;          // still choosing

    // lift the chosen cards out of this hand
    p.taken[p.seat] = p.chosen.map(id => seat.find(id)).filter(Boolean);
    for (const c of p.taken[p.seat]) {
      seat.hand.splice(seat.hand.indexOf(c), 1);
    }

    // partner trade: hand over to the partner to choose from their own hand
    if (p.swap === 'partner' && p.partner !== null && p.taken[p.partner] === undefined) {
      p.seat = p.partner;
      p.chosen = [];
      this._emit(EVENTS.RESHUFFLE_TURN, { seat: p.partner });
      this._maybeFinishPicking();
      return;
    }

    if (p.swap === 'partner' && p.partner !== null) {
      // each side receives what the other put in
      const a = p.owner, b = p.partner;
      this.seats[a].hand.push(...p.taken[b]);
      this.seats[b].hand.push(...p.taken[a]);
      this._emit(EVENTS.RESHUFFLED, {
        seat: a, swap: 'partner', partner: b, n: p.taken[a].length,
      });
    } else {
      for (const c of p.taken[p.owner]) this.discard.push(c);
      this._emit(EVENTS.RESHUFFLED, { seat: p.owner, swap: 'deck', n: p.taken[p.owner].length });
    }

    this.pending = null;
    this._refillAll();
    this.phase = PHASES.ATTACK;       // Reshuffle never consumed the attack
    if (!this._playableAttacks(this.seats[this.possession], this.owed <= 1).length) {
      this._concede();
    }
  }

  /**
   * End the match early (End Match card).
   * @param {number} seatIndex
   */
  _endMatch(seatIndex) {
    const mine = this.team(seatIndex);
    const theirs = 1 - mine;
    // level scores hand the win to the opponent
    this.winner = this.score[mine] > this.score[theirs] ? mine : theirs;
    this.over = true;
    this.phase = PHASES.OVER;
    this._emit(EVENTS.MATCH_OVER, {
      winner: this.winner, reason: 'end_match', played_by: seatIndex, score: [...this.score],
    });
  }
}

// ═══════════════════════════════════════
// BOT
// ═══════════════════════════════════════

const PRIORITY = ['SUPER_SHOT', 'PENALTY', 'SHOT_GOAL', 'GOAL', 'DRIBBLE', 'PASS', 'ASSIST'];

/**
 * Choose an action for *seatIndex* using the given *policy*.
 * @param {Game} game
 * @param {number} seatIndex
 * @param {string} [policy='SHOOTER'] - 'SHOOTER' or 'PATIENT'
 * @returns {object|null}
 */
export function botAction(game, seatIndex, policy = 'SHOOTER') {
  const acts = game.legalActions(seatIndex);
  if (!acts.length) return null;
  const kinds = new Set(acts.map(a => a.type));

  if (kinds.has(ACTIONS.DRAW)) return { type: ACTIONS.DRAW, n: 1 };

  if (game.phase === PHASES.REACT_OWN_GOAL) {
    return acts.find(a => a.face === 'OWN_GOAL') || { type: ACTIONS.PASS };
  }
  if (game.phase === PHASES.REACT_VAR) {
    return acts.find(a => a.face === 'VAR') || { type: ACTIONS.PASS };
  }

  /* Picking cards to swap away. A human would dump their least useful cards, so
     the bot does the same: anything with no attack face and no counter value
     goes first, keeping shots and split cards. */
  if (game.phase === PHASES.REACT_VAR_OFFSIDE) {
    // attacker contests an offside call — take the VAR if held, otherwise pass
    const va = acts.find(a => a.face === 'VAR');
    return va || { type: ACTIONS.PASS };
  }

  if (game.phase === PHASES.RESHUFFLE_PICK) {
    const worth = id => {
      const c = game.seats[seatIndex].hand.find(x => x.id === id);
      if (!c) return 0;
      if (c.kind === 'split') return 3;                     // two uses in one card
      if (SHOT_STAGE.has(c.faces[0])) return 3;
      if (DEFENSE_FACES.has(c.faces[0])) return 2;
      if (c.faces[0] === 'RESHUFFLE') return 0;             // dump spares first
      return 1;
    };
    return [...acts].sort((a, b) => worth(a.card_id) - worth(b.card_id))[0];
  }

  if (game.phase === PHASES.DEFENSE) {
    const good = acts.filter(a => a.counters);
    if (good.length) {
      good.sort((a, b) =>
        (POSSESSION[a.face] === 'defender' ? 0 : 1) - (POSSESSION[b.face] === 'defender' ? 0 : 1));
      return good[0];
    }
    return [...acts].sort((a, b) =>
      (PRIORITY.includes(a.face) ? 1 : 0) - (PRIORITY.includes(b.face) ? 1 : 0))[0];
  }

  const ahead = game.score[game.team(seatIndex)] > game.score[1 - game.team(seatIndex)];
  const endMatch = acts.find(a => a.face === 'END_MATCH');
  if (endMatch && ahead) return endMatch;

  const plays = acts.filter(a => a.type === ACTIONS.PLAY);
  if (!plays.length) {
    // dead hand: reshuffle rather than concede. Deck swap, not a partner trade —
    // dragging a partner into it needs judgement a bot does not have.
    return acts.find(a => a.face === 'RESHUFFLE' && a.swap === 'deck') || acts[0];
  }

  let order = PRIORITY;
  if (policy === 'PATIENT') {
    const shots = plays.filter(a => SHOT_STAGE.has(a.face));
    const builds = plays.filter(a => !SHOT_STAGE.has(a.face));
    if (shots.length && builds.length) order = ['ASSIST', 'PASS', 'DRIBBLE', ...PRIORITY];
  }
  const rank = f => (order.indexOf(f) === -1 ? 99 : order.indexOf(f));
  plays.sort((a, b) => rank(a.face) - rank(b.face));
  return plays[0];
}
