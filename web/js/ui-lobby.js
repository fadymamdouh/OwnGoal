/* ═══════════════════════════════════════════════════════════════
 * ui-lobby.js — lobby, waiting, splash screens + room management
 *
 * Contains: makeRoom, create/join handlers, exitRoom, splash IIFE.
 * ═══════════════════════════════════════════════════════════════ */
import {Room} from '../net.js';
import {$, render, resetTable, foldEvents, state} from './ui-render.js';
import {
  _applyMute, _preloadFetch, _unlockAudio,
  _startCrowd, _stopCrowd, _startIntro, _stopIntro,
  runAnimations, resetGoalScored, toggleMute, getCardPending
} from './ui-animations.js';
import {renderHand, renderFeed, confirmPicks} from './ui-game.js';

function makeRoom() {
  return new Room({
    onView: v => {
      // rematch() builds a new Game, which resets eventId to 0. So if the
      // highest id in this view is behind what we have already folded, the
      // match restarted and the table starts over.
      const maxId = Math.max(0, ...(v.log || []).map(e => (e && e.id) || 0));
      if (maxId < state.lastEvent) resetTable();
      foldEvents(v);
      runAnimations((v.log || []).filter(e => e && e.id));

      const ids = v.hand.map(c => c.id);
      if (v.mode === 'LUCK' && state.prevHand.length) {
        const fresh = ids.filter(id => !state.prevHand.includes(id));
        if (fresh.length && v.legal.length) state.facedown = fresh;
      }
      state.prevHand = ids;

      state.view = v;
      $('waiting').classList.add('hide');
      $('game').classList.remove('hide');
      document.body.classList.add('playing');
      resetGoalScored();
      _stopIntro();
      _startCrowd();
      render();
    },
    onLobby: info => {
      $('roomcode').textContent = info.code;
      localStorage.setItem('og_code', info.code);
      $('lobby').classList.add('hide');
      if (!info.started) $('waiting').classList.remove('hide');
      $('lobbylist').innerHTML = '<h2>اللاعبين</h2>' + info.players.map(p =>
        `<div class="row" style="margin:0 0 6px"><span>${p.name}${p.bot ? ' 🤖' : ''}</span>
         <span class="pill live">${p.bot ? 'بوت' : 'موجود'}</span></div>`).join('') +
        `<div class="hint">مستني ${info.size - info.players.length} لاعب كمان</div>`;
    },
    onError: msg => { alert(msg); $('lobby').classList.remove('hide');
                      $('waiting').classList.add('hide');
                      document.body.classList.remove('playing');
                      _stopCrowd(); _stopIntro(); },
  });
}

/** Back to the front screen, after cleaning up whatever we published. */
async function exitRoom() {
  if (state.room) {
    // The host is the referee, so its exit ends the match for everybody.
    if (state.room.isHost && !state.room.local && state.room.game &&
        !confirm('انت الهوست — لو خرجت الماتش يخلص لكل اللاعبين. متأكد؟')) return;
    try { await state.room.leave(); } catch (e) { console.warn(e); }
  }
  state.room = null;
  state.view = null;
  resetTable();
  localStorage.removeItem('og_code');
  $('game').classList.add('hide');
  $('waiting').classList.add('hide');
  $('lobby').classList.remove('hide');
  document.body.classList.remove('playing');
  _stopCrowd();
}

export function initLobby() {
  /* format / mode toggle buttons */
  document.querySelectorAll('[data-state.fmt]').forEach(b => b.onclick = () => {
    document.querySelectorAll('[data-state.fmt]').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); state.fmt = b.dataset.fmt;
  });
  document.querySelectorAll('[data-state.mode]').forEach(b => b.onclick = () => {
    document.querySelectorAll('[data-state.mode]').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); state.mode = b.dataset.mode;
  });

  $('create').onclick = async () => {
    const name = $('name').value.trim() || 'لاعب';
    state.room = makeRoom();
    try { await state.room.create(state.mode, state.fmt, name); }
    catch (e) { alert('مشكلة في الاتصال بـ Firebase: ' + e.message); }
  };

  $('join').onclick = async () => {
    const c = $('joincode').value.trim().toUpperCase();
    if (c.length !== 5) return alert('الكود 5 حروف');
    state.room = makeRoom();
    try { await state.room.join(c, $('name').value.trim() || 'لاعب'); }
    catch (e) { alert('مشكلة في الاتصال بـ Firebase: ' + e.message); }
  };

  $('keyonly').onchange = () => { if (state.view) renderFeed(); };

  // ── splash screen ──────────────────────────────────────────
  (function() {
    const splash = document.getElementById('splash');
    const vid    = document.getElementById('splash-vid');
    const skip   = document.getElementById('splash-skip');
    if (!splash || !vid) return;

    function dismiss() {
      splash.classList.add('fade');
      setTimeout(() => { splash.style.display = 'none'; }, 850);
    }

    vid.addEventListener('ended', dismiss);
    splash.addEventListener('click', dismiss);
    setTimeout(dismiss, 12000);

    vid.play().catch(() => {
      skip.textContent = 'اضغط لتشغيل المقدمة';
    });
  })();

  // Start fetching sound files immediately
  _preloadFetch();
  // Unlock audio + start intro on ANY gesture
  ['click','keydown','touchstart'].forEach(ev =>
    document.addEventListener(ev, _unlockAudio, { once: true, passive: true }));

  const _muteBtn = $('muteBtn');
  _muteBtn.onclick = () => {
    const muted = toggleMute();
    _muteBtn.textContent = muted ? '🔇' : '🔊';
    _muteBtn.classList.toggle('muted', muted);
    _applyMute();
  };

  $('pickok').onclick = confirmPicks;
  $('pickclr').onclick = () => { state.picks = []; renderHand(); };
  $('exitwait').onclick = exitRoom;
  $('exitgame').onclick = exitRoom;

  const last = localStorage.getItem('og_code');
  if (last && last !== 'BOT') {
    $('joincode').value = last;
    $('join').textContent = `ارجع لأوضة ${last}`;
  }
}

export { exitRoom };
