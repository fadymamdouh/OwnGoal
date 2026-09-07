/* ui-game.js — game rendering functions.
 *
 * Contains: renderBoard, renderFeed, commLine, renderFan,
 *           renderTable, flyCard, renderDeck, submitDraw,
 *           pullDealt, renderPicker, confirmPicks,
 *           showWhyNot, whyDead, renderHand, submit. */
import {CARDS, ICONS, FAMILY, GLOW} from '../cards.js';
import {$, AR, KIND, KEY_EVENTS, state, render} from './ui-render.js';
import {VAR_CONTEXT} from './ui-animations.js';

const icon = (face, px) => `<svg width="${px}" height="${px}" viewBox="0 0 40 44" fill="none"
  stroke="${GLOW[KIND(face)] || '#fff'}" stroke-width="2.6" stroke-linecap="round"
  stroke-linejoin="round">${ICONS[face] || ''}</svg>`;

/* Show a brief explanation when a dead card is tapped. */
// Cache the logo src at init so the card-back is available during the match
const LOGO_SRC = (() => {
  const img = document.querySelector('.brand-logo');
  return img ? img.src : null;
})();

let _whyTimer = null;
function showWhyNot(msg) {
  const t = document.getElementById('why-toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  if (_whyTimer) clearTimeout(_whyTimer);
  _whyTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

function whyDead(face, v) {
  const phase = v.phase;
  const myTurn = v.you === v.possession;
  const defending = phase === 'defense' && v.you === v.defender;
  if (face === 'END_MATCH') {
    if (defending) return 'نهاية الماتش — في دورك هجوم بس';
    if (!myTurn)   return 'مش دورك دلوقتي';
    return 'مش وقتها دلوقتي';
  }
  if (face === 'PENALTY') {
    if (!(v.seats[v.you] || {}).fouled) return 'البنالتي — لازم يلعبوا فاول عليك الأول';
    return 'مش وقتها دلوقتي';
  }
  if (face === 'GOAL') return 'الجول — لازم زميلك يلعب أسيست الأول';
  if (CARDS[face]?.class === 'attack' && defending) return 'ده كارت هجوم — إنت بتدافع دلوقتي';
  if (CARDS[face]?.class === 'defense' && myTurn && !defending) return 'ده كارت دفاع — العب كارت هجوم';
  if (!myTurn && !defending) return 'مش دورك دلوقتي';
  return 'مش ينفع تلعبه دلوقتي';
}

function renderHand() {
  const v = state.view, box = $('hand');
  box.innerHTML = '';

  /* Reshuffle: the whole hand becomes a chooser. `pick` actions carry no face,
     so they cannot go through the normal card path at all. */
  const pickActs = v.legal.filter(a => a.type === 'pick');
  if (pickActs.length) { renderPicker(pickActs, box); return; }
  $('pickbar').classList.add('hide');
  const gated = state.facedown.length > 0;

  v.hand.forEach(c => {
    const acts = gated ? [] : v.legal.filter(a => a.card_id === c.id);
    const isSplit = c.kind === 'split' && c.faces.length > 1;

    const el = document.createElement('div');
    el.className = 'card ' + (isSplit ? 'split' : KIND(acts[0]?.face || c.faces[0]))
      + (acts.length ? '' : ' dead')
      + (state.facedown.includes(c.id) ? ' state.facedown' : '');
    if (acts.some(a => a.counters)) {
      const t = document.createElement('span');
      t.className = 'tick';
      t.textContent = '✓ رد صح';
      el.appendChild(t);
    }

    if (isSplit) {
      const mark = document.createElement('span');
      mark.className = 'splitmark';
      mark.textContent = 'SPLIT';
      el.appendChild(mark);
    }

    // A split card renders BOTH halves; a full card renders its single face.
    (isSplit ? c.faces : [acts[0]?.face || c.faces[0]]).forEach(face => {
      const kind = KIND(face);
      const d = CARDS[face] || {ar: face, en: face, line: ''};
      const faceActs = acts.filter(a => a.face === face);
      const half = document.createElement('div');
      half.className = `half ${kind} ` + (faceActs.length ? 'on' : 'off');
      half.innerHTML = `<div class="en">${d.en}</div>
        <div class="ar">${d.ar}</div>
        <div class="ico">${icon(face, isSplit ? 22 : 34)}</div>` +
        (isSplit ? '' : `<div class="ln">${d.line || ''}</div>
         <div class="bar" style="background:${FAMILY[kind]}"></div>`);

      if (faceActs.length) {
        const key = `${c.id}:${face}`;
        half.onclick = ev => {
          ev.stopPropagation();
          // One action: play it. Several (VAR's heads/tails): ask which.
          if (faceActs.length === 1) return submit(faceActs[0]);
          state.picked = state.picked === key ? null : key;
          renderHand();
        };
        if (state.picked === key) {
          el.classList.add('pick');
          const dual = document.createElement('div');
          dual.className = 'dual';
          faceActs.forEach(a => {
            const b = document.createElement('button');
            b.textContent = a.swap ? (a.swap === 'deck' ? 'من الديك' : 'مع زميلك')
              : AR(a.face);
            b.onclick = ev => { ev.stopPropagation(); submit(a); };
            dual.appendChild(b);
          });
          half.appendChild(dual);
        }
      }
      if (!faceActs.length) {
        // dead half — still tappable; explain why
        half.onclick = ev => {
          ev.stopPropagation();
          showWhyNot(whyDead(face, v));
          el.style.animation = 'none';
          el.offsetHeight;
          el.style.animation = '';
        };
      }
      el.appendChild(half);
    });

    box.appendChild(el);
  });

  if (gated) return;
  v.legal.filter(a => ['pass','concede_possession'].includes(a.type)).forEach(a => {
    const b = document.createElement('div');
    b.className = 'card special';
    b.innerHTML = `<div class="en">SKIP</div>
      <div class="ar">${a.type === 'pass' ? 'سيبها' : 'سلّم الكورة'}</div>
      <div class="ico">${icon('CHAIN', 30)}</div>
      <div class="ln">${a.type === 'pass' ? 'متلعبش الكارت' : 'مفيش كارت هجومي'}</div>
      <div class="bar" style="background:var(--special)"></div>`;
    b.onclick = () => submit(a);
    box.appendChild(b);
  });
}

function submit(a) {
  state.picked = null;
  const {counters, ...action} = a;
  state.room.submit(action);
}

/* Scoreboard. Your team is always the home block on the right, so the score
   reads the same way round every match. Scorers are listed under each side with
   the card count at which they scored. */
function renderBoard() {
  const v = state.view;
  const mine = v.you % 2;
  const other = 1 - mine;
  const nameOf = team => v.seats.filter(s => s.team === team)
    .map(s => s.name).join(' · ') || (team === 0 ? 'فريق 1' : 'فريق 2');

  $('nameA').textContent = nameOf(mine);
  $('nameB').textContent = nameOf(other);
  $('crestA').textContent = (nameOf(mine)[0] || 'A');
  $('crestB').textContent = (nameOf(other)[0] || 'B');
  $('score').textContent = `${v.score[mine]} — ${v.score[other]}`;
  $('deckinfo').textContent = `الهدف ${v.goals_to_win} · الديك ${v.deck_left}`;

  const goals = {[mine]: [], [other]: []};
  for (const e of state.feed) {
    if (e.kind !== 'goal') continue;
    const seat = v.seats[e.scorer];
    if (!seat) continue;
    goals[seat.team].push(
      `<b>${seat.name}</b> ${e.no || ''}${e.face === 'OWN_GOAL' ? ' (OG)' : ''}`);
  }
  $('scorersA').innerHTML = goals[mine].join('<br>');
  $('scorersB').innerHTML = goals[other].join('<br>');

  // sync the mobile board copy (same content, no IDs — just innerHTML mirror)
  const mb = document.getElementById('board-mobile');
  if (mb) mb.innerHTML = document.querySelector('.gside .board').innerHTML;

  // side panel — fills the desktop right column, sits under the hand on mobile
  $('imode').textContent = v.mode === 'STRATEGY' ? 'تكتيك' : 'حظ';
  $('ifmt').textContent = v.match_type === 'TWO_V_TWO' ? '2 ضد 2' : '1 ضد 1';
  $('igoal').textContent = `${v.goals_to_win} أهداف`;
}

function renderFeed() {
  const box = $('feed');
  const keyOnly = $('keyonly').checked;
  const rows = state.feed.filter(e => !keyOnly || e.kind === 'gap' || KEY_EVENTS.has(e.kind));
  box.innerHTML = '';
  if (!rows.length) {
    box.innerHTML = '<div class="evgap">لسه مفيش حاجة</div>';
    return;
  }
  for (const e of rows.slice().reverse()) {
    if (e.kind === 'gap') {
      const g = document.createElement('div');
      g.className = 'evgap';
      g.textContent = '· · ·';
      g.title = 'حاجات حصلت وانت مش متصل';
      box.appendChild(g);
      continue;
    }
    const line = commLine(e);
    if (!line) continue;
    const row = document.createElement('div');
    row.className = 'ev' + (KEY_EVENTS.has(e.kind) ? ' key' : '');
    row.innerHTML = `<div class="evno">${e.no || ''}</div><div class="evbody">${line}</div>`;
    box.appendChild(row);
  }
}

function commLine(e) {
  const n = s => (state.view.seats[s] || {}).name || '';
  const ttl = t => `<div class="evttl">${t}</div>`;
  const txt = t => `<div class="evtxt">${t}</div>`;
  const swap = (out, inn) =>
    `<div class="swap">
       <div class="swrow out"><span class="ar">◀</span><span class="who2">${out}</span></div>
       <div class="swrow in"><span class="ar">▶</span><span class="who2">${inn}</span></div>
     </div>`;

  switch (e.kind) {
    case 'attack_played':
      return txt(`<b>${n(e.seat)}</b> لعب ${AR(e.face)}.`);

    case 'defense_played':
      return e.stopped
        ? ttl('الهجمة وقفت') + txt(`<b>${n(e.seat)}</b> رد بـ ${AR(e.face)} وقطع الهجمة.`)
        : txt(`<b>${n(e.seat)}</b> حاول بـ ${AR(e.face)} — مظبطتش.`);

    case 'stage_passed':
      return txt(`${AR(e.face)} عدّت، الهجمة كمّلت.`);

    case 'goal':
      return ttl('جـــول') +
        txt(`<b>${n(e.scorer)}</b> سجل بـ ${AR(e.face)}. النتيجة ${e.score[0]} — ${e.score[1]}.`);

    case 'own_goal_played':
      return ttl('أون جول') +
        txt(`<b>${n(e.seat)}</b> لعب أون جول وقلب الشوطة لصالحه.`);

    case 'var': {
      const vc = VAR_CONTEXT[e.reviewing || ''] || VAR_CONTEXT[''];
      return ttl('مراجعة VAR') +
        txt(`<b>${n(e.seat)}</b> طلب مراجعة ${vc.subject.replace('مراجعة ','')} — ` +
            (e.overturned
              ? `القرار اتلغى. <b>${vc.overturnLabel}</b>`
              : `القرار اتأكد. <b>${vc.standLabel}</b>`));
    }

    case 'goal_overturned':
      return ttl('الهدف اتلغى') + txt(`المراجعة لغت هدف <b>${n(e.scorer)}</b>.`);

    case 'counter_attack':
      return ttl('هجمة مرتدة') +
        txt(`<b>${n(e.seat)}</b> كسب الكورة وطلع بـ ${e.cards} ` +
            `${e.cards === 1 ? 'كارت' : 'كروت'} على طول.`) +
        swap(`الاستحواذ سابق`, `${n(e.seat)} بيهجم`);

    case 'possession_conceded':
      /* The event carries only {seat} — the side that gave the ball up. The
         engine has already moved possession by the time this state.view arrives, so
         the receiver is read from the state.view instead of an invented field. */
      return ttl('الاستحواذ اتسلّم') +
        txt(`<b>${n(e.seat)}</b> مالوش كارت هجومي يلعبه.`) +
        swap(n(e.seat), n(state.view.possession));

    case 'leftover_burned':
      return txt(`كروت <b>${n(e.seat)}</b> الفاضلة اتحرقت.`);

    case 'reshuffled':
      return e.swap === 'partner'
        ? ttl('تبديل مع الزميل') +
          txt(`<b>${n(e.seat)}</b> و<b>${n(e.partner)}</b> بدّلوا ${e.n} كروت، ` +
              'كل واحد اختار من إيده.')
        : txt(`<b>${n(e.seat)}</b> بدّل ${e.n || 2} كروت من الديك.`);

    case 'offside_overturned':
      return ttl('التسلل اتلغى') +
        txt(`<b>${n(e.seat)}</b> طعن بالـ VAR — التسلل مرفوض، الهجمة كملت.`);

    case 'reshuffle_opened':
      return txt(`<b>${n(e.seat)}</b> لعب ريشافل — ` +
                 (e.swap === 'partner' ? 'تبديل مع الزميل.' : 'تبديل من الديك.'));

    case 'reshuffle_picked':
    case 'reshuffle_turn':
      return null;   // mid-selection noise, not worth a commentary line

    case 'deck_recycled':
      return txt('الديك خلص — الحرق اتخلط ورجع ديك.');

    case 'match_over':
      return ttl('نهاية الماتش') +
        txt(`النتيجة النهائية ${e.score[0]} — ${e.score[1]}` +
            (e.reason === 'end_match' ? ' بكارت نهاية الماتش.' : '.'));

    default:
      return null;
  }
}

/* Opponents and team-mates as face-down fans. Counts come from v.seats, which
   carries hand SIZE and never contents — that is the privacy model. */
function renderFan() {
  const v = state.view, box = $('fan');
  const others = v.seats.filter(s => s.index !== v.you);
  const key = others.map(s => `${s.index}:${s.cards}`).join(',');
  if (box.dataset.key !== key) {
    box.innerHTML = '';
    others.forEach(s => {
      const mate = s.team === v.seats[v.you].team;
      const wrap = document.createElement('div');
      wrap.className = 'seatfan' + (mate ? ' mate' : '');
      for (let i = 0; i < s.cards; i++) {
        const b = document.createElement('div');
        b.className = 'back drawn';
        b.innerHTML = '<div class="crest">ج</div>';
        wrap.appendChild(b);
      }
      box.appendChild(wrap);
    });
    box.dataset.key = key;
  }
  $('oppname').textContent = others.map(s =>
    `${s.name}${s.team === v.seats[v.you].team ? ' (معاك)' : ''} · ${s.cards}`).join('  |  ');
}

/* The CURRENT chain only. The table is swept whenever possession resolves, so
   every card here belongs to the possession under way and all of them stay
   legible — the match history lives in the commentary panel instead. */
function renderTable() {
  const box = $('hist');
  box.innerHTML = '';
  state.table.forEach((e, i) => {
    const byMe = e.seat === state.view.you;
    const el = document.createElement('div');
    el.className = `hcard ${KIND(e.face)} ${byMe ? 'mine' : 'theirs'}` +
      (i >= state.drawnCount ? (byMe ? ' fresh' : ' freshflip') : '');
    el.innerHTML = `<div class="en">${(CARDS[e.face] || {}).en || e.face}</div>
       <div>${icon(e.face, 22)}</div><div class="nm">${AR(e.face)}</div>
       <div class="by">${(state.view.seats[e.seat] || {}).name || ''}</div>`;
    box.appendChild(el);
  });
  state.drawnCount = state.table.length;
  $('tablehint').classList.toggle('hide', state.table.length > 0);
}

/* Fly one card from the deck to the hand.
   i        — stagger index for multiple cards drawn at once
   onLand   — optional callback fired when the card reaches the slot          */
function flyCard(i, onLand) {
  const DELAY = i * 110;   // stagger multiple cards
  const DURATION = 400;

  // ── source: the deck element ────────────────────────────────────────────
  const deck = $('deckpile');
  const dr   = deck.getBoundingClientRect();
  const srcX = dr.left + dr.width  / 2;
  const srcY = dr.top  + dr.height / 2;

  // ── destination: leftmost facedown slot, or end of current hand ─────────
  // We measure BEFORE adding the card, so the slot doesn't exist yet.
  // Strategy: find the hand element's bounding rect and compute where the
  // next card will land, taking into account existing card widths + gap.
  const handEl  = $('hand');
  const handR   = handEl.getBoundingClientRect();
  const cards   = [...handEl.querySelectorAll('.card:not(.shifting)')];
  const gap     = 8;   // matches CSS .hand gap
  const cardW   = cards.length ? cards[0].getBoundingClientRect().width : 120;
  const cardH   = cards.length ? cards[0].getBoundingClientRect().height : 168;

  // In RTL the hand grows right-to-left; in LTR left-to-right.
  // getBoundingClientRect is always in visual screen coords, so we can
  // compute directly regardless of direction.
  let dstX, dstY;
  const existingFacedown = handEl.querySelector('.card.facedown');
  if (existingFacedown) {
    const fr = existingFacedown.getBoundingClientRect();
    dstX = fr.left + fr.width  / 2;
    dstY = fr.top  + fr.height / 2;
  } else if (cards.length === 0) {
    // empty hand — land in the centre of the hand element
    dstX = handR.left + cardW / 2;
    dstY = handR.top  + cardH / 2;
  } else {
    // land at the right end of the existing row (RTL: leftmost visually)
    const last = cards[cards.length - 1].getBoundingClientRect();
    const dir  = document.documentElement.dir === 'rtl' ? -1 : 1;
    dstX = last.right * (dir > 0 ? 1 : 0) + last.left * (dir > 0 ? 0 : 1)
           + dir * (gap + cardW / 2);
    dstY = last.top + cardH / 2;
  }

  // ── spawn the flyer at the deck's centre ─────────────────────────────────
  const W = Math.min(cardW, 60);
  const H = Math.min(cardH, 82);
  const f  = document.createElement('div');
  f.className = 'flyer';
  f.style.cssText = `
    width:${W}px; height:${H}px;
    left:${srcX - W/2}px; top:${srcY - H/2}px;
    transform:translate(0,0) scale(1);
    opacity:1;
    transition-delay:${DELAY}ms;
    background:#12102a;`;

  // card back = logo if loaded, else gradient
  if (LOGO_SRC) {
    const img = document.createElement('img');
    img.src   = LOGO_SRC;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:9px';
    f.appendChild(img);
  }
  document.body.appendChild(f);

  // ── shift existing hand cards right (RTL: to the right visually = +X) ────
  // We only shift cards that are not already facedown (they were there before)
  const toShift = [...handEl.querySelectorAll('.card:not(.facedown)')];
  const shiftDir = document.documentElement.dir === 'rtl' ? (W + gap) : -(W + gap);
  // mark them immediately so the transition fires from tick 0
  toShift.forEach(c => {
    c.classList.add('shifting');
    c.style.transform = `translateX(${shiftDir}px)`;
  });

  // ── kick off the flight on the next paint (so the starting position renders first)
  requestAnimationFrame(() => requestAnimationFrame(() => {
    f.style.transform = `translate(${dstX - srcX}px, ${dstY - srcY}px) scale(${cardH/H})`;

    // un-shift the hand cards at the same time so the slot "opens" for the flyer
    toShift.forEach(c => {
      c.style.transform = '';
    });

    // cleanup + notify
    const cleanup = setTimeout(() => {
      f.remove();
      toShift.forEach(c => c.classList.remove('shifting'));
      if (onLand) onLand();
    }, DELAY + DURATION + 30);
  }));
}


/* Drawing is done BY TAPPING THE DECK. In STRATEGY the tap submits a real draw
   action (and asks 1/2/3 when there is a choice). In LUCK the engine has
   already dealt the card, so the tap only reveals it. */
function renderDeck() {
  const pile = $('deckpile'), pick = $('draws');
  const draws = state.view.legal.filter(a => a.type === 'draw');
  pick.innerHTML = '';
  pick.classList.add('hide');
  pile.onclick = null;

  if (state.facedown.length) {
    pile.className = 'deckpile can';
    pile.onclick = () => pullDealt();
    return;
  }
  pile.className = 'deckpile' + (draws.length ? ' can' : '');
  if (!draws.length) return;

  if (draws.length === 1) {
    pile.onclick = () => submitDraw(draws[0]);
    return;
  }
  pile.onclick = () => pick.classList.toggle('hide');
  draws.forEach(a => {
    const b = document.createElement('button');
    b.textContent = a.n;
    b.onclick = ev => { ev.stopPropagation(); pick.classList.add('hide');
                        submitDraw(a); };
    pick.appendChild(b);
  });
}

function submitDraw(action) {
  if (state.busyDeck) return;
  state.busyDeck = true;
  const n = action.n || 1;
  for (let i = 0; i < n; i++) flyCard(i);
  // unblock and submit after the last card lands
  setTimeout(() => {
    state.busyDeck = false;
    state.room.submit({type: 'draw', n});
  }, 400 + (n - 1) * 110 + 30);
}


/** LUCK only: reveal the card the engine already dealt. Submits nothing. */
function pullDealt() {
  if (state.busyDeck) return;
  state.busyDeck = true;
  const n = state.facedown.length;
  for (let i = 0; i < n; i++) flyCard(i);
  // reveal the card exactly when the last flyer lands
  setTimeout(() => {
    state.facedown = [];
    state.busyDeck = false;
    render();
  }, 400 + (n - 1) * 110 + 30);
}

/* L33: you choose which of your own cards go. Tap to stage, tap again to undo,
   then تأكيد. The engine takes one pick at a time, so the confirmed selections
   are sent in the order they were chosen. */
function renderPicker(pickActs, box) {
  const v = state.view;
  const byId = new Map(pickActs.map(a => [a.card_id, a]));
  const need = Math.min(2, pickActs.length);
  state.picks = state.picks.filter(id => byId.has(id));

  v.hand.forEach(c => {
    const act = byId.get(c.id);
    const isSplit = c.kind === 'split' && c.faces.length > 1;
    const el = document.createElement('div');
    const at = state.picks.indexOf(c.id);
    el.className = 'card ' + (isSplit ? 'split' : KIND(c.faces[0]))
      + (act ? '' : ' dead') + (at >= 0 ? ' sel' : '');
    if (at >= 0) el.dataset.pick = at + 1;
    if (isSplit) {
      const mark = document.createElement('span');
      mark.className = 'splitmark';
      mark.textContent = 'SPLIT';
      el.appendChild(mark);
    }
    c.faces.forEach(face => {
      const d = CARDS[face] || {ar: face, en: face, line: ''};
      const half = document.createElement('div');
      half.className = `half ${KIND(face)} on`;
      half.innerHTML = `<div class="en">${d.en}</div>
        <div class="ar">${d.ar}</div>
        <div class="ico">${icon(face, isSplit ? 22 : 34)}</div>` +
        (isSplit ? '' : `<div class="ln">${d.line || ''}</div>`);
      el.appendChild(half);
    });
    if (act) {
      el.onclick = () => {
        const i = state.picks.indexOf(c.id);
        if (i >= 0) state.picks.splice(i, 1);
        else if (state.picks.length < need) state.picks.push(c.id);
        renderHand();
      };
    }
    box.appendChild(el);
  });

  const bar = $('pickbar');
  bar.classList.remove('hide');
  $('picktxt').textContent = state.picks.length >= need
    ? 'جاهز — اضغط تأكيد'
    : `اختار ${need - state.picks.length} ${need - state.picks.length === 1 ? 'كارت' : 'كروت'} للتبديل`;
  $('pickok').disabled = state.picks.length < need;
}

function confirmPicks() {
  if (!state.picks.length) return;
  const send = state.picks.slice();
  state.picks = [];
  for (const id of send) state.room.submit({type: 'pick', card_id: id});
}

export {
  renderBoard, renderFeed, renderFan, renderTable,
  renderDeck, renderHand, flyCard, submit, confirmPicks, icon
};
