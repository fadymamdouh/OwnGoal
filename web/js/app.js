/* ═══════════════════════════════════════════════════════════════
 * app.js — entry point
 *
 * Imports all modules, wires dependencies, starts the app.
 * This is the ONLY <script> tag in index.html.
 * ═══════════════════════════════════════════════════════════════ */
import {init as initOnboarding, createRulesButton} from '../onboarding.js';
import {initRender} from './ui-render.js';
import {
  runAnimations, getCardPending,
  resetGoalScored,
  _startCrowd, _stopCrowd, _stopIntro
} from './ui-animations.js';
import {
  renderBoard, renderFeed, renderFan, renderTable,
  renderDeck, renderHand
} from './ui-game.js';
import {initLobby} from './ui-lobby.js';

/* ── wire late-bound dependencies into ui-render ────────────── */
initRender({
  renderBoard,
  renderFeed,
  renderFan,
  renderTable,
  renderDeck,
  renderHand,
  runAnimations,
  cardPendingFn: getCardPending,
  resetGoalScored,
  stopIntro: _stopIntro,
  startCrowd: _startCrowd,
  stopCrowd: _stopCrowd,
});

/* ── initialise lobby (buttons, splash, audio, event wiring) ── */
initLobby();

/* ── onboarding carousel + rules button ────────────────────── */
initOnboarding();
document.getElementById('rules-btn-slot').appendChild(createRulesButton());
