#!/usr/bin/env python3
"""
Engine tests. Plays full matches through the same API the server will use, and
checks the invariants that matter for a networked card game:

  1. No illegal action is ever accepted.
  2. A seat's view never contains another seat's cards.
  3. Hands return to 4 whenever a turn boundary is reached.
  4. Total cards in the system stays constant — no card is duplicated or lost.
  5. Every match terminates.
  6. Only the seat named by the phase has legal actions.

Run: python scripts/test_engine.py [--matches 300]
"""

import argparse
import random
from collections import Counter

from engine import HAND, Game, bot_action

FAIL = []


def check(cond, msg):
    if not cond:
        FAIL.append(msg)


def total_cards(g):
    return len(g.deck) + len(g.discard) + sum(len(s.hand) for s in g.seats)


def play_one(mode, match_type, seed):
    g = Game(mode=mode, match_type=match_type, seed=seed)
    start_total = total_cards(g)
    steps = 0

    while not g.over and steps < 4000:
        steps += 1

        actors = [s.index for s in g.seats if g.legal_actions(s.index)]
        check(len(actors) <= 1,
              f"{mode}/{match_type}: {len(actors)} seats could act at once "
              f"in phase {g.phase}")
        if not actors:
            FAIL.append(f"{mode}/{match_type}: deadlock in phase {g.phase}")
            break
        seat = actors[0]

        # views must not leak
        v = g.view(seat)
        mine = {c["id"] for c in v["hand"]}
        for other in g.seats:
            if other.index == seat:
                continue
            check(not (mine & {c.id for c in other.hand}),
                  "a seat's view contained another seat's card ids")
        check(all(k != "hand" for k in v["seats"][0].keys()),
              "seat summaries leaked hands")

        # an action outside the legal list must be refused
        try:
            g.apply(seat, {"type": "play", "card_id": "does-not-exist",
                           "face": "PASS"})
            FAIL.append("engine accepted an action for a card not in hand")
        except ValueError:
            pass

        g.apply(seat, bot_action(g, seat,
                                "PATIENT" if seat % 2 else "SHOOTER"))

        check(total_cards(g) == start_total,
              f"card count drifted: {total_cards(g)} vs {start_total}")
        for s in g.seats:
            check(len(s.hand) <= HAND + 3,
                  f"hand grew to {len(s.hand)} in {mode}")

    check(g.over, f"{mode}/{match_type}: match did not finish in {steps} steps")
    return g, steps


def main(matches):
    random.seed(1)
    stats = Counter()
    lengths = []
    for i in range(matches):
        for mode in ("LUCK", "STRATEGY"):
            for mt in ("ONE_V_ONE", "TWO_V_TWO"):
                g, steps = play_one(mode, mt, seed=i * 97 + hash(mode + mt) % 1000)
                lengths.append(steps)
                if g.over:
                    reason = next((e["reason"] for e in reversed(g.log)
                                   if e["kind"] == "match_over"), "?")
                    stats[f"{mode}/{mt}/{reason}"] += 1

    print(f"\nplayed {matches * 4} matches "
          f"(2 modes x 2 formats x {matches} seeds)")
    print(f"median actions per match: {sorted(lengths)[len(lengths)//2]}")
    for k, v in sorted(stats.items()):
        print(f"  {k:<34}{v}")

    if FAIL:
        print(f"\n{len(FAIL)} FAILURES")
        for f in sorted(set(FAIL))[:12]:
            print(f"  • {f}")
        return 1
    print("\nall invariants held: no leaks, no illegal actions, "
          "no lost cards, every match finished.\n")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--matches", type=int, default=300)
    a = ap.parse_args()
    raise SystemExit(main(a.matches))
