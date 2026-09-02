#!/usr/bin/env python3
"""
Build a single-file PREVIEW of the table view — split cards, opponent card
backs, and animated card plays.

This is a design preview, not a shipped build. It plays a real bot match using
the real engine, so what you see is driven by real legal actions, but the UI is
separate from web/index.html. Look at it, then decide what moves into the game.

Inlines everything for the same reason build_offline.py does: ES modules are
refused on file://, so this opens by double-click with no server.

    python scripts/build_table_preview.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / 'web'
OUT = ROOT / 'owngoal-table-preview.html'


def strip_module(src: str) -> str:
    """Turn an ES module into a plain script body."""
    src = re.sub(r'^\s*import\s+.*?;\s*$', '', src, flags=re.M | re.S)
    src = re.sub(r'^\s*export\s+(const|class|function|let)\s', r'\1 ', src, flags=re.M)
    src = re.sub(r'^\s*export\s*\{[^}]*\}\s*;?\s*$', '', src, flags=re.M)
    return src


rules = strip_module((WEB / 'rules.js').read_text(encoding='utf-8'))
cards = strip_module((WEB / 'cards.js').read_text(encoding='utf-8'))
engine = strip_module((WEB / 'engine.js').read_text(encoding='utf-8'))

STYLE = '''
:root{
  --attack:#D7263D;--attack-glow:#FF6B35;
  --defense:#1B4F72;--defense-glow:#2ECC71;
  --special:#7D3C98;--special-glow:#F1C40F;
  --rare:#B8860B;--rare-glow:#F1C40F;
  --ink:#F0E6D3;--muted:#A89880;--line:#2C2C54;
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{background:#0d0d16;color:var(--ink);font-family:'Cairo',sans-serif;
  min-height:100vh;overflow-x:hidden}
button{font-family:inherit;cursor:pointer;border:none}
.wrap{max-width:520px;margin:0 auto;padding:10px 12px 0;
  display:flex;flex-direction:column;min-height:100vh}
.hide{display:none!important}

/* ---------- home ---------- */
.brand{font-family:'Rakkas',cursive;font-size:52px;text-align:center;
  line-height:1;color:var(--attack-glow);margin-top:34px}
.brand small{display:block;font-family:'Oswald',sans-serif;font-size:11px;
  letter-spacing:.5em;color:var(--muted);margin-top:6px}
.pickttl{font-size:13px;font-weight:700;color:var(--muted);text-align:center;
  margin-top:32px}
.modepick{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.mopt{background:#15151f;border:1px solid var(--line);border-radius:14px;
  padding:16px 12px;text-align:center;color:var(--ink);transition:.15s}
.mopt .t{font-family:'Rakkas',cursive;font-size:26px;line-height:1}
.mopt .d{font-size:10.5px;color:var(--muted);font-weight:700;margin-top:8px;
  line-height:1.6}
.mopt.on{border-color:var(--special-glow);background:#1b1226}
.mopt.on .t{color:var(--special-glow)}
.start{width:100%;margin-top:22px;background:var(--attack);color:#fff;
  border-radius:14px;padding:16px;font-family:'Rakkas',cursive;font-size:26px}
.homenote{font-size:10.5px;color:var(--muted);text-align:center;
  margin-top:16px;line-height:1.7}

/* ---------- header ---------- */
.hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.score{font-family:'Oswald',sans-serif;font-size:26px;letter-spacing:.06em}
.who{font-size:11px;color:var(--muted);font-weight:600}
.pill{font-size:11px;font-weight:700;padding:5px 10px;border-radius:20px;
  background:#15151f;border:1px solid var(--line);color:var(--muted)}
.pill.live{background:var(--defense-glow);color:#04220f;border-color:transparent}
.homebtn{background:none;color:var(--muted);font-size:10px;font-weight:700;
  margin-top:6px;text-decoration:underline}

/* ---------- opponent ---------- */
.oppzone{margin-top:12px;text-align:center}
.fan{display:flex;justify-content:center;align-items:flex-end;height:74px}
.back{width:50px;height:70px;border-radius:8px;flex:0 0 auto;
  background:repeating-linear-gradient(45deg,#1b1230 0 6px,#160f28 6px 12px);
  border:1px solid #33244a;margin-inline-start:-20px;position:relative;
  box-shadow:0 3px 10px #0007}
.back:first-child{margin-inline-start:0}
.back .crest{position:absolute;inset:0;display:flex;align-items:center;
  justify-content:center;font-family:'Rakkas',cursive;font-size:16px;
  color:#3d2b63}
.back.drawn{animation:dealin .32s ease-out}
@keyframes dealin{from{transform:translateY(-26px) scale(.86);opacity:0}
  to{transform:none;opacity:1}}

/* ---------- table ---------- */
.table{margin-top:12px;border-radius:16px;position:relative;
  background:radial-gradient(ellipse at 50% 40%,#123021 0%,#0c1f16 62%,#08150f 100%);
  border:1px solid #1c3a28;min-height:172px;overflow:hidden;padding:12px 0 78px}
.table::before{content:'';position:absolute;left:50%;top:0;bottom:0;width:1px;
  background:#ffffff14}

/* Every card played this match stays on the table, overlapping like a real
   pile. Only the last two are read in full — the rest are the history you can
   scroll back through. */
.hist{display:flex;align-items:center;overflow-x:auto;padding:4px 12px 6px;
  min-height:92px;position:relative;z-index:2;scroll-behavior:smooth}
.hist::-webkit-scrollbar{display:none}
.hcard{width:56px;height:80px;border-radius:8px;border:1px solid #232338;
  flex:0 0 auto;display:flex;flex-direction:column;align-items:center;
  justify-content:center;padding:5px 3px;text-align:center;position:relative}
.hcard.attack{background:linear-gradient(155deg,#2a0a0a,#0d0000)}
.hcard.defense{background:linear-gradient(155deg,#040e1a,#030b14)}
.hcard.special{background:linear-gradient(155deg,#130820,#070311)}
.hcard.rare{background:linear-gradient(155deg,#241705,#0d0700)}
.hcard .nm{font-family:'Rakkas',cursive;font-size:13px;line-height:1.05;
  margin-top:3px}
.hcard .en{font-family:'Oswald',sans-serif;font-size:6px;letter-spacing:.14em;
  color:var(--muted)}
.hcard.mine{box-shadow:0 0 0 1px var(--attack-glow)}
.hcard.theirs{box-shadow:0 0 0 1px var(--defense-glow)}
.hcard + .hcard{margin-inline-start:6px}
/* collapsed = older than the last two: only a sliver shows */
.hcard.old + .hcard.old,.hcard.old + .hcard{margin-inline-start:-40px}
.hcard.old{opacity:.72}
.hcard.old .nm,.hcard.old .en{display:none}
.hcard.old .edge{position:absolute;top:6px;bottom:6px;inset-inline-end:4px;
  width:2px;border-radius:2px;background:#ffffff33}
.hcard.fresh{animation:toTable .34s cubic-bezier(.22,1.2,.36,1) both}
.hcard.freshflip{animation:flipin .46s ease-out both}
@keyframes toTable{from{transform:translateY(80px) scale(.72) rotate(-7deg);
  opacity:0}to{transform:none;opacity:1}}
@keyframes flipin{0%{transform:translateY(-60px) rotateY(180deg) scale(.8);
  opacity:0}60%{opacity:1}100%{transform:none;opacity:1}}
.sep{flex:0 0 auto;width:1px;height:52px;background:#ffffff26;
  margin-inline-start:8px;align-self:center}
.tablehint{position:absolute;top:50%;left:0;right:0;text-align:center;
  font-size:10px;color:#5c7a68;font-weight:700;z-index:1}

/* ---------- deck + discard ---------- */
.deckpile,.discpile{position:absolute;bottom:10px;width:46px;height:64px;z-index:3}
.deckpile{inset-inline-end:12px}
.discpile{inset-inline-start:12px}
.stk{position:absolute;inset:0;border-radius:7px;border:1px solid #33244a;
  background:repeating-linear-gradient(45deg,#1b1230 0 5px,#160f28 5px 10px)}
.stk:nth-child(2){transform:translate(2px,-2px)}
.stk:nth-child(3){transform:translate(4px,-4px)}
.cnt{position:absolute;inset:0;display:flex;flex-direction:column;
  align-items:center;justify-content:center;z-index:4;pointer-events:none}
.cnt b{font-family:'Oswald',sans-serif;font-size:17px;color:var(--ink)}
.cnt span{font-size:8px;color:var(--muted);font-weight:700;margin-top:1px}
.deckpile.can{cursor:pointer}
.deckpile.can .stk:nth-child(3){box-shadow:0 0 0 1.5px var(--special-glow)}
.deckpile.can::after{content:'اسحب';position:absolute;top:-17px;left:0;right:0;
  text-align:center;font-size:10px;font-weight:900;color:var(--special-glow);
  animation:puls 1s ease-in-out infinite}
@keyframes puls{50%{opacity:.45}}
.discpile .stk{background:repeating-linear-gradient(45deg,#241206 0 5px,#1b0d04 5px 10px);
  border-color:#4a2a12}
.drawpick{position:absolute;bottom:80px;inset-inline-end:6px;display:flex;
  gap:4px;z-index:6}
.drawpick button{background:#15151f;border:1px solid var(--special-glow);
  color:var(--ink);border-radius:7px;padding:6px 9px;font-size:12px;
  font-weight:700}
.flyer{position:absolute;bottom:10px;inset-inline-end:12px;width:46px;
  height:64px;border-radius:7px;z-index:7;border:1px solid #33244a;
  pointer-events:none;
  background:repeating-linear-gradient(45deg,#1b1230 0 5px,#160f28 5px 10px);
  animation:fly .5s cubic-bezier(.4,0,.6,1) forwards}
@keyframes fly{0%{opacity:1}
  100%{transform:translate(90px,170px) rotate(12deg) scale(.82);opacity:0}}

.prompt{margin-top:10px;border-radius:12px;padding:10px 12px;text-align:center;
  background:#1a1226;border:1px solid #33244a;font-weight:700;font-size:14px}
.prompt.mine{background:#1d0f10;border-color:#4a2226}
.prompt small{display:block;color:var(--muted);font-size:11px;margin-top:3px}

/* ---------- hand ---------- */
.hand{display:flex;gap:8px;overflow-x:auto;padding:12px 4px 16px}
.hand::-webkit-scrollbar{display:none}
.pc{flex:0 0 112px;height:168px;border-radius:10px;position:relative;
  border:1px solid #232338;overflow:hidden;transition:.16s;
  display:flex;flex-direction:column;background:#0b0b12}
.pc.dead{opacity:.34;filter:grayscale(.65)}
.pc.playing{animation:launch .3s ease-in forwards}
@keyframes launch{to{transform:translateY(-150px) scale(.66);opacity:0}}
/* a card that has been dealt but not yet pulled off the deck */
.pc.facedown{background:repeating-linear-gradient(45deg,#1b1230 0 7px,#160f28 7px 14px);
  align-items:center;justify-content:center}
.pc.facedown .half{display:none}
.pc.facedown::after{content:'مستني السحب';position:absolute;inset:0;
  display:flex;align-items:center;justify-content:center;
  font-family:'Rakkas',cursive;font-size:15px;color:#5b4488;text-align:center;
  padding:0 10px}
.half{flex:1;display:flex;flex-direction:column;align-items:center;
  justify-content:center;padding:6px 5px;text-align:center;position:relative;
  min-height:0}
.half.attack{background:linear-gradient(155deg,#2a0a0a,#0d0000)}
.half.defense{background:linear-gradient(155deg,#040e1a,#030b14)}
.half.special{background:linear-gradient(155deg,#130820,#070311)}
.half.rare{background:linear-gradient(155deg,#241705,#0d0700)}
.half + .half{border-top:1px dashed #ffffff2e}
.half .en{font-family:'Oswald',sans-serif;font-size:6.5px;letter-spacing:.15em;
  color:var(--muted)}
.half .ar{font-family:'Rakkas',cursive;font-size:17px;line-height:1.05}
.half .ico{margin-top:1px}
.half.off{opacity:.3;filter:grayscale(.7)}
.half.on{box-shadow:inset 0 0 0 1px var(--defense-glow)}
.half.on::after{content:'▲';position:absolute;bottom:2px;left:50%;
  transform:translateX(-50%);font-size:7px;color:var(--defense-glow)}
.pc.full .half .ar{font-size:21px}
.pc.full .half .ln{font-size:8.5px;font-weight:700;line-height:1.35;
  margin-top:4px;padding:0 2px}
.splitmark{position:absolute;top:50%;inset-inline-start:3px;
  transform:translateY(-50%);font-size:7px;color:#ffffff4d;font-weight:900;
  letter-spacing:.1em;writing-mode:vertical-rl}
.legend{font-size:10.5px;color:var(--muted);text-align:center;
  padding:0 4px 14px;line-height:1.7}
.legend b{color:var(--ink)}
.over{text-align:center;padding:18px 12px}
.over .big{font-family:'Rakkas',cursive;font-size:34px}
'''

BODY = '''
<div class="wrap">

  <div id="home">
    <div class="brand">أون جول<small>OWN GOAL</small></div>
    <div class="pickttl">اختار المود قبل ما تبدأ</div>
    <div class="modepick">
      <button class="mopt on" data-mode="LUCK">
        <div class="t">حظ</div>
        <div class="d">تسحب كارت واحد<br>وتلعب على طول</div>
      </button>
      <button class="mopt" data-mode="STRATEGY">
        <div class="t">تكتيك</div>
        <div class="d">تسحب ١ لـ ٣<br>وتبني سلسلة</div>
      </button>
    </div>
    <button class="start" id="startbtn">يلا نلعب</button>
    <div class="homenote">
      في المودين الاتنين بتسحب بإيدك من الديك اللي على الطرابيزة.<br>
      الفرق إن التكتيك بيخليك تختار تسحب كام.
    </div>
  </div>

  <div id="game" class="hide">
    <div class="hdr">
      <div><div class="score" id="score">0 — 0</div>
        <div class="who" id="names">—</div></div>
      <div style="text-align:left">
        <span class="pill" id="turnpill">—</span>
        <button class="homebtn" id="homebtn">رجوع للمود</button>
      </div>
    </div>

    <div class="oppzone">
      <div class="fan" id="fan"></div>
      <div class="who" id="oppname" style="margin-top:5px">—</div>
    </div>

    <div class="table" id="table">
      <div class="hist" id="hist"></div>
      <div class="tablehint" id="tablehint">الطرابيزة فاضية</div>
      <div class="discpile">
        <div class="stk"></div><div class="stk"></div><div class="stk"></div>
        <div class="cnt"><b id="discard">0</b><span>حرق</span></div>
      </div>
      <div class="deckpile" id="deckpile">
        <div class="stk"></div><div class="stk"></div><div class="stk"></div>
        <div class="cnt"><b id="deckleft">0</b><span>ديك</span></div>
      </div>
      <div class="drawpick hide" id="drawpick"></div>
    </div>

    <div class="prompt" id="prompt">—</div>
    <div class="hand" id="hand"></div>
    <div class="legend">
      الكارت المقسوم بيبان بنصينه — <b>فوق هجوم</b> وتحت <b>دفاع</b>.
      النص اللي ينفع تلعبه بيلمع.<br>
      كل الكروت اللي اتلعبت بتفضل على الطرابيزة — <b>آخر كارتين</b> باينين
      بالتفصيل والباقي مرصوص وراهم.
    </div>
    <div class="over hide" id="over"></div>
  </div>
</div>
'''

UI = '''
const $ = id => document.getElementById(id);
const AR = f => (CARDS[f]?.ar) || f;
const KIND = f => (CARDS[f]?.kind) || 'special';
const icon = (face, px) => `<svg width="${px}" height="${px}" viewBox="0 0 40 44"
  fill="none" stroke="${GLOW[KIND(face)] || '#fff'}" stroke-width="2.6"
  stroke-linecap="round" stroke-linejoin="round">${ICONS[face] || ''}</svg>`;

const ME = 0;
let mode = 'LUCK';
let game = null;
let view = null;
let busy = false;

const BEAT = 1100;            // pause between bot actions
const TURNOVER_BEAT = 2000;   // longer pause when the ball changes hands

/* Every card played this match, in order. The engine clears its chain when a
   possession ends, so the table history is kept here instead. */
let log = [];
let drawn = 0;          // how many history entries have already animated
let pendingSep = false; // a possession just ended; divide before the next card

/* LUCK deals the card itself, so the pull is a UI gate: the new card sits
   face-down and unplayable until the deck is tapped. No rules change — LUCK
   never offered a choice about how many to draw. */
let prevHand = [];
let facedown = [];

function refresh(actor) {
  const before = (view?.chain || []).length;
  view = game.view(ME);
  view.legal = game.legalActions(ME).map(a => ({...a}));

  /* The engine empties its chain when a possession resolves. Rather than lose
     those cards, note the boundary and go on appending — the divider is only
     inserted once the NEXT card arrives, so the strip never ends on one. */
  const chain = view.chain || [];
  const faceOf = c => (typeof c === 'string' ? c : (c.face || c));

  if (chain.length < before) pendingSep = true;

  const from = chain.length < before ? 0 : before;
  for (let i = from; i < chain.length; i++) {
    if (pendingSep) { log.push({sep: true}); pendingSep = false; }
    log.push({face: faceOf(chain[i]), seat: actor});
  }

  const ids = view.hand.map(c => c.id);
  if (mode === 'LUCK' && prevHand.length) {
    const fresh = ids.filter(id => !prevHand.includes(id));
    if (fresh.length && view.legal.length) facedown = fresh;
  }
  prevHand = ids;
  render();
}

function renderFan() {
  const opp = view.seats.find(s => s.index !== ME) || {cards: 0, name: '—'};
  const fan = $('fan');
  const want = opp.cards;
  while (fan.children.length > want) fan.lastChild.remove();
  for (let i = fan.children.length; i < want; i++) {
    const b = document.createElement('div');
    b.className = 'back drawn';
    b.innerHTML = '<div class="crest">ج</div>';
    fan.appendChild(b);
  }
  $('oppname').textContent = `${opp.name} — ${want} كروت في إيده`;
}

/* The whole history is drawn every time. Only the final two are legible; the
   rest collapse into an overlapping pile you can scroll. */
function renderTable() {
  const box = $('hist');
  box.innerHTML = '';
  const cards = log.filter(e => !e.sep);
  const cut = cards.length - 2;
  let seen = 0;

  log.forEach(e => {
    if (e.sep) {
      const s = document.createElement('div');
      s.className = 'sep';
      box.appendChild(s);
      return;
    }
    const idx = seen++;
    const old = idx < cut;
    const byMe = e.seat === ME;
    const el = document.createElement('div');
    el.className = `hcard ${KIND(e.face)} ${byMe ? 'mine' : 'theirs'}` +
      (old ? ' old' : '') +
      (idx >= drawn ? (byMe ? ' fresh' : ' freshflip') : '');
    el.innerHTML = old
      ? `<div class="edge"></div>${icon(e.face, 16)}`
      : `<div class="en">${(CARDS[e.face]?.en) || e.face}</div>
         <div>${icon(e.face, 20)}</div><div class="nm">${AR(e.face)}</div>`;
    box.appendChild(el);
  });

  drawn = cards.length;
  $('tablehint').classList.toggle('hide', cards.length > 0);
  box.scrollLeft = box.scrollWidth;
}

function renderDeck() {
  const pile = $('deckpile');
  const pick = $('drawpick');
  const draws = view.legal.filter(a => a.type === 'draw');
  pick.innerHTML = '';
  pick.classList.add('hide');
  pile.onclick = null;

  // LUCK: the deck is tappable to collect the card already dealt.
  if (facedown.length) {
    pile.className = 'deckpile can';
    pile.onclick = () => pullDealt();
    return;
  }
  pile.className = 'deckpile' + (draws.length ? ' can' : '');
  if (!draws.length) return;
  if (draws.length === 1) { pile.onclick = () => drawFrom(draws[0]); return; }
  pile.onclick = () => pick.classList.toggle('hide');
  draws.forEach(a => {
    const b = document.createElement('button');
    b.textContent = a.n;
    b.onclick = ev => { ev.stopPropagation(); pick.classList.add('hide');
                        drawFrom(a); };
    pick.appendChild(b);
  });
}

function flyCard(i) {
  const f = document.createElement('div');
  f.className = 'flyer';
  f.style.animationDelay = `${i * 110}ms`;
  $('table').appendChild(f);
  setTimeout(() => f.remove(), 760 + i * 110);
}

/* LUCK only: reveal the already-dealt card. Nothing is applied. */
function pullDealt() {
  if (busy) return;
  busy = true;
  const n = facedown.length;
  for (let i = 0; i < n; i++) flyCard(i);
  setTimeout(() => { facedown = []; busy = false; render(); },
             320 + (n - 1) * 110);
}

/* STRATEGY: a real draw action. */
function drawFrom(action) {
  if (busy) return;
  busy = true;
  const n = action.n || 1;
  for (let i = 0; i < n; i++) flyCard(i);
  setTimeout(() => {
    try { game.apply(ME, action); } catch (e) { console.warn(e.message); }
    facedown = [];
    refresh(ME);
    busy = false;
    setTimeout(botTurn, BEAT);
  }, 340 + (n - 1) * 110);
}

function renderHand() {
  const box = $('hand');
  box.innerHTML = '';
  const gated = facedown.length > 0;

  view.hand.forEach(c => {
    const acts = gated ? [] : view.legal.filter(a => a.card_id === c.id);
    const playable = new Set(acts.map(a => a.face));
    const isSplit = c.kind === 'split' && c.faces.length > 1;
    const down = facedown.includes(c.id);

    const el = document.createElement('div');
    el.className = 'pc' + (isSplit ? '' : ' full') +
      (acts.length ? '' : ' dead') + (down ? ' facedown' : '');
    if (isSplit && !down) el.innerHTML = '<span class="splitmark">SPLIT</span>';

    c.faces.forEach(face => {
      const d = CARDS[face] || {ar: face, en: face, line: ''};
      const half = document.createElement('div');
      const usable = playable.has(face);
      half.className = `half ${KIND(face)} ${usable ? 'on' : 'off'}`;
      half.innerHTML = `<div class="en">${d.en}</div>
        <div class="ar">${d.ar}</div>
        <div class="ico">${icon(face, isSplit ? 20 : 30)}</div>` +
        (isSplit ? '' : `<div class="ln">${d.line || ''}</div>`);
      if (usable) {
        half.onclick = ev => {
          ev.stopPropagation();
          const act = acts.find(a => a.face === face);
          if (act) play(el, act);
        };
      }
      el.appendChild(half);
    });
    box.appendChild(el);
  });

  if (gated) return;
  view.legal.filter(a => ['pass', 'concede_possession'].includes(a.type))
    .forEach(a => {
      const b = document.createElement('div');
      b.className = 'pc full';
      b.innerHTML = `<div class="half special"><div class="en">SKIP</div>
        <div class="ar">${a.type === 'pass' ? 'سيبها' : 'سلّم الكورة'}</div>
        <div class="ico">${icon('CHAIN', 26)}</div></div>`;
      b.onclick = () => play(b, a);
      box.appendChild(b);
    });
}

function play(el, action) {
  if (busy) return;
  busy = true;
  el.classList.add('playing');
  setTimeout(() => {
    const {counters, ...clean} = action;
    try { game.apply(ME, clean); } catch (e) { console.warn(e.message); }
    refresh(ME);
    busy = false;
    setTimeout(botTurn, BEAT);
  }, 250);
}

function botTurn() {
  if (game.over) return;
  const actor = game.seats.map(s => s.index)
    .find(i => game.legalActions(i).length);
  if (actor === undefined || actor === ME) return;
  const a = botAction(game, actor);
  if (!a) return;
  const before = game.log.length;
  game.apply(actor, a);
  const fresh = game.log.slice(before);
  refresh(actor);
  // a turnover needs a longer beat: two cards, two different possessions
  const turnover = fresh.some(e =>
    (e.kind === 'defense_played' && e.stopped) ||
    e.kind === 'counter_attack' || e.kind === 'goal');
  setTimeout(botTurn, turnover ? TURNOVER_BEAT : BEAT);
}

const PHASE = {
  attack_draw: ['اسحب من الديك', 'وتلعب نفس العدد بالظبط'],
  attack: ['دورك تهجم', 'الشوطة لازم تكون آخر كارت'],
  defense_draw: ['اسحب من الديك للدفاع', 'أول كارت يكسر الاستحواذ'],
  defense: ['رد على الهجمة', 'لازم تلعب كارت حتى لو مالكش رد'],
  react_own_goal: ['الشوطة عدّت! معاك Own Goal', 'تلعبه؟'],
  react_var: ['اتسجل هدف — معاك VAR', 'اختار وش أو ضهر'],
};

function render() {
  $('score').textContent = `${view.score[0]} — ${view.score[1]}`;
  $('names').textContent = view.seats.map(s => s.name).join('  ·  ');
  $('deckleft').textContent = view.deck_left;
  $('discard').textContent = view.discard;
  const mine = view.legal.length > 0;
  $('turnpill').textContent = facedown.length ? 'اسحب' : (mine ? 'دورك' : 'دور الخصم');
  $('turnpill').className = 'pill' + (mine ? ' live' : '');
  const p = facedown.length
    ? ['دوس على الديك', 'الكارت في إيدك بس لسه مقلوب']
    : (PHASE[view.phase] || ['—', '']);
  $('prompt').className = 'prompt' + (mine ? ' mine' : '');
  $('prompt').innerHTML = `${p[0]}<small>${p[1]}</small>`;

  renderFan();
  renderTable();
  renderDeck();
  renderHand();

  if (view.over) {
    $('over').classList.remove('hide');
    $('over').innerHTML = `<div class="big">${
      view.winner === ME ? 'كسبت!' : 'خسرت'}</div>`;
  }
}

function startMatch() {
  game = new Game({mode, matchType: 'ONE_V_ONE', names: ['انت', 'الخصم']});
  log = []; drawn = 0; prevHand = []; facedown = []; busy = false;
  pendingSep = false;
  $('over').classList.add('hide');
  $('fan').innerHTML = '';
  $('home').classList.add('hide');
  $('game').classList.remove('hide');
  view = game.view(ME);
  view.legal = game.legalActions(ME).map(a => ({...a}));
  prevHand = view.hand.map(c => c.id);
  render();
  if (!view.legal.length) setTimeout(botTurn, 600);
}

document.querySelectorAll('[data-mode]').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('[data-mode]').forEach(x =>
      x.classList.remove('on'));
    b.classList.add('on');
    mode = b.dataset.mode;
  };
});
$('startbtn').onclick = startMatch;
$('homebtn').onclick = () => {
  $('game').classList.add('hide');
  $('home').classList.remove('hide');
};
'''

html = f'''<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>أون جول — معاينة الطرابيزة</title>
<link href="https://fonts.googleapis.com/css2?family=Rakkas&family=Cairo:wght@400;600;700;900&family=Oswald:wght@400;600&display=swap" rel="stylesheet">
<style>{STYLE}</style>
</head>
<body>
{BODY}
<script>
{rules}
{cards}
{engine}
{UI}
</script>
</body>
</html>
'''

OUT.write_text(html, encoding='utf-8')
kb = len(html.encode('utf-8')) // 1024
print(f'wrote {OUT.name} ({kb} KB, single file, opens by double-click)')
