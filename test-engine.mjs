// Mirrors scripts/test_engine.py so the browser engine is held to the same bar.
import { Game, botAction, HAND } from './engine.js';

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };
const total = g => g.deck.length + g.discard.length
  + g.seats.reduce((n, s) => n + s.hand.length, 0);

function playOne(mode, matchType, seed) {
  const g = new Game({ mode, matchType, seed });
  const start = total(g);
  let steps = 0;
  while (!g.over && steps < 4000) {
    steps++;
    const actors = g.seats.map(s => s.index).filter(i => g.legalActions(i).length);
    check(actors.length <= 1,
      `${mode}/${matchType}: ${actors.length} seats could act at once in ${g.phase}`);
    if (!actors.length) { failures.push(`${mode}/${matchType}: deadlock in ${g.phase}`); break; }
    const seat = actors[0];

    const v = g.view(seat);
    const mine = new Set(v.hand.map(c => c.id));
    for (const other of g.seats) {
      if (other.index === seat) continue;
      check(!other.hand.some(c => mine.has(c.id)),
        'a seat view contained another seat card id');
    }
    check(v.seats.every(s => s.hand === undefined), 'seat summaries leaked hands');

    let rejected = false;
    try { g.apply(seat, { type: 'play', card_id: 'nope', face: 'PASS' }); }
    catch { rejected = true; }
    check(rejected, 'engine accepted an action for a card not in hand');

    g.apply(seat, botAction(g, seat, seat % 2 ? 'PATIENT' : 'SHOOTER'));
    check(total(g) === start, `card count drifted: ${total(g)} vs ${start}`);
    for (const s of g.seats) {
      check(s.hand.length <= HAND + 3, `hand grew to ${s.hand.length} in ${mode}`);
    }
  }
  check(g.over, `${mode}/${matchType}: did not finish in ${steps} steps`);
  return { g, steps };
}

const matches = Number(process.argv[2] || 250);
const tally = {};
const lengths = [];
for (let i = 0; i < matches; i++) {
  for (const mode of ['LUCK', 'STRATEGY']) {
    for (const mt of ['ONE_V_ONE', 'TWO_V_TWO']) {
      const { g, steps } = playOne(mode, mt, i * 7919 + mode.length * 31 + mt.length);
      lengths.push(steps);
      const reason = [...g.log].reverse().find(e => e.kind === 'match_over')?.reason || '?';
      const k = `${mode}/${mt}/${reason}`;
      tally[k] = (tally[k] || 0) + 1;
    }
  }
}
lengths.sort((a, b) => a - b);
console.log(`\nplayed ${matches * 4} matches in the browser engine`);
console.log(`median actions per match: ${lengths[Math.floor(lengths.length / 2)]}`);
for (const k of Object.keys(tally).sort()) console.log(`  ${k.padEnd(34)}${tally[k]}`);
if (failures.length) {
  console.log(`\n${failures.length} FAILURES`);
  [...new Set(failures)].slice(0, 12).forEach(f => console.log(`  • ${f}`));
  process.exit(1);
}
console.log('\nall invariants held: no leaks, no illegal actions, no lost cards, every match finished.\n');
