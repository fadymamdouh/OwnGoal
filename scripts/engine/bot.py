"""
Bot player logic for OWN GOAL.

A serviceable opponent that reuses the policies the simulator validated.
Two policies: SHOOTER (fires immediately) and PATIENT (builds up first).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from .rules_loader import ACTIONS, DEFENSE_FACES, PHASES, POSSESSION, SHOT_STAGE

if TYPE_CHECKING:
    from .game import Game

PRIORITY: list[str] = [
    "SUPER_SHOT", "PENALTY", "SHOT_GOAL", "GOAL", "DRIBBLE", "PASS", "ASSIST",
]


def bot_action(game: Game, seat_i: int, policy: str = "SHOOTER") -> dict | None:
    """Choose an action for *seat_i* using the given *policy*."""
    acts = game.legal_actions(seat_i)
    if not acts:
        return None
    kinds = {a["type"] for a in acts}

    if ACTIONS.DRAW in kinds:
        return {"type": ACTIONS.DRAW, "n": 1}

    if game.phase == PHASES.REACT_OWN_GOAL:
        og = [a for a in acts if a.get("face") == "OWN_GOAL"]
        return og[0] if og else {"type": ACTIONS.PASS}

    if game.phase == PHASES.REACT_VAR:
        v = [a for a in acts if a.get("face") == "VAR"]
        return v[0] if v else {"type": ACTIONS.PASS}

    # Picking cards to swap away. A human dumps their least useful cards, so the
    # bot does the same: keep shots and split cards, spend spares first.
    if game.phase == PHASES.REACT_VAR_OFFSIDE:
        va = next((a for a in acts if a.get("face") == "VAR"), None)
        return va or {"type": ACTIONS.PASS}

    if game.phase == PHASES.RESHUFFLE_PICK:
        hand = {c.id: c for c in game.seats[seat_i].hand}

        def worth(a: dict) -> int:
            c = hand.get(a["card_id"])
            if c is None:
                return 0
            if c.kind == "split":
                return 3
            if c.faces[0] in SHOT_STAGE:
                return 3
            if c.faces[0] in DEFENSE_FACES:
                return 2
            if c.faces[0] == "RESHUFFLE":
                return 0
            return 1

        return sorted(acts, key=worth)[0]

    if game.phase == PHASES.DEFENSE:
        good = [a for a in acts if a.get("counters")]
        if good:
            good.sort(key=lambda a: POSSESSION.get(a["face"], "neutral") != "defender")
            return good[0]
        junk = sorted(acts, key=lambda a: a["face"] in PRIORITY)
        return junk[0]

    plays = [a for a in acts if a["type"] == ACTIONS.PLAY]
    if not plays:
        em = [a for a in acts if a.get("face") == "END_MATCH"]
        if em and game.score[game.team(seat_i)] > game.score[1 - game.team(seat_i)]:
            return em[0]
        # dead hand: reshuffle rather than concede
        rs = [a for a in acts if a.get("face") == "RESHUFFLE"
              and a.get("swap") == "deck"]
        return rs[0] if rs else acts[0]

    em = [a for a in acts if a.get("face") == "END_MATCH"]
    if em and game.score[game.team(seat_i)] > game.score[1 - game.team(seat_i)]:
        return em[0]

    order = PRIORITY
    if policy == "PATIENT":
        shots = [a for a in plays if a["face"] in SHOT_STAGE]
        builds = [a for a in plays if a["face"] not in SHOT_STAGE]
        if shots and builds:
            order = ["ASSIST", "PASS", "DRIBBLE"] + PRIORITY
    plays.sort(key=lambda a: order.index(a["face"]) if a["face"] in order else 99)
    return plays[0]
