/* ui-animations.js — sound system and visual animations.
 *
 * Contains: procedural/sampled sound, crowd/intro loops,
 *           coin flip, goal celebration, concede, no-effect,
 *           and the per-view runAnimations() dispatcher. */
import {$} from './ui-render.js';
import {state} from './ui-render.js';

const SND_BASE = 'sounds/';
const _bufs  = {};
let   _actx       = null;
let   _muted      = false;
let   _crowdNode  = null;
let   _crowdGain  = null;
let   _introNode  = null;
let   _cardNode   = null;
let   _cardPending = Promise.resolve();   // resolves immediately at start
const CROWD_FULL  = 0.18;                 // normal crowd volume
const CROWD_DUCK  = 0.04;                 // volume while a card plays
const CARD_CAP    = 6000;                 // max ms to wait before unblocking (safety)

function _ctx() {
  if (!_actx) _actx = new (window.AudioContext || window.webkitAudioContext)();
  // browsers may suspend the context; resume it on any interaction
  if (_actx.state === 'suspended') _actx.resume();
  return _actx;
}

/* Load and cache a buffer; cb(buf) called immediately if cached. */
function _load(name, cb) {
  if (_bufs[name]) { cb(_bufs[name]); return; }
  fetch(SND_BASE + name + '.mp3')
    .then(r => r.arrayBuffer())
    .then(ab => _ctx().decodeAudioData(ab))
    .then(buf => { _bufs[name] = buf; cb(buf); })
    .catch(() => {});
}

/* Play a buffer once. Returns {src, gain} so callers can stop or ramp it. */
function _playBuf(buf, vol = 1.0, loop = false) {
  if (!buf) return null;
  try {
    const ctx = _ctx();
    const src = ctx.createBufferSource();
    const g   = ctx.createGain();
    src.buffer = buf; src.loop = loop;
    g.gain.value = _muted ? 0 : vol;
    src.connect(g); g.connect(ctx.destination);
    src.start();
    return { src, gain: g };
  } catch(e) { return null; }
}

/* ── mute / unmute ───────────────────────────────────────────────────────── */
function _applyMute() {
  const v = _muted ? 0 : 1;
  if (_crowdGain)  _crowdGain.gain.value  = _muted ? 0 : CROWD_FULL;
  if (_introNode)  _introNode.gain.gain.value = _muted ? 0 : 0.75;
}

/* ── procedural sounds ───────────────────────────────────────────────────── */
function _tone(ctx, freq, t, dur, vol, type = 'sine', slide = 0) {
  const osc = ctx.createOscillator(); const env = ctx.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, t + dur);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(vol, t + 0.01);
  env.gain.setValueAtTime(vol, t + dur - 0.05);
  env.gain.linearRampToValueAtTime(0, t + dur);
  osc.connect(env); env.connect(ctx.destination);
  osc.start(t); osc.stop(t + dur + 0.05);
}

function sndCoinSpin() {
  if (_muted) return;
  try {
    const ctx = _ctx(); const t = ctx.currentTime;
    for (let i = 0; i < 22; i++) {
      const d = Math.pow(i / 22, 1.6) * 1.7;
      _tone(ctx, 1200 + Math.random() * 400, t + d, 0.03, 0.06, 'square');
    }
  } catch(e) {}
}
function sndCoinConfirmed() {
  if (_muted) return;
  try {
    const ctx = _ctx(); const t = ctx.currentTime;
    _tone(ctx, 180, t, 0.2, 0.18, 'sine', -60);
    _tone(ctx, 90,  t + 0.1, 0.3, 0.12, 'sine');
  } catch(e) {}
}
function sndGoalThem() {
  if (_muted) return;
  try {
    const ctx = _ctx(); const t = ctx.currentTime;
    _tone(ctx, 220, t, 0.6, 0.12, 'sine', -120);
    _tone(ctx, 1800, t + 0.1, 0.4, 0.09, 'sine', -200);
  } catch(e) {}
}
function sndNoEffect() {
  if (_muted) return;
  try {
    const ctx = _ctx(); const t = ctx.currentTime;
    [220, 180].forEach((f, i) => _tone(ctx, f, t + i * 0.14, 0.12, 0.13, 'square'));
  } catch(e) {}
}

function sndCoinOverturned() { _load('var-cancel', buf => _playBuf(buf, 0.9)); }

/* ── goal sounds (tracks goals per team) ────────────────────────────────── */
let _goalScored = [0, 0];
function sndGoalUs(team) {
  const n = Math.min((_goalScored[team] || 0), 5);
  _load('goal-' + (n || 1), buf => _playBuf(buf, 1.0));
}

/* ── crowd loop with ducking ─────────────────────────────────────────────── */
function _startCrowd() {
  if (_crowdNode) return;
  _load('crowd-chant', buf => {
    if (!buf) return;
    try {
      const ctx = _ctx();
      const src = ctx.createBufferSource();
      const g   = ctx.createGain();
      src.buffer = buf; src.loop = true;
      g.gain.value = _muted ? 0 : CROWD_FULL;
      src.connect(g); g.connect(ctx.destination);
      src.start();
      _crowdNode = src; _crowdGain = g;
    } catch(e) {}
  });
}
function _stopCrowd() {
  if (_crowdNode) { try { _crowdNode.stop(); } catch(e) {} }
  _crowdNode = null; _crowdGain = null;
}
function _duckCrowd(low) {
  if (!_crowdGain || !_actx) return;
  const t = _actx.currentTime;
  _crowdGain.gain.cancelScheduledValues(t);
  _crowdGain.gain.setValueAtTime(_crowdGain.gain.value, t);
  _crowdGain.gain.linearRampToValueAtTime(_muted ? 0 : (low ? CROWD_DUCK : CROWD_FULL), t + 0.3);
}

/* ── intro (loops) ──────────────────────────────────────────────────────── */
function _startIntro() {
  if (_introNode) return;
  _load('intro', buf => {
    if (!buf) return;
    try {
      const ctx = _ctx();
      const src = ctx.createBufferSource();
      const g   = ctx.createGain();
      src.buffer = buf; src.loop = true;    // repeat until stopped
      g.gain.value = _muted ? 0 : 0.75;
      src.connect(g); g.connect(ctx.destination);
      src.start();
      _introNode = { src, gain: g };
    } catch(e) {}
  });
}
function _stopIntro() {
  if (_introNode) { try { _introNode.src.stop(); } catch(e) {} }
  _introNode = null;
}

/* ── card sounds: block input until clip ends (or CARD_CAP ms) ──────────── */
const CARD_SOUNDS = { PASS:'pass', DRIBBLE:'dribble', ASSIST:'assist', PENALTY:'penalty' };
let _cardUnblock = null;   // function to call to release the block early

function sndCard(face) {
  const file = CARD_SOUNDS[face];
  if (!file) return;
  // stop any card clip still playing
  if (_cardNode) { try { _cardNode.stop(); } catch(e) {} _cardNode = null; }
  if (_cardUnblock) { _cardUnblock(); _cardUnblock = null; }

  _load(file, buf => {
    if (!buf) return;
    _duckCrowd(true);   // duck crowd while card plays
    const node = _playBuf(buf, 0.85);
    if (!node) { _duckCrowd(false); return; }
    _cardNode = node.src;

    // _cardPending blocks renderHand; resolves when clip ends or cap expires
    _cardPending = new Promise(resolve => {
      const dur = Math.min(buf.duration * 1000, CARD_CAP);
      const timer = setTimeout(() => { resolve(); _duckCrowd(false); }, dur);
      _cardUnblock = () => { clearTimeout(timer); resolve(); _duckCrowd(false); };
      node.src.onended = () => { clearTimeout(timer); resolve(); _duckCrowd(false); };
    });
  });
}

/* ── preload everything on page load ──────────────────────────────────────
   Browsers block AudioContext creation until a user gesture, but we can
   start fetching and storing raw ArrayBuffers immediately. We decode them
   the moment the AudioContext becomes available (first gesture).           */
const _rawBufs = {};   // name -> ArrayBuffer, fetched before user gesture
function _preloadFetch() {
  const names = ['pass','dribble','assist','penalty',
                 'goal-1','goal-2','goal-3','goal-4','goal-5',
                 'var-cancel','crowd-chant','intro'];
  names.forEach(n => {
    fetch(SND_BASE + n + '.mp3')
      .then(r => r.arrayBuffer())
      .then(ab => { _rawBufs[n] = ab; })
      .catch(() => {});
  });
}

/* Decode all pre-fetched raw buffers now that we have an AudioContext. */
function _decodePreloaded() {
  const ctx = _ctx();
  Object.entries(_rawBufs).forEach(([name, ab]) => {
    if (_bufs[name]) return;
    ctx.decodeAudioData(ab.slice(0))
       .then(buf => { _bufs[name] = buf; })
       .catch(() => {});
  });
}

/* Called once on ANY user gesture to unlock audio and start the intro. */
let _audioUnlocked = false;
function _unlockAudio() {
  if (_audioUnlocked) return;
  _audioUnlocked = true;
  _decodePreloaded();
  _startIntro();
}


/* ---------------------------------------------------------------- animations

   showCoin(flip, call, label, sub)
     flip   — 'heads' | 'tails'  (the coin result)
     call   — player's pick, shown as context
     label  — headline when revealed  (e.g. 'اتلغى!' / 'اتأكد!')
     sub    — one-liner explanation

   showGoal(scorerName)
     Fires confetti and a shout word. Confetti launches upward and vanishes;
     flash whitens the screen for one frame; shout scales in then fades.       */

/* context: { overturnLabel, standLabel, subject }
     overturnLabel — what "heads" (overturned) means for this event, e.g. 'الهدف اتلغى'
     standLabel    — what "tails" (confirmed) means, e.g. 'الهدف صح'
     subject       — short name for the event, shown in the sub-line                   */
function showCoin(flip, label, sub, ctx) {
  const ov = $('coin-overlay');
  const coin = $('coin-el');
  const lb = $('coin-label');
  const sb = $('coin-sub');

  // set face labels from context
  if (ctx) {
    $('coin-heads-icon').textContent = '✓';
    $('coin-heads-txt').textContent  = ctx.overturnLabel;
    $('coin-tails-icon').textContent = '✗';
    $('coin-tails-txt').textContent  = ctx.standLabel;
  }

  // reset — detach animation so it can restart
  coin.style.animation = 'none';
  coin.offsetHeight;                        // force reflow
  lb.textContent = label;
  sb.textContent = sub || '';

  // orient coin so the correct face shows at the end
  // rotateY(1440deg) = 4 full turns → lands on heads (front face).
  // for tails (180° = back face) add 180.
  const endAngle = flip === 'tails' ? 1620 : 1440;
  coin.style.animation = `coin-spin 1.2s cubic-bezier(.4,0,.2,1) forwards`;
  // override the keyframe end via a custom property trick
  coin.style.setProperty('--end', endAngle + 'deg');
  // patch the animation dynamically: build inline @keyframes
  const styleId = 'coin-kf';
  let kf = document.getElementById(styleId);
  if (!kf) { kf = document.createElement('style'); kf.id = styleId; document.head.appendChild(kf); }
  kf.textContent = `@keyframes coin-spin{0%{transform:rotateY(0)}80%{transform:rotateY(${endAngle}deg)}100%{transform:rotateY(${endAngle}deg)}}`;

  ov.classList.remove('reveal');
  ov.classList.add('on');
  sndCoinSpin();

  // show the result label 1.4s in — give the spin time to land and settle
  const revealTimer = setTimeout(() => {
    ov.classList.add('reveal');
    if (flip === 'tails') sndCoinConfirmed(); else sndCoinOverturned();
  }, 1400);

  // auto-dismiss 3.5s after the result is revealed (5s total from open)
  // but the player can tap to dismiss early once the result is showing
  let dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(autoTimer);
    ov.classList.remove('on', 'reveal');
    ov.onclick = null;
  }
  const autoTimer = setTimeout(dismiss, 1400 + 3500);

  // tap anywhere on the overlay to dismiss — but only after the result shows
  ov.onclick = () => { if (ov.classList.contains('reveal')) dismiss(); };
}

/* showConceded — subtle dread instead of celebration */
function showConceded() {
  sndGoalThem();
  // dark red pulse that covers the board briefly
  const fl = document.createElement('div');
  fl.style.cssText = `position:fixed;inset:0;z-index:997;pointer-events:none;
    background:rgba(180,10,30,.28);animation:flash .6s ease-out forwards`;
  document.body.appendChild(fl);
  const sh = document.createElement('div');
  sh.className = 'goal-shout';
  sh.style.cssText = 'color:#e74c3c;font-size:clamp(38px,8vw,72px)';
  sh.textContent = 'هدف عليك';
  document.body.appendChild(sh);
  setTimeout(() => { fl.remove(); sh.remove(); }, 800);
}

/* showNoEffect — brief "miss" flash on the card played */
function showNoEffect() {
  sndNoEffect();
  // a small banner that slides up from the bottom of the hand area
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;bottom:220px;left:50%;transform:translateX(-50%);
    z-index:998;pointer-events:none;background:#2a1a1a;border:1px solid var(--attack);
    border-radius:10px;padding:8px 18px;font-family:'Rakkas',cursive;font-size:16px;
    color:var(--attack-glow);white-space:nowrap;
    animation:noeff .7s ease forwards`;
  el.textContent = 'مظبطتش ✗';
  if (!document.getElementById('noeff-kf')) {
    const st = document.createElement('style');
    st.id = 'noeff-kf';
    st.textContent = `@keyframes noeff{0%{opacity:0;transform:translateX(-50%) translateY(12px)}
      20%{opacity:1;transform:translateX(-50%) translateY(0)}
      70%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-8px)}}`;
    document.head.appendChild(st);
  }
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 750);
}

/* context labels for each reviewable event — what each coin face means */
const VAR_CONTEXT = {
  GOAL:    { overturnLabel: 'اتلغى', standLabel: 'هدف صح',   subject: 'مراجعة الهدف',    subjectFull: 'VAR — مراجعة الهدف' },
  PENALTY: { overturnLabel: 'اتلغى', standLabel: 'بنالتي صح', subject: 'مراجعة البنالتي', subjectFull: 'VAR — مراجعة البنالتي' },
  OFFSIDE: { overturnLabel: 'اتلغى', standLabel: 'تسلل صح',   subject: 'مراجعة التسلل',   subjectFull: 'VAR — مراجعة التسلل' },
  '':      { overturnLabel: 'اتلغى', standLabel: 'اتأكد',     subject: 'مراجعة VAR',      subjectFull: 'VAR' },
};

const GOAL_WORDS = ['جـــول','⚽','هدف','هدف هدف هدف'];
const CONFETTI_COLORS = [
  '#D7263D','#2ECC71','#F1C40F','#3498DB','#E67E22','#9B59B6','#1ABC9C',
];
function showGoal(scorerName, team) {
  sndGoalUs(team);
  // white flash
  const fl = document.createElement('div');
  fl.className = 'goal-flash';
  document.body.appendChild(fl);
  setTimeout(() => fl.remove(), 400);

  // shout
  const sh = document.createElement('div');
  sh.className = 'goal-shout';
  sh.textContent = GOAL_WORDS[Math.floor(Math.random() * GOAL_WORDS.length)];
  document.body.appendChild(sh);
  setTimeout(() => sh.remove(), 1000);

  // confetti — 60 pieces launching upward from across the bottom
  const layer = $('goal-overlay');
  layer.innerHTML = '';
  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    el.className = 'confetti';
    const x = (Math.random() * 110 - 5) + 'vw';
    const drift = (Math.random() * 40 - 20) + 'vw';
    const dur = (1.2 + Math.random() * 1.0) + 's';
    const delay = (Math.random() * 0.4) + 's';
    el.style.cssText = `left:0;bottom:-10px;--x:${x};--drift:${drift};--dur:${dur};--delay:${delay};background:${CONFETTI_COLORS[i%CONFETTI_COLORS.length]}`;
    layer.appendChild(el);
  }
  setTimeout(() => { layer.innerHTML = ''; }, 2200);
}

/* Watch foldEvents output for events that need animations. Called once per
   state.view, after foldEvents but before render(), so the overlay fires while the
   previous state is still visible, and render() updates the board on dismiss. */
let lastAnimEvent = 0;
function runAnimations(evs) {
  for (const e of evs) {
    if (!e || typeof e.id !== 'number' || e.id <= lastAnimEvent) continue;
    lastAnimEvent = e.id;
    if (e.kind === 'defense_played' && !e.stopped) {
      showNoEffect();
    }
  if (e.kind === 'attack_played') {
      sndCard(e.face);
    }
  if (e.kind === 'var') {
      const rev = e.reviewing || '';
      const ctx = VAR_CONTEXT[rev] || VAR_CONTEXT[''];
      const label = e.overturned ? ctx.overturnLabel : ctx.standLabel;
      const sub = ctx.subject;
      showCoin(e.flip, label, sub, ctx);
    }
    if (e.kind === 'goal') {
      const myTeam = state.view?.you % 2;
      const scorerTeam = state.view ? state.view.seats[e.scorer]?.team : -1;
      if (scorerTeam === myTeam) {
        _goalScored[scorerTeam] = (_goalScored[scorerTeam] || 0) + 1;
        showGoal('us', scorerTeam);
      } else {
        _goalScored[scorerTeam] = (_goalScored[scorerTeam] || 0) + 1;
        showConceded();
      }
    }
  }
}

export {
  _applyMute, _preloadFetch, _unlockAudio,
  _startCrowd, _stopCrowd, _startIntro, _stopIntro,
  sndCard, showCoin, showConceded, showNoEffect, showGoal,
  runAnimations, _cardPending, _muted,
  VAR_CONTEXT
};

export function resetGoalScored() { _goalScored = [0, 0]; }
export function toggleMute() { _muted = !_muted; return _muted; }
export function getCardPending() { return _cardPending; }
