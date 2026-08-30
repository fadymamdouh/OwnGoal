---
name: owngoal-rules
description: The single source of truth for OWN GOAL (أون جول), an Egyptian street-football card game. Use this skill whenever the user asks anything about Own Goal — rules questions, the counter table, card lists, deck quantities, Luck vs Strategy mode, 1v1 vs 2v2, balance, the rulebook, print-ready card files, or a web/digital version. Also use it when the user says "the game", "the cards", "the deck", "the rulebook", or names any Own Goal card (Pass, Interception, Super Shot, Block Save, Foul, Penalty, VAR, Chain, Reshuffle, Own Goal, Offside, End Match) — even casually, and even if they never say "Own Goal" or "skill". Always read references/rules.json before answering; never answer an Own Goal rules question from memory.
---

# OWN GOAL — rules authority

Own Goal (أون جول) is a competitive card game themed on Egyptian street and café
football. Rules text is written in Egyptian Arabic; card names stay in English.

**`references/rules.json` is the only source of truth.** Older documents
(`OwnGoal_-_Cards.csv`, `OwnGoal_Rulebook.docx`, the rules-card PDF) are legacy
and contradict each other. Never quote them as current rules.

## Before you answer anything

1. Read `references/rules.json`.
2. If a rule is marked `PROVISIONAL` or `ACCEPTED_BY_DESIGNER`, say so. The first
   means nobody has signed off; the second means the designer chose it knowingly
   against the maths and does not need convincing again.
3. Check `references/open-questions.md` before proposing a change — the answer may
   already be a closed decision with a recorded rationale.

## When a rule changes

Rules change often at this stage. The order matters:

1. Edit `references/rules.json` — never patch a rule in prose only, or the next
   session will contradict you.
2. Run `python scripts/validate_rules.py`.
3. Report the diff in warnings to the user. A change that silently kills a card
   or makes an attack unanswerable is the main risk here.
4. Update `references/rulebook-ar.md` so the player-facing text matches.
5. Bump `version` in rules.json.

The validator catches: unanswerable attacks, defenses that stop nothing,
duplicate cards doing the same job, cards strictly dominated by another card,
hand-size drift, and counters so rare the duel is decided by the deal. It also
prints, for every attack card, the actual probability that a 4-card hand holds an
answer — the fastest way to see whether a card is a real threat or a bluff.

## What is locked vs open

**Locked by the designer:**
- Power values are gone entirely. Resolution is type-based counters only. Any
  art showing a number (5–90) is legacy and must be reprinted.
- Any Attack card may open a chain — a Shot can be the first card of a possession.
- A Penalty can be objected to by **either** Own Goal **or** VAR.
- Penalty is a normal deck card played from hand after a foul against you.
- Yellow Card is cut for now; it may return as an expansion card.
- Foul reaches build-up stages only; it cannot answer a shot or a Penalty.
- 2v2 scores two ways; the Goal card requires a partner's successful Assist.

**Two questions are open (Q13, Q14), both found by the simulator** — whether a shot
must be the last card of a Strategy chain, and whether Chain really answers every
attack including Super Shot. Read `references/simulation-findings.md` for the
numbers before discussing either. Everything else is closed and at v1.0.1.
`references/open-questions.md` now holds the *accepted risks* — decisions the
designer made knowingly against the maths (Super Shot's ~7% answer rate, Strategy
mode's dominated combo, no turn limit, Block being strictly worse than
Interception). Treat these as things to measure in playtesting, not as unsettled
rules, and don't reopen them unprompted.

## The rules in brief

Full detail is in rules.json; this is orientation only.

- Each player holds **4 cards**, always. Draw before you play, every action.
- Each attack card is beaten by one specific defense card. Right card = attack
  cancelled. Wrong card = attack succeeds. No numbers are ever compared.
- **The defender must always play a card**, even with no valid answer. That card
  burns for nothing. This is a resource rule — it keeps both hands at 4.
- **Split cards** carry an attack on one end and a defense on the other. Playing
  one end discards the whole card. Every Pass you make burns an Interception you
  will not have later. This is the central tension of the game.
- Successful defense with Interception / Tackle / Offside takes possession.
  Goal Keeper / Block Save / Block Shot are neutral. **Foul** is inverted — it
  hands possession back to the attacker it fouled.
- **A card that scores can only be answered by the defenses named against it** in
  the counter table. No card bypasses this — Chain included.
- **Strategy chains must end on the shot.** Build-up first; playing a shot closes
  the chain and burns any cards still owed from the draw.
- **Foul is NOT universal.** It reaches Pass, Dribble and Assist only — never a
  shot, never a Penalty. Super Shot therefore has exactly one answer in the whole
  game: Block Save.
- **Penalty** is an ordinary card in the deck. Play it from hand after the
  opponent fouls you: guaranteed goal, answerable only by Own Goal or VAR.
- **Own Goal** doesn't stop a shot, it converts it: the point goes to the side
  that played it, but possession returns to the attacker who conceded it. One
  copy in the deck.
- **Luck mode** — draw 1, play 1; the defender answers every card in the chain.
  This is the intended core experience.
- **Strategy mode** — both sides draw 1–3 and play exactly that many. The
  attacker's cards form one combo; the defender answers only its last card. The
  defender spends his cards **in order** as attempts, and the moment one works,
  every card he has left becomes an immediate **counter-attack** — but only if the
  card that worked actually grants possession. Block is removed from this mode.
- **1v1** removes Assist and Goal. **2v2** uses the full deck and has two scoring
  routes: a successful shot, or a partner's successful Assist transferring
  possession to you and unlocking your Goal card. Goal is never played alone.
- **2v2 turn structure:** seats rotate T1P1, T2P1, T1P2, T2P2, and defending spends
  your slot just as attacking does. The defender is the next seat; a won ball goes
  to your **partner**; a neutral save goes to the next seat holding an attack card.
- **After any goal, in both modes, the conceding side restarts.** Scoring never
  returns the ball to you, and Own Goal needs no special case.
- Partners may talk but may never name or describe a card.
- **VAR** reviews a Goal, a Penalty, or an Offside call — coin flip, once per event.
- **The deck never runs out**: reshuffle the discard and keep drawing. A match ends
  only at **3 goals** or on the single **End Match** card — and if scores are level
  when End Match is played, the opponent wins, so draws are impossible.

## Files

| File | Read it when |
|---|---|
| `references/rules.json` | Always, before answering anything |
| `references/open-questions.md` | The question might be unresolved; before any print or build work |
| `references/rulebook-ar.md` | The user wants player-facing text, a rulebook, or card wording |
| `references/card-flavour-ar.md` | Card flavour lines — needed for any print layout or card art work |
| `references/card-flavour-ar-18plus.md` | The adults-only flavour expansion (stickers / separate deck, never merged into the base deck) |
| `references/card-flavour-ar-commentary.md` | Broadcast-commentary voice set; pairs with the café lines as a second line on each card |
| `scripts/validate_rules.py` | After any rule change, always |
| `scripts/engine.py` | The authoritative game engine — the online build's single implementation of play |
| `scripts/server.py` | The online build: rooms, codes, reconnect, bot driver |
| `scripts/test_server.py` | After any server or protocol change |
| `scripts/export_web.py` | After changing card names, flavour or icons — regenerates static/cards.js |
| `web/engine.js` | The browser port of the engine (static/Firebase build) |
| `web/test-engine.mjs` | `node web/test-engine.mjs` after any change to either engine |
| `web/net.js` | Firebase room layer — host-as-referee model |
| `web/index.html` | The static client (GitHub Pages entry point) |
| `database.rules.json` | Firebase security rules — must be published in the console |
| `web/README.md` | How the static build is deployed and how it works |
| `scripts/build_offline.py` | Rebuilds `owngoal-offline.html` — run after any web/ change |
| `scripts/test_engine.py` | After ANY engine change; asserts no info leaks, no illegal moves, no lost cards |
| `scripts/simulate.py` | Any balance question — run 10,000 matches instead of guessing |
| `scripts/make_cards.py` | Rendering the deck: print sheets + design preview from rules.json. Three art directions via `--style street` (default, the designer's reference sheet), `riso` (two-ink screenprint) or `chalk`. `--final` drops cut guides. |
| `references/simulation-findings.md` | Before proposing a balance change; holds measured numbers |

## The online build

Run it:

    pip install fastapi uvicorn websockets
    python scripts/server.py            # http://localhost:8000

Files: `scripts/engine.py` (rules), `scripts/server.py` (rooms + WebSocket),
`static/index.html` (client), `static/cards.js` (generated — never hand-edit;
run `python scripts/export_web.py` after changing card text or icons).

Rooms are in-memory and keyed by a 5-character code, with no accounts: identity
is a name plus a browser token, and that token is what returns a dropped player
to the same seat. An abandoned room survives `ABANDON_GRACE` seconds so a
reconnect can find it. `fmt` is `bot`, `1v1` or `2v2`.

Test with `python scripts/test_server.py --port PORT` against a running server
(`OG_BOT_DELAY=0` makes it fast).

Deployment is documented in `DEPLOY.md`: Render's free tier, with `render.yaml`,
`requirements.txt` and a `Dockerfile` for other hosts. The server reads `PORT`
from the environment. Serverless platforms (Vercel, Netlify) cannot host this —
they hold no persistent process, so WebSockets and in-memory rooms are
impossible there. Rooms are memory-only, so a redeploy drops matches in
progress; say so before recommending the link be shared widely.

`scripts/engine.py` is authoritative and server-side by design. A client submits
an action chosen from `legal_actions(seat)` and receives `view(seat)`, which
strips every other hand to a card count. Never move deck state, shuffling, or the
VAR coin flip to the browser — a player with devtools would read the opponent's
hand. `bot_action()` provides the solo opponent using the policies the simulator
validated.

Run `python scripts/test_engine.py` after any change to either the engine or
rules.json.

## The browser build (static hosting + Firebase)

`web/engine.js` is a line-for-line port of `scripts/engine.py`: same phases, same
action shapes, same event names, so the two cannot drift. `web/rules.js` is
generated from references/rules.json. Both engines are held to the same test
suite — run `node web/test-engine.mjs` and `python scripts/test_engine.py` after
any rules change, and expect matching median match lengths (~56 actions).

ES modules do not work from `file://` — the browser treats each local file as a
separate origin and refuses every import between them. So local testing by
double-click needs `scripts/build_offline.py`, which inlines everything into a
single classic-script HTML file (`owngoal-offline.html`, bot play only). Never
tell the user to just open `web/index.html` from disk; it cannot work.

This build exists because free always-on hosting for a Python WebSocket server
requires a card, while GitHub Pages plus Firebase's Spark plan requires neither.
The trade-off is real and must be stated to the user whenever this path comes up:
with no server, the engine runs in a player's browser, so the host client can
inspect state. Firebase security rules can still hide each player's HAND from the
opponent, but the deck order is visible to whoever draws. Acceptable among
friends; not acceptable for a public release. Cloud Functions would fix it but
need the Blaze plan, which needs a card.

## Working on the print edition or the website

Both are downstream of this skill and neither should start while errors exist in
the validator. Card flavour text lives in three complete sets — café/base, adults-only, and
broadcast commentary. The intended layout pairs a café line (normal weight) with a
commentary line (smaller, italic) on the same card. Do not reproduce any real
commentator's signature catchphrase on a card, however the request is framed; the
commentary set is written in the professional register instead, which is free to
use. the two faces of a
split card are written as a two-line exchange, so keep them together in layout.
Deck composition for print is `physical_cards` in rules.json:
**60 cards in the draw deck** (27 split + 33 full).
Count split cards **once** — a Pass/Interception card is one piece of cardboard,
not two.

For a digital build, implement resolution directly from `counters` and
`possession_after_successful_defense` rather than hard-coding it, so the ruleset
stays the single source of truth. `scripts/simulate.py` plays full matches for both 1v1 and 2v2 from
rules.json (`--players 2v2`, `--mode STRATEGY`) — run it after any rule change to see the effect on goals per match,
match length and card usage before committing anything to print.
