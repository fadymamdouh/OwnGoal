/**
 * Asserts the ENGINE behaves the way the player-facing rulebook says it does.
 *
 * test-engine.mjs proves the engine is self-consistent (no leaks, no illegal
 * actions, every match finishes). This file proves something different: that
 * what the engine does matches what references/rulebook-ar.md promises a
 * player. A rule can be perfectly self-consistent and still not be the game
 * that was written down.
 *
 * Claims are taken from the rulebook and checked against rules.json (the
 * single source of truth) and against real match behaviour.
 *
 *     node web/test-rulebook.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Game, botAction } from './engine.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const RULES = JSON.parse(
  readFileSync(join(HERE, '..', 'references', 'rules.json'), 'utf8'));

let pass = 0;
const fails = [];

function check(claim, ok, detail = '') {
  if (ok) { pass++; return; }
  fails.push(`${claim}${detail ? `\n      ${detail}` : ''}`);
}

/** Build a game and force a specific board state for a targeted test. */
function rig({ mode = 'LUCK', matchType = 'ONE_V_ONE', seed = 1 } = {}) {
  return new Game({ mode, matchType, names: null, seed });
}

/** Pull a card carrying `face` out of the deck, or null. */
function takeFace(g, face) {
  const i = g.deck.findIndex(c => c.faces.includes(face));
  return i < 0 ? null : g.deck.splice(i, 1)[0];
}

/** Give a seat an exact hand, drawn out of the deck. */
function setHand(g, seat, faces) {
  const hand = [];
  for (const f of faces) {
    const c = takeFace(g, f);
    if (!c) throw new Error(`no ${f} left in deck`);
    hand.push(c);
  }
  g.seats[seat].hand = hand;
  return hand;
}

/** Which defense faces actually cancel `attack`, according to the engine? */
function defensesThatStop(attack) {
  const stops = new Set();
  for (const c of RULES.counters) {
    if (c.stops.includes(attack)) stops.add(c.defense);
  }
  return stops;
}

// ---------------------------------------------------------------- deck & setup

{
  const total = RULES.physical_cards.reduce((n, c) => n + c.copies, 0);
  check('deck is 60 physical cards', total === 60, `got ${total}`);

  const split = RULES.physical_cards
    .filter(c => c.type === 'split').reduce((n, c) => n + c.copies, 0);
  const full = RULES.physical_cards
    .filter(c => c.type === 'full').reduce((n, c) => n + c.copies, 0);
  check('27 split cards and 33 full cards', split === 27 && full === 33,
        `split ${split}, full ${full}`);

  check('hand size is 4', RULES.match.hand_size === 4);
  check('hand size is fixed', RULES.match.hand_size_is_fixed === true);
  check('3 goals to win', RULES.match.goals_to_win === 3);
  check('modes cannot be mixed', RULES.match.mixing_modes_allowed === false);

  check('1v1 removes Assist and Goal',
        ['ASSIST', 'GOAL'].every(f =>
          RULES.match_types_detail.ONE_V_ONE.removed_cards.includes(f)));
  check('Strategy disables Block',
        RULES.play_modes.STRATEGY.disabled_cards.includes('BLOCK'));
  check('Luck disables nothing',
        RULES.play_modes.LUCK.disabled_cards.length === 0);

  check('single copies: Own Goal, End Match, Offside, Penalty',
        ['OWN_GOAL', 'END_MATCH', 'OFFSIDE', 'PENALTY'].every(id =>
          RULES.physical_cards.find(c => c.id === id).copies === 1));
  check('two copies: VAR and Chain',
        ['VAR', 'CHAIN'].every(id =>
          RULES.physical_cards.find(c => c.id === id).copies === 2));
}

// Deck contents actually built by the engine, per mode and format.
for (const mode of ['LUCK', 'STRATEGY']) {
  for (const matchType of ['ONE_V_ONE', 'TWO_V_TWO']) {
    const g = rig({ mode, matchType });
    const all = [...g.deck, ...g.seats.flatMap(s => s.hand)];
    const faces = new Set(all.flatMap(c => c.faces));

    if (matchType === 'ONE_V_ONE') {
      check(`${mode}/1v1 deck has no Assist or Goal`,
            !faces.has('ASSIST') && !faces.has('GOAL'));
    } else {
      check(`${mode}/2v2 deck HAS Assist and Goal`,
            faces.has('ASSIST') && faces.has('GOAL'));
    }
    if (mode === 'STRATEGY') {
      check(`STRATEGY/${matchType} deck has no Block`, !faces.has('BLOCK'));
    } else {
      check(`LUCK/${matchType} deck HAS Block`, faces.has('BLOCK'));
    }
    /* In Luck the engine deals 4 and immediately draws the attacker's card for
       the turn, so that seat transiently holds 5. The rulebook's "4 cards" is
       the resting hand, so allow the attacker's drawn card. */
    const resting = g.seats.filter(s => s.index !== g.possession);
    check(`${mode}/${matchType} deals 4 cards to each player`,
          resting.every(s => s.hand.length === 4) &&
          g.seats[g.possession].hand.length === 4 + g.owed,
          g.seats.map(s => s.hand.length).join(',') + ` owed=${g.owed}`);
  }
}

// ---------------------------------------------------------- the counter table
// The rulebook's resolution table, transcribed from the uploaded doc.
const RULEBOOK_TABLE = {
  PASS:       ['INTERCEPTION', 'BLOCK', 'OFFSIDE', 'FOUL', 'CHAIN'],
  DRIBBLE:    ['TACKLE', 'FOUL', 'CHAIN'],
  SHOT_GOAL:  ['GOAL_KEEPER', 'BLOCK_SHOT', 'OFFSIDE', 'OWN_GOAL'],
  SUPER_SHOT: ['BLOCK_SAVE'],
  ASSIST:     ['INTERCEPTION', 'BLOCK', 'OFFSIDE', 'FOUL', 'CHAIN'],
  GOAL:       ['OFFSIDE', 'VAR', 'OWN_GOAL'],
  PENALTY:    ['OWN_GOAL', 'VAR'],
};

for (const [attack, expected] of Object.entries(RULEBOOK_TABLE)) {
  const actual = defensesThatStop(attack);
  const exp = new Set(expected);
  const missing = [...exp].filter(f => !actual.has(f));
  const extra = [...actual].filter(f => !exp.has(f));
  check(`${attack} is answered by exactly the rulebook's list`,
        missing.length === 0 && extra.length === 0,
        `missing [${missing}] unexpected [${extra}]`);
}

check('Super Shot has exactly one answer in the whole game',
      defensesThatStop('SUPER_SHOT').size === 1);
check('Foul cannot answer any shot or scoring card',
      ['SHOT_GOAL', 'SUPER_SHOT', 'GOAL', 'PENALTY']
        .every(f => !defensesThatStop(f).has('FOUL')));
check('Chain cannot answer any scoring card',
      ['SHOT_GOAL', 'SUPER_SHOT', 'GOAL', 'PENALTY']
        .every(f => !defensesThatStop(f).has('CHAIN')));
check('Offside does not stop Super Shot',
      !defensesThatStop('SUPER_SHOT').has('OFFSIDE'));

// ------------------------------------------------------------- possession map
const RULEBOOK_POSSESSION = {
  INTERCEPTION: 'defender', TACKLE: 'defender', OFFSIDE: 'defender',
  CHAIN: 'defender',
  GOAL_KEEPER: 'neutral', BLOCK_SAVE: 'neutral', BLOCK_SHOT: 'neutral',
  BLOCK: 'neutral',
  OWN_GOAL: 'attacker', FOUL: 'attacker',
};
for (const [face, who] of Object.entries(RULEBOOK_POSSESSION)) {
  check(`possession after ${face} is "${who}"`,
        RULES.possession_after_successful_defense[face] === who,
        `rules.json says "${RULES.possession_after_successful_defense[face]}"`);
}

// ------------------------------------------------------ mandatory defense rule
{
  // A defender holding nothing useful must still spend a card, and the attack
  // must then succeed. Hand must be back to 4 afterwards.
  const g = rig({ mode: 'LUCK' });
  g.phase = 'attack';
  g.possession = 0;
  g.defender = 1;
  g.owed = 1;
  setHand(g, 0, ['PASS', 'PASS', 'PASS', 'PASS']);
  const junk = setHand(g, 1, ['RESHUFFLE', 'RESHUFFLE', 'RESHUFFLE', 'RESHUFFLE']);

  const atk = g.legalActions(0).find(a => a.type === 'play' && a.face === 'PASS');
  check('attacker may play Pass', !!atk);
  if (atk) {
    g.apply(0, atk);
    const def = g.legalActions(1);
    check('defender with no valid counter still has a legal move',
          def.length > 0);
    const playCard = def.find(a => a.type === 'play');
    check('that move is playing a card, not passing',
          !!playCard, JSON.stringify(def.map(a => a.type)));
    if (playCard) {
      g.apply(1, playCard);
      check('a failed defense leaves possession with the attacker',
            g.possession === 0, `possession=${g.possession}`);
      // the next attacker has already drawn for the new turn, hence 4 + owed
      check('both hands return to 4 after the exchange',
            g.seats.every(s =>
              s.hand.length === 4 + (s.index === g.possession ? g.owed : 0)),
            g.seats.map(s => s.hand.length).join(',') + ` owed=${g.owed}`);
    }
  }
}

// --------------------------------------------- shot must close a Strategy chain
{
  const g = rig({ mode: 'STRATEGY' });
  g.phase = 'attack';
  g.possession = 0;
  g.defender = 1;
  g.owed = 3;                      // three cards still to play
  setHand(g, 0, ['SHOT_GOAL', 'PASS', 'DRIBBLE', 'PASS']);
  const legal = g.legalActions(0);
  const shot = legal.find(a => a.face === 'SHOT_GOAL');
  check('a shot is NOT legal mid-chain in Strategy (L26)', !shot,
        shot ? 'engine allowed a shot with 3 cards owed' : '');

  g.owed = 1;                      // last card of the chain
  const shotNow = g.legalActions(0).find(a => a.face === 'SHOT_GOAL');
  check('a shot IS legal as the last card of a Strategy chain', !!shotNow);
}
{
  // In Luck there is no chain, so a shot is always available.
  const g = rig({ mode: 'LUCK' });
  g.phase = 'attack';
  g.possession = 0; g.defender = 1; g.owed = 1;
  setHand(g, 0, ['SHOT_GOAL', 'PASS', 'PASS', 'PASS']);
  check('a shot is legal in Luck mode',
        !!g.legalActions(0).find(a => a.face === 'SHOT_GOAL'));
}

// ------------------------------------------------------------ Own Goal flips
{
  const g = rig({ mode: 'LUCK' });
  g.phase = 'attack';
  g.possession = 0; g.defender = 1; g.owed = 1;
  setHand(g, 0, ['SHOT_GOAL', 'PASS', 'PASS', 'PASS']);
  setHand(g, 1, ['OWN_GOAL', 'RESHUFFLE', 'RESHUFFLE', 'RESHUFFLE']);
  const before = [...g.score];
  g.apply(0, g.legalActions(0).find(a => a.face === 'SHOT_GOAL'));
  const og = g.legalActions(1).find(a => a.face === 'OWN_GOAL');
  check('Own Goal may answer a shot', !!og);
  if (og) {
    g.apply(1, og);
    const defTeam = g.team(1);
    /* The rulebook is explicit: Own Goal does NOT stop the shot, it flips it —
       the point counts for the defender. Played as a defense card the engine
       instead cancels the shot and scores nothing, so a player who taps it
       loses the goal they were entitled to. Playing junk first and taking the
       react_own_goal offer DOES score. */
    check('Own Goal scores for the DEFENDER, not the shooter',
          g.score[defTeam] === before[defTeam] + 1,
          `score ${before} -> ${g.score} — played as a DEFENSE it cancels the `
          + 'shot and scores nothing; only the react_own_goal path scores');
    check('after Own Goal the ball goes to the attacker',
          RULES.possession_after_successful_defense.OWN_GOAL === 'attacker');
  }
}
{
  // the other path, for contrast: fail the defense, then take the reaction
  const g = rig({ mode: 'LUCK' });
  g.phase = 'attack'; g.possession = 0; g.defender = 1; g.owed = 1;
  setHand(g, 0, ['SHOT_GOAL', 'PASS', 'PASS', 'PASS']);
  setHand(g, 1, ['OWN_GOAL', 'RESHUFFLE', 'RESHUFFLE', 'RESHUFFLE']);
  g.apply(0, g.legalActions(0).find(a => a.face === 'SHOT_GOAL'));
  g.apply(1, g.legalActions(1).find(a => a.face === 'RESHUFFLE'));
  check('failing the defense first offers the Own Goal reaction',
        g.phase === 'react_own_goal');
  const react = g.legalActions(1).find(a => a.face === 'OWN_GOAL');
  if (react) {
    g.apply(1, react);
    check('the reaction path DOES score for the defender',
          g.score[g.team(1)] === 1, JSON.stringify(g.score));
  }
}

// ------------------------------- VAR as a defense card: guaranteed, no coin flip
{
  const g = rig({ mode: 'LUCK', seed: 3 });
  // leave exactly one VAR in the game, in the defender's hand
  const v = takeFace(g, 'VAR');
  for (;;) { const i = g.deck.findIndex(c => c.faces.includes('VAR'));
             if (i < 0) break; g.deck.splice(i, 1); }
  g.seats[0].hand = ['PENALTY', 'PASS', 'PASS', 'PASS'].map(f => takeFace(g, f));
  g.seats[1].hand = [v, ...['RESHUFFLE', 'RESHUFFLE', 'RESHUFFLE'].map(f => takeFace(g, f))];
  g.phase = 'attack'; g.possession = 0; g.defender = 1; g.owed = 1; g.score = [0, 0];
  g.seats[0].fouled = true;

  g.apply(0, g.legalActions(0).find(a => a.face === 'PENALTY'));
  const varAct = g.legalActions(1).find(a => a.face === 'VAR');
  check('VAR is offered against a Penalty', !!varAct);
  if (varAct) {
    // The rulebook makes VAR a coin-flip review: heads confirms, tails cancels.
    check('VAR shows as a valid counter in the UI hint', varAct.counters === true,
          `legalActions reports counters=${varAct.counters}, so the live client `
          + 'shows no "✓ رد صح" tick even though this stops the penalty');
    g.apply(1, varAct);
    check('VAR played as a defense performs a coin-flip review',
          g.log.some(e => e.kind === 'var'),
          'no var event fired — the penalty was cancelled outright, with no flip, '
          + 'turning a 50/50 review into a guaranteed denial');
  }
}

// ------------------------------------------------------ conceding side restarts
{
  let checked = 0, wrong = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const g = rig({ mode: 'LUCK', seed });
    let guard = 0;
    let prevScore = [...g.score];
    while (!g.over && guard++ < 900) {
      const actor = g.seats.map(s => s.index).find(i => g.legalActions(i).length);
      if (actor === undefined) break;
      const a = botAction(g, actor);
      if (!a) break;
      g.apply(actor, a);
      const scored = g.score.some((v, i) => v !== prevScore[i]);
      // while a VAR or Own Goal reaction is pending the goal is not final and
      // possession has deliberately not moved yet — check after it resolves
      if (scored && !g.over && !g.pending && g.phase !== 'react_var'
          && g.phase !== 'react_own_goal') {
        // whichever team's score went UP conceded nothing; the other restarts
        const up = g.score.findIndex((v, i) => v > prevScore[i]);
        if (up >= 0) {
          checked++;
          if (g.team(g.possession) === up) wrong++;
        }
      }
      prevScore = [...g.score];
    }
  }
  check('after a goal the CONCEDING side restarts, never the scorer',
        wrong === 0, `${wrong} of ${checked} goals left the scorer on the ball`);
  check('that was actually exercised', checked > 20, `only ${checked} goals seen`);
}

// ---------------------------------------------------------------- End Match
{
  const g = rig({ mode: 'LUCK' });
  g.phase = 'attack';
  g.possession = 0; g.defender = 1; g.owed = 1;
  g.score = [1, 1];                       // level
  setHand(g, 0, ['END_MATCH', 'PASS', 'PASS', 'PASS']);
  const em = g.legalActions(0).find(a => a.face === 'END_MATCH');
  check('End Match is playable', !!em);
  if (em) {
    g.apply(0, em);
    check('End Match ends the match immediately', g.over === true);
    check('level score means the OPPONENT wins (no free win, no draw)',
          g.winner === g.team(1), `winner=${g.winner}, played by team ${g.team(0)}`);
  }
}
{
  const g = rig({ mode: 'LUCK' });
  g.phase = 'attack';
  g.possession = 0; g.defender = 1; g.owed = 1;
  g.score = [2, 0];
  setHand(g, 0, ['END_MATCH', 'PASS', 'PASS', 'PASS']);
  g.apply(0, g.legalActions(0).find(a => a.face === 'END_MATCH'));
  check('End Match while ahead wins for the player who played it',
        g.over && g.winner === g.team(0), `winner=${g.winner}`);
}

// ------------------------------------------------------------- no draws, ever
{
  let draws = 0, finished = 0;
  for (const mode of ['LUCK', 'STRATEGY']) {
    for (const matchType of ['ONE_V_ONE', 'TWO_V_TWO']) {
      for (let seed = 1; seed <= 40; seed++) {
        const g = rig({ mode, matchType, seed });
        let guard = 0;
        while (!g.over && guard++ < 2000) {
          const actor = g.seats.map(s => s.index)
            .find(i => g.legalActions(i).length);
          if (actor === undefined) break;
          const a = botAction(g, actor);
          if (!a) break;
          g.apply(actor, a);
        }
        if (g.over) {
          finished++;
          if (g.winner === null || g.winner === undefined) draws++;
        }
      }
    }
  }
  check('no match ever ends in a draw', draws === 0,
        `${draws} of ${finished} finished without a winner`);
  check('every match reached an end', finished === 160, `${finished}/160`);
}

// --------------------------------------------------- hand stays at 4 all match
{
  let bad = 0, samples = 0;
  for (const mode of ['LUCK', 'STRATEGY']) {
    for (const matchType of ['ONE_V_ONE', 'TWO_V_TWO']) {
      for (let seed = 1; seed <= 25; seed++) {
        const g = rig({ mode, matchType, seed });
        let guard = 0;
        while (!g.over && guard++ < 2000) {
          const actor = g.seats.map(s => s.index)
            .find(i => g.legalActions(i).length);
          if (actor === undefined) break;
          const a = botAction(g, actor);
          if (!a) break;
          g.apply(actor, a);
          // between turns, when nobody owes cards, every hand must be 4
          if (g.owed === 0 && g.defOwed === 0 && !g.pending && !g.over) {
            samples++;
            if (g.seats.some(s => s.hand.length !== 4)) bad++;
          }
        }
      }
    }
  }
  check('hand returns to 4 between turns, never grows',
        bad === 0, `${bad} of ${samples} checkpoints off 4`);
}

// ----------------------------------------------------------- deck never dies
{
  let ran = 0, recycled = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const g = rig({ mode: 'LUCK', seed });
    let guard = 0;
    while (!g.over && guard++ < 2000) {
      const actor = g.seats.map(s => s.index).find(i => g.legalActions(i).length);
      if (actor === undefined) break;
      const a = botAction(g, actor);
      if (!a) break;
      g.apply(actor, a);
    }
    ran++;
    if (g.log.some(e => e.kind === 'deck_recycled')) recycled++;
  }
  check('matches finish without the deck running dry', ran === 40);
  check('the discard is recycled when the deck empties', recycled > 0,
        'no deck_recycled event ever fired — recycling untested');
}

// ---------------------------------------------------------------- 2v2 seating
{
  const g = rig({ matchType: 'TWO_V_TWO' });
  check('2v2 has four seats', g.seats.length === 4);
  check('2v2 seating alternates teams (T1P1, T2P1, T1P2, T2P2)',
        [0, 1, 2, 3].every(i => g.team(i) === i % 2),
        g.seats.map(s => g.team(s.index)).join(','));

  // the defender is the next seat round, and therefore always an opponent
  let wrong = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const h = rig({ matchType: 'TWO_V_TWO', seed });
    let guard = 0;
    while (!h.over && guard++ < 900) {
      if (h.defender !== null && h.defender !== undefined) {
        if (h.team(h.defender) === h.team(h.possession)) wrong++;
      }
      const actor = h.seats.map(s => s.index).find(i => h.legalActions(i).length);
      if (actor === undefined) break;
      const a = botAction(h, actor);
      if (!a) break;
      h.apply(actor, a);
    }
  }
  check('2v2 defender is always on the opposing team', wrong === 0,
        `${wrong} states had a team-mate defending`);
}

// -------------------------------------------------------- Goal needs an Assist
{
  const g = rig({ matchType: 'TWO_V_TWO', mode: 'LUCK' });
  g.phase = 'attack';
  g.possession = 0; g.defender = 1; g.owed = 1;
  setHand(g, 0, ['GOAL', 'PASS', 'PASS', 'PASS']);
  g.seats[0].goalUnlocked = false;
  const goal = g.legalActions(0).find(a => a.face === 'GOAL');
  check('a Goal card cannot be played without an Assist first', !goal,
        goal ? 'engine allowed a bare Goal' : '');

  g.seats[0].goalUnlocked = true;
  const goalNow = g.legalActions(0).find(a => a.face === 'GOAL');
  check('a Goal card becomes playable once unlocked by an Assist', !!goalNow);
}

// ------------------------------------------------------------------- report
console.log('\nrulebook conformance');
console.log(`  checks passed : ${pass}`);
console.log(`  checks failed : ${fails.length}`);
if (fails.length) {
  console.log('\nMISMATCHES between the rulebook and the engine:');
  for (const f of fails) console.log(`  ✗ ${f}`);
  console.log('');
  process.exit(1);
}
console.log('\nthe engine matches the rulebook on every claim checked.\n');
