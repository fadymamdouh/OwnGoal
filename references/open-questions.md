# Open questions — OWN GOAL

**Every design question is closed. Ruleset is at v1.2.0, and 2v2 is now fully specified.**

The two holes the simulator found (Q13 shot ordering, Q14 Chain's scope) are now
decided — see L26 and L27 below.


What remains below is not a to-do list — it's the set of decisions the designer
made knowingly against the maths, kept here so the first playtest knows exactly
what to measure.

---

## LOCKED

| # | Decision | Ruling |
|---|---|---|
| L1 | What cancels a Penalty? | **Both** Own Goal and VAR are valid objections. |
| L2 | Can a chain open with a Shot? | **Yes** — any Attack card may open a possession. |
| L3 | Power values | Deleted entirely. Type-based counters only. |
| L4 | Is Penalty a card or a marker? (was Q3) | **A normal card in the deck.** Drawn into hand like any other; play it after the opponent fouls you for a guaranteed goal. |
| L5 | Offside's targets (was Q2) | Pass · Assist · Shot Goal · Goal. **Not** Super Shot, **not** Dribble. |
| L6 | Foul's reach | **Not universal.** Pass · Dribble · Assist only. It cannot answer any shot or a Penalty. |
| L7 | Block's targets | Pass · Assist only — **not** Dribble. |
| L8 | Goal card's counters | Offside · VAR · Own Goal only. Goal Keeper and Block Shot do **not** stop it. |
| L10 | Yellow Card | Cut for now. May return as an expansion card. |
| L11 | Strategy mode defender | Draws 1–3 and plays that many, exactly like the attacker. |
| L12 | VAR's scope | Reviews a Goal, a Penalty, **or an Offside call** against you. |
| L13 | Deck exhaustion | The deck never runs out — reshuffle the discard and keep drawing. |
| L14 | 2v2 scoring (was Q5) | **Two routes.** A successful shot scores; **or** a partner's successful Assist transfers possession to you and unlocks your Goal card. |
| L28 | 2v2 defender | The **next player in the rotation** (always an opponent). Defending consumes your turn slot. |
| L29 | 2v2 possession on a won ball | Goes to the winner's **partner**, never the winner himself. |
| L30 | 2v2 neutral possession | To the next seat in rotation that holds an attack card; it can return to the attacking team. |
| L31 | After any goal (both modes) | Play resumes with the **conceding** side. Scoring never returns the ball to you. Own Goal needs no exception. |
| L35 | END_MATCH timing | **Attack turn only.** END_MATCH cannot be activated while defending — it is a troll card for attackers, not a panic button for defenders. Playing it as a defense card has no effect; it is just burn fodder for the mandatory-defense rule. |
| L34 | VAR reviewing an Offside call | **Closed — OFFSIDE calls ARE reviewable by VAR.** After OFFSIDE stops an attack, the attacker may play VAR to contest the call. Heads overturns the offside (attack continues), tails confirms it (defender keeps the ball). The attacker calls, not the defender, because the attacker is the one contesting. One VAR per event — if VAR is used on the offside, no further review is possible. Implementation: a new react_var_offside phase, attacker calls, same coin-flip resolution as goal/penalty VAR. |
| L33 | Reshuffle — who picks the cards | **Each player picks from their OWN hand.** In 1v1 (and a 2v2 deck swap) you choose the 2 cards leaving your hand — they are never random. In a 2v2 partner trade you choose your 2 and your partner chooses theirs; nobody reaches into the other's hand. Both hands stay at 4. |
| L32 | Partner communication | Talking is allowed; **naming or describing a card is not**. Hands stay hidden from partners. |
| L26 | Shot ordering (was Q13) | **A shot must be the LAST card of a chain.** Playing it closes the chain; leftover drawn cards burn. Balances Strategy mode to 51.4% vs 48.6%. |
| L27 | Chain's scope (was Q14) | **Build-up only** — Pass, Dribble, Assist. It can never answer a scoring card. General principle: a scoring card is only ever answered by the defenses named against it. |
| L25 | Block card (was Q7) | **Kept as-is.** Dominated by Interception, disabled in Strategy mode; its real role is fodder for the mandatory-defense rule. |
| L24 | Block Shot vs Goal Keeper (was Q6) | **Kept as intentional duplication.** Goal Keeper is stuck on a split card with Shot Goal; Block Shot is the only way to add shot-defense without adding shots. |
| L23 | Super Shot balance (was Q2b) | **Left as-is.** A rare finisher, not a duel — 2 copies only, answerable ~7–13% of the time. |
| L21 | Match length (was Q8) | **First to 3 goals.** Confirmed. |
| L22 | End Match on level scores | **The opponent wins.** The card is never a free win, and draws become impossible. |
| L20 | Turn limit (was Q11) | **None.** Matches end at goals_to_win or on End Match. Logged as an accepted risk. |
| L19 | Own Goal vs Penalty (was Q4) | **It converts.** The penalty becomes a goal for the fouling side; possession returns to the attacker who conceded. |
| L18 | Unplayable counter-attack leftovers | **Burned to the discard.** Full defense cards have no attack face, so they cannot be played as a counter-attack — hand returns to 4 regardless. |
| L17 | Strategy defense engine (was Q10) | Defender spends drawn cards **in order** as attempts; the first valid counter succeeds and **all unspent cards become an immediate counter-attack**. All failing = attack succeeds. |
| L16 | Strategy combo reward (was Q1) | **None.** Hand stays fixed at 4; the mode's value is agency and hand-churn. Logged as an accepted risk, not an open question. |
| L15 | Goal card's condition | Playable **only** right after a successful Assist **from your partner**. Never free-standing. |
| L9 | Own Goal's possession | Point to the side that played it, but **possession returns to the attacker** — he conceded an own goal, so he restarts. |

---

## Accepted risks — what to measure in the first playtest

---

- **Strategy mode's long combo is mathematically dominated.** Three cards produce
  the same result as one Shot, because the defender only ever answers the last
  card. Designer ruling: no compensating bonus; the 1–3 draw exists as a
  hand-churn tool. What to watch in the first playtest: does anyone draw 3 by
  choice, and if so, is it ever to attack rather than to dig for a card?

- **No turn limit.** A match can only end at 3 goals or on the single End Match
  card. The mitigating factor is that possession forces attack — a player holding
  the ball must play an attack card every turn, so stalling isn't legal. The
  residual risk is a player who repeatedly holds no attack card at all. Measure
  average match length in the first playtest.

## Live numbers after v1.2.0 (scripts/simulate.py, 10,000 matches per configuration)

**2v2 — the Assist route works.** It was the number I was most worried about, since
a static calculation put it at 9%. Measured in Luck 2v2: 2.52 Assists played per
match, 0.94 get through, 0.44 Goal cards played, and the Goal card produces
**12.4% of all goals** — roughly one every three matches. The route is a genuine
alternative, not a dead branch. In Strategy 2v2 it drops to 6.1%, because matches
are shorter.

**2v2 rewards shooting more than 1v1 does:** shoot-on-sight wins 65.8% in Luck 2v2
(vs 61.0% in 1v1), because a build-up card gives two opponents a chance at it
rather than one. Strategy 2v2 stays close at 52.9% vs 47.1%.

## Live numbers (1v1)

- **Luck mode:** shoot-on-sight wins 61.0%. Building up is a losing line here.
- **Strategy mode:** 51.4% vs 48.6% — balanced, and build-up cards are required.
- **Super Shot now succeeds 94.7%** (96% in Strategy), up from 83%, because Chain
  no longer quietly covered shots. It is 42–45% of all goals off 2 copies. If that
  is too dominant, dropping it to 1 copy is a one-number change in rules.json.
- **Penalty now succeeds 84.1%**, up from 76.5%, for the same reason.
- No match in 20,000 failed to end. Longest was 117 turns.

## Findings from the validator worth a decision

- **The Assist → Goal route succeeds ~9% of the time.** Assist is stopped 88% of
  the time (24 of 60 cards answer it), and Goal is then stopped 25% of the time.
  With 5 copies of each card, that's 10 cards of the deck riding on a 1-in-11
  play. Requiring the Assist was the right call for balance, but the gate may now
  be too tight — this is the first number to retune after a playtest.

- **Pass is answered 94% of the time in 1v1** (24 of 50 cards can stop it). It is
  currently the most common card in the deck and the weakest play in it.
- **Super Shot is answered ~13% of the time, and closer to 7% in practice** —
  because Block Save shares Super Shot's physical card, an attacker holding one
  copy leaves only one possible save in the whole deck. Accepted by design.
- **Penalty is answered 19–23% of the time** (3 cards: Own Goal + 2 VAR). A fair
  number for a card that needs a foul against you before you can even play it.
- Build-up cards (Pass, Dribble, Assist) sit on **42% of the deck** (25 of 60) but are never
  required to score, now that a Shot can open a chain. Their only function is
  attrition — forcing the defender to burn a card while you wait for a shot.
  Confirm that's intended, because it's a lot of cardboard doing one quiet job.
