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

const COUNTERS = {};
for (const c of RULES.counters) COUNTERS[c.defense] = new Set(c.stops);
const POSSESSION = RULES.possession_after_successful_defense;
const CARD_RULES = RULES.cards;   // rules metadata, not the display text
export const GOALS_TO_WIN = RULES.match.goals_to_win;
export const HAND = RULES.match.hand_size;

const SHOT_STAGE = new Set(
  Object.entries(CARD_RULES).filter(([, c]) => c.stage === 'shot').map(([f]) => f));
const DEFENSE_FACES = new Set([
  ...Object.entries(CARD_RULES).filter(([, c]) => c.class === 'defense').map(([f]) => f),
  'CHAIN',
]);

// A seeded generator, so a match can be replayed exactly from its seed.
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

const faceOfClass = (card, klass) =>
  card.faces.find(f => CARD_RULES[f].class === klass) || null;

class Seat {
  constructor(index, name) {
    this.index = index;
    this.name = name;
    this.hand = [];
    this.fouled = false;         // may play Penalty
    this.goalUnlocked = false;    // partner's Assist landed
  }
  has(face) { return this.hand.some(c => c.faces.includes(face)); }
  find(id) { return this.hand.find(c => c.id === id); }
}

export class Game {
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
    this.pending = null;
    this.over = false;
    this.winner = null;
    this.phase = this._openAttack();
  }

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

  // ------------------------------------------------------------- helpers

  team(i) { return i % 2; }
  _partner(i) { return (i + 2) % this.n; }
  _next(i) { return (i + 1) % this.n; }

  _draw() {
    if (!this.deck.length) {
      if (!this.discard.length) return null;
      this.deck = this.rng.shuffle(this.discard);
      this.discard = [];
      this._emit('deck_recycled');
    }
    return this.deck.pop();
  }

  _burn(seat, card) {
    seat.hand.splice(seat.hand.indexOf(card), 1);
    this.discard.push(card);
  }

  _emit(kind, extra = {}) {
    const e = { id: ++this.eventId, kind, ...extra };
    this.log.push(e);
    return e;
  }

  _refill(seat) {
    while (seat.hand.length < HAND) {
      const c = this._draw();
      if (!c) break;
      seat.hand.push(c);
    }
  }
  _refillAll() { for (const s of this.seats) this._refill(s); }

  _strategy() { return this.mode === 'STRATEGY'; }

  // L18: cards drawn but never played are burned, so a hand never grows.
  _burnOwed(seatIndex, n) {
    const seat = this.seats[seatIndex];
    for (let i = 0; i < n; i++) {
      if (!seat.hand.length) break;
      this._burn(seat, seat.hand[this.rng.int(seat.hand.length)]);
      this._emit('leftover_burned', { seat: seatIndex });
    }
  }

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

  // ------------------------------------------------------------- phases

  _openAttack() {
    this.chain = [];
    this.defender = this._next(this.possession);
    if (this._strategy()) { this.owed = 0; return 'attack_draw'; }
    this.owed = 1;
    const c = this._draw();
    if (c) this.seats[this.possession].hand.push(c);
    return 'attack';
  }

  _openDefense() {
    if (this._strategy()) { this.defOwed = 0; return 'defense_draw'; }
    this.defOwed = 1;
    const c = this._draw();
    if (c) this.seats[this.defender].hand.push(c);
    return 'defense';
  }

  // ------------------------------------------------------------- view

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

  // ------------------------------------------------------------- legality

  legalActions(seatIndex) {
    if (this.over) return [];
    const me = this.seats[seatIndex];
    const acts = [];
    const drawTop = Math.min(3, Math.max(1, this.deck.length + this.discard.length));

    if (this.phase === 'attack_draw' && seatIndex === this.possession) {
      return Array.from({ length: drawTop }, (_, i) => ({ type: 'draw', n: i + 1 }));
    }
    if (this.phase === 'defense_draw' && seatIndex === this.defender) {
      return Array.from({ length: drawTop }, (_, i) => ({ type: 'draw', n: i + 1 }));
    }

    if (this.phase === 'attack' && seatIndex === this.possession) {
      for (const [c, f] of this._playableAttacks(me, this.owed <= 1)) {
        acts.push({ type: 'play', card_id: c.id, face: f });
      }
      for (const f of ['RESHUFFLE', 'END_MATCH']) {
        const c = me.hand.find(x => x.faces.includes(f));
        if (c) acts.push({ type: 'special', card_id: c.id, face: f });
      }
      if (!acts.some(a => a.type === 'play')) acts.push({ type: 'concede_possession' });
      return acts;
    }

    if (this.phase === 'defense' && seatIndex === this.defender) {
      const target = this.chain[this.chain.length - 1];
      for (const c of me.hand) {
        let f = faceOfClass(c, 'defense');
        if (!f && c.faces.includes('CHAIN')) f = 'CHAIN';
        if (f && DEFENSE_FACES.has(f)) {
          acts.push({
            type: 'play', card_id: c.id, face: f,
            counters: (COUNTERS[f] || new Set()).has(target),
          });
        } else {
          // mandatory attempt: any card may be burned
          acts.push({ type: 'play', card_id: c.id, face: c.faces[0], counters: false });
        }
      }
      return acts;
    }

    if (this.phase === 'react_own_goal' && seatIndex === this.pending.seat) {
      for (const c of me.hand) {
        if (c.faces.includes('OWN_GOAL')) {
          acts.push({ type: 'play', card_id: c.id, face: 'OWN_GOAL' });
        }
      }
      acts.push({ type: 'pass' });
      return acts;
    }

    if (this.phase === 'react_var' && seatIndex === this.pending.seat) {
      for (const c of me.hand) {
        if (c.faces.includes('VAR')) {
          acts.push({ type: 'play', card_id: c.id, face: 'VAR', call: 'heads' });
          acts.push({ type: 'play', card_id: c.id, face: 'VAR', call: 'tails' });
        }
      }
      acts.push({ type: 'pass' });
      return acts;
    }

    return acts;
  }

  _check(seatIndex, action) {
    const match = this.legalActions(seatIndex).find(a =>
      Object.entries(action).every(([k, v]) => a[k] === v));
    if (!match) {
      throw new Error(`illegal action for seat ${seatIndex}: ${JSON.stringify(action)}`);
    }
    return match;
  }

  // ------------------------------------------------------------- apply

  apply(seatIndex, action) {
    this._check(seatIndex, action);
    const before = this.log.length;
    const handler = {
      attack_draw: 'doDraw', defense_draw: 'doDraw', attack: 'doAttack',
      defense: 'doDefense', react_own_goal: 'doOwnGoal', react_var: 'doVar',
    }[this.phase];
    this[handler](seatIndex, action);
    return this.log.slice(before);
  }

  doDraw(seatIndex, action) {
    const seat = this.seats[seatIndex];
    for (let i = 0; i < action.n; i++) {
      const c = this._draw();
      if (c) seat.hand.push(c);
    }
    this._emit('drew', { seat: seatIndex, n: action.n });
    if (this.phase === 'attack_draw') {
      this.owed = action.n;
      this.phase = 'attack';
      if (!this._playableAttacks(seat, this.owed <= 1).length) this._concede();
    } else {
      this.defOwed = action.n;
      this.phase = 'defense';
    }
  }

  doAttack(seatIndex, action) {
    const seat = this.seats[seatIndex];
    if (action.type === 'concede_possession') { this._concede(); return; }
    const card = seat.find(action.card_id);
    const face = action.face;

    if (action.type === 'special') {
      this._burn(seat, card);
      if (face === 'END_MATCH') this._endMatch(seatIndex);
      else this._reshuffle(seat);
      return;
    }

    this._burn(seat, card);
    this.chain.push(face);
    this.owed -= 1;
    this._emit('attack_played', { seat: seatIndex, face });
    if (face === 'PENALTY') seat.fouled = false;

    // A shot always closes the chain and is always defended.
    if (SHOT_STAGE.has(face)) {
      this._burnOwed(seatIndex, this.owed);
      this.owed = 0;
      this.phase = this._openDefense();
      return;
    }

    if (this._strategy() && this.owed > 0) {
      this._emit('chain_passed', { face });
      if (!this._playableAttacks(seat, this.owed <= 1).length) {
        this._burnOwed(seatIndex, this.owed);
        this.owed = 0;
        this.phase = this._openDefense();
      }
      return;
    }

    this.phase = this._openDefense();
  }

  doDefense(seatIndex, action) {
    const seat = this.seats[seatIndex];
    const card = seat.find(action.card_id);
    const face = action.face;
    const target = this.chain[this.chain.length - 1];
    this._burn(seat, card);
    this.defOwed -= 1;
    const stopped = (COUNTERS[face] || new Set()).has(target);
    this._emit('defense_played', { seat: seatIndex, face, stopped });

    if (stopped) { this._resolveStopped(face, seatIndex); return; }
    if (this.defOwed > 0) return;   // keep trying with the next drawn card

    if (SHOT_STAGE.has(target)) {
      this._shotSucceeded(seatIndex);
    } else {
      this._emit('stage_passed', { face: target });
      this._refillAll();
      if (this._strategy()) {
        this.phase = 'attack_draw';
      } else {
        this.phase = 'attack';
        const c = this._draw();
        if (c) this.seats[this.possession].hand.push(c);
        this.owed = 1;
        if (!this._playableAttacks(this.seats[this.possession], true).length) this._concede();
      }
    }
  }

  _resolveStopped(face, defSeat) {
    const outcome = POSSESSION[face] || 'neutral';
    if (face === 'FOUL') this.seats[this.possession].fouled = true;

    if (outcome === 'defender') {
      this.possession = this._partner(defSeat);
      // Strategy: whatever the defender has left becomes a counter-attack
      if (this._strategy() && this.defOwed > 0 && this.n === 2) {
        this._refillAll();
        this.owed = this.defOwed;
        this.defOwed = 0;
        this.chain = [];
        this.defender = this._next(this.possession);
        this._emit('counter_attack', { seat: this.possession, cards: this.owed });
        this.phase = 'attack';
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

  _shotSucceeded(defSeat) {
    this._burnOwed(defSeat, this.defOwed);
    this.defOwed = 0;
    if (this.seats[defSeat].has('OWN_GOAL')) {
      this.pending = { seat: defSeat, reason: 'shot', face: this.chain[this.chain.length - 1] };
      this.phase = 'react_own_goal';
      return;
    }
    this._score(this.possession, this.chain[this.chain.length - 1]);
  }

  doOwnGoal(seatIndex, action) {
    if (action.type === 'pass') {
      this.pending = null;
      this._score(this.possession, this.chain[this.chain.length - 1]);
      return;
    }
    const seat = this.seats[seatIndex];
    this._burn(seat, seat.find(action.card_id));
    this._emit('own_goal_played', { seat: seatIndex });
    this.pending = null;
    this._score(seatIndex, 'OWN_GOAL', this.possession);
  }

  _score(scorer, face, conceder = null) {
    const c = conceder === null ? this._next(scorer) : conceder;
    this.score[this.team(scorer)] += 1;
    const ev = this._emit('goal', {
      scorer, face, conceder: c, score: [...this.score],
    });
    const victim = this._nextOfTeam(this._next(scorer), this.team(c));
    if (this.seats[victim].has('VAR')) {
      this.pending = { seat: victim, reason: 'goal', event: ev.id, scorer, conceder: c };
      this.phase = 'react_var';
      return;
    }
    this._afterGoal(c);
  }

  doVar(seatIndex, action) {
    const p = this.pending;
    if (action.type === 'pass') {
      this.pending = null;
      this._afterGoal(p.conceder);
      return;
    }
    const seat = this.seats[seatIndex];
    this._burn(seat, seat.find(action.card_id));
    const flip = this.rng.pick(['heads', 'tails']);
    // heads confirms the decision, tails overturns it
    const overturned = flip === 'tails';
    this._emit('var', {
      seat: seatIndex, call: action.call, flip, overturned,
      confirmed: flip === action.call,
    });
    if (overturned) {
      this.score[this.team(p.scorer)] -= 1;
      this._emit('goal_overturned', { scorer: p.scorer, score: [...this.score] });
    }
    this.pending = null;
    this._afterGoal(p.conceder);
  }

  _afterGoal(conceder) {
    this._refillAll();
    for (const t of [0, 1]) {
      if (this.score[t] >= GOALS_TO_WIN) {
        this.over = true;
        this.winner = t;
        this.phase = 'over';
        this._emit('match_over', { winner: t, reason: 'goals', score: [...this.score] });
        return;
      }
    }
    this.possession = this._nextOfTeam(this._next(this.defender), this.team(conceder));
    this.phase = this._openAttack();
  }

  // ------------------------------------------------------------- misc

  _nextWithAttack(start) {
    for (let k = 0; k < this.n; k++) {
      const i = (start + k) % this.n;
      if (this._playableAttacks(this.seats[i], true).length) return i;
    }
    return start;
  }

  _nextOfTeam(start, team) {
    for (let k = 0; k < this.n; k++) {
      const i = (start + k) % this.n;
      if (this.team(i) === team) return i;
    }
    return start;
  }

  _concede() {
    this._emit('possession_conceded', { seat: this.possession });
    this._burnOwed(this.possession, this.owed);
    this.owed = 0;
    this.defOwed = 0;
    this._refillAll();
    this.possession = this._next(this.possession);
    this.phase = this._openAttack();
  }

  _reshuffle(seat) {
    for (let i = 0; i < 2; i++) {
      if (seat.hand.length) this._burn(seat, seat.hand[this.rng.int(seat.hand.length)]);
    }
    this._refill(seat);
    this._emit('reshuffled', { seat: seat.index });
  }

  _endMatch(seatIndex) {
    const mine = this.team(seatIndex);
    const theirs = 1 - mine;
    // level scores hand the win to the opponent
    this.winner = this.score[mine] > this.score[theirs] ? mine : theirs;
    this.over = true;
    this.phase = 'over';
    this._emit('match_over', {
      winner: this.winner, reason: 'end_match', played_by: seatIndex, score: [...this.score],
    });
  }
}

// ----------------------------------------------------------------- bot

const PRIORITY = ['SUPER_SHOT', 'PENALTY', 'SHOT_GOAL', 'GOAL', 'DRIBBLE', 'PASS', 'ASSIST'];

export function botAction(game, seatIndex, policy = 'SHOOTER') {
  const acts = game.legalActions(seatIndex);
  if (!acts.length) return null;
  const kinds = new Set(acts.map(a => a.type));

  if (kinds.has('draw')) return { type: 'draw', n: 1 };

  if (game.phase === 'react_own_goal') {
    return acts.find(a => a.face === 'OWN_GOAL') || { type: 'pass' };
  }
  if (game.phase === 'react_var') {
    return acts.find(a => a.face === 'VAR' && a.call === 'heads') || { type: 'pass' };
  }

  if (game.phase === 'defense') {
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

  const plays = acts.filter(a => a.type === 'play');
  if (!plays.length) {
    return acts.find(a => a.face === 'RESHUFFLE') || acts[0];
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
