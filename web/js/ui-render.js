/* ui-render.js — view state management and top-level render() dispatcher.
 *
 * Owns all shared mutable state. Other modules access it via the
 * exported `state` proxy object. Late-bound render functions are
 * injected by app.js through initRender(). */
import {CARDS} from '../cards.js';

const $ = id => document.getElementById(id);
const AR   = f => (CARDS[f]?.ar)   || f;
const KIND = f => (CARDS[f]?.kind) || 'special';

/* ─── mutable state ─────────────────────────────────────────── */
let room = null, view = null, fmt = 'bot', mode = 'LUCK', picked = null;
let table = [];
let feed = [];
let lastEvent = 0;
let drawnCount = 0;
let sweepTable = false;
let lastPossession = null;
let cardNo = 0;
let prevHand = [];
let facedown = [];
let busyDeck = false;
let picks = [];

/* ─── constants ─────────────────────────────────────────────── */
const CARD_EVENTS = {
  attack_played:   e => ({face: e.face, seat: e.seat}),
  defense_played:  e => ({face: e.face, seat: e.seat}),
  own_goal_played: e => ({face: 'OWN_GOAL', seat: e.seat}),
  var:             e => ({face: 'VAR', seat: e.seat}),
};
const ENDS_POSSESSION = new Set([
  'goal', 'goal_overturned', 'possession_conceded', 'counter_attack', 'match_over',
]);

const PHASE_TEXT = {
  attack_draw: ['اسحب كام كارت؟', 'وتلعب نفس العدد بالظبط'],
  attack: ['دورك تهجم', 'الشوطة لازم تكون آخر كارت في السلسلة'],
  defense_draw: ['اسحب كام كارت للدفاع؟', 'أول كارت يكسر الاستحواذ، والباقي يبقى مرتدتك'],
  defense: ['رد على الهجمة', 'لازم تلعب كارت حتى لو مالكش رد'],
  react_own_goal: ['الشوطة عدّت! معاك Own Goal', 'تلعبه؟ النقطة تتحسب لك'],
  reshuffle_pick: ['اختار كارتين للتبديل', 'اللي تختاره هو اللي يمشي'],
  react_var_offside: ['الحكم اتحكم تسلل — معاك VAR', 'العب الكارت والعملة تتقلب'],
  react_var: ['اتسجل هدف — معاك VAR', 'العب الكارت والعملة تتقلب'],
};
/* Commentary, newest first, marked by the running card count. Big moments get
   a headline; a possession change renders as an out/in pair, the way a
   substitution does on a broadcast timeline. */
const KEY_EVENTS = new Set([
  'goal', 'goal_overturned', 'var', 'own_goal_played', 'match_over',
  'counter_attack',
]);


/* ─── late-bound render functions (set by app.js) ───────────── */
let _renderBoard, _renderFeed, _renderFan, _renderTable, _renderDeck, _renderHand;
let _runAnimations, _cardPendingFn;

export function initRender(deps) {
  _renderBoard   = deps.renderBoard;
  _renderFeed    = deps.renderFeed;
  _renderFan     = deps.renderFan;
  _renderTable   = deps.renderTable;
  _renderDeck    = deps.renderDeck;
  _renderHand    = deps.renderHand;
  _runAnimations = deps.runAnimations;
  _cardPendingFn = deps.cardPendingFn;
}

/* ─── foldEvents ────────────────────────────────────────────── */
function foldEvents(v) {
  const evs = (v.log || []).filter(e => e && typeof e.id === 'number');
  if (!evs.length) { watchPossession(v); return; }

  /* v.log is only the last 12 events. On a bad connection, or for a player
     rejoining mid-match, more than that can be missed and those events are
     gone for good — the engine cannot be asked for them again. Mark the hole
     rather than show a commentary that is quietly wrong. A fresh match starts
     at id 1, so no marker appears there. */
  const oldest = Math.min(...evs.map(e => e.id));
  if (oldest > lastEvent + 1) feed.push({kind: 'gap'});

  for (const e of evs) {
    if (e.id <= lastEvent) continue;
    lastEvent = e.id;

    const make = CARD_EVENTS[e.kind];
    if (make) {
      cardNo += 1;
      if (sweepTable) { table = []; drawnCount = 0; sweepTable = false; }
      table.push(make(e));
      feed.push({no: cardNo, ...e});
    } else {
      feed.push({no: cardNo, ...e});
      if (ENDS_POSSESSION.has(e.kind)) sweepTable = true;
    }

    /* A stopped attack closes the exchange. Checked AFTER the card is pushed,
       because a defending Interception belongs to the ATTACKER's exchange — it
       closes that possession rather than opening the interceptor's. */
    if (e.kind === 'defense_played' && e.stopped) sweepTable = true;
  }
  watchPossession(v);
}
/* A TURNOVER EMITS NO EVENT OF ITS OWN — the engine just flips possession and
   clears the chain. Without this, an Interception followed by the winner's own
   Shot would sit on the table as if it were one turn. Catches every cause
   without enumerating them: foul, concede, counter-attack, neutral stops. */
function watchPossession(v) {
  if (lastPossession !== null && v.possession !== lastPossession) {
    sweepTable = true;
  }
  lastPossession = v.possession;
}

/** Reset table and commentary between matches. */
function resetTable() {
  table = []; feed = [];
  lastEvent = 0; drawnCount = 0; cardNo = 0;
  sweepTable = false; lastPossession = null;
  prevHand = []; facedown = []; busyDeck = false; picks = [];
  $('fan').innerHTML = '';
  $('hist').innerHTML = '';
  $('feed').innerHTML = '';
}

/* ─── top-level render() ────────────────────────────────────── */
function render() {
  const v = view;
  // score and deck counts are drawn by renderBoard() now
  $('deckleft').textContent = v.deck_left;
  $('discard').textContent = v.discard;

  const mine = v.legal.length > 0;
  $('turnpill').textContent = facedown.length ? 'اسحب' : (mine ? 'دورك' : 'مستني');
  $('turnpill').className = 'pill' + (mine ? ' live' : '');

  const p = facedown.length
    ? ['دوس على الديك', 'الكارت في إيدك بس لسه مقلوب']
    : (PHASE_TEXT[v.phase] || ['—', '']);
  $('prompt').className = 'prompt' + (mine ? ' mine' : '');
  $('prompt').innerHTML = mine ? `${p[0]}<small>${p[1]}</small>`
    : `الاستحواذ مع ${v.seats[v.possession]?.name || ''}<small>مستني اللاعب التاني</small>`;

  _renderBoard();
  _renderFeed();
  _renderFan();
  _renderTable();
  _renderDeck();
  // Wait for any card sound to finish before revealing new playable cards.
  // This makes the game feel like it pauses briefly while the card "speaks".
  _cardPendingFn().then(() => _renderHand());

  if (v.over) {
    const meTeam = v.you % 2;
    $('over').classList.remove('hide');
    $('over').innerHTML =
      `<div class="big" style="color:${v.winner === meTeam ? 'var(--defense-glow)' : 'var(--attack-glow)'}">
        ${v.winner === meTeam ? 'كسبت' : 'خسرت'}</div>
       <div class="hint">${v.score[0]} — ${v.score[1]}</div>
       <button class="go" id="again" style="margin-top:14px">ماتش تاني</button>`;
    $('again').onclick = () => {
      $('over').classList.add('hide');
      resetTable();
      state.room.rematch();
    };
  } else $('over').classList.add('hide');
}

/* ─── state proxy ───────────────────────────────────────────── */
export const state = {
  get room() { return room; },       set room(v) { room = v; },
  get view() { return view; },       set view(v) { view = v; },
  get fmt() { return fmt; },         set fmt(v) { fmt = v; },
  get mode() { return mode; },       set mode(v) { mode = v; },
  get picked() { return picked; },   set picked(v) { picked = v; },
  get table() { return table; },     set table(v) { table = v; },
  get feed() { return feed; },       set feed(v) { feed = v; },
  get lastEvent() { return lastEvent; }, set lastEvent(v) { lastEvent = v; },
  get drawnCount() { return drawnCount; }, set drawnCount(v) { drawnCount = v; },
  get sweepTable() { return sweepTable; }, set sweepTable(v) { sweepTable = v; },
  get lastPossession() { return lastPossession; }, set lastPossession(v) { lastPossession = v; },
  get cardNo() { return cardNo; },   set cardNo(v) { cardNo = v; },
  get prevHand() { return prevHand; }, set prevHand(v) { prevHand = v; },
  get facedown() { return facedown; }, set facedown(v) { facedown = v; },
  get busyDeck() { return busyDeck; }, set busyDeck(v) { busyDeck = v; },
  get picks() { return picks; },     set picks(v) { picks = v; },
};

export { $, AR, KIND, render, resetTable, foldEvents,
         CARD_EVENTS, ENDS_POSSESSION, PHASE_TEXT, KEY_EVENTS };
