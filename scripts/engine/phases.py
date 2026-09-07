"""
Phase handler methods for the Game class.

Each function here is a method of Game, injected via a mixin pattern.  They
handle the transitions between attack, defense, reaction, and reshuffle phases.
No function here is part of the public API — they are all underscore-prefixed
internal helpers called from ``Game.apply``.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from .rules_loader import (
    ACTIONS,
    COUNTERS,
    DEFENSE_FACES,
    EVENTS,
    PHASES,
    POSSESSION,
    SHOT_STAGE,
)

if TYPE_CHECKING:
    from .game import Game


# ── attack draw / defense draw ──────────────────────────────────────

def _do_draw(self: Game, seat_i: int, action: dict) -> None:
    n = action["n"]
    seat = self.seats[seat_i]
    for _ in range(n):
        c = self._draw()
        if c:
            seat.hand.append(c)
    self._emit(EVENTS.DREW, seat=seat_i, n=n)
    if self.phase == PHASES.ATTACK_DRAW:
        self.owed = n
        self.phase = PHASES.ATTACK
        if not self._playable_attack_faces(seat, self.owed <= 1):
            self._concede()
    else:
        self.def_owed = n
        self.phase = PHASES.DEFENSE


# ── attack ──────────────────────────────────────────────────────────

def _do_attack(self: Game, seat_i: int, action: dict) -> None:
    seat = self.seats[seat_i]
    if action["type"] == ACTIONS.CONCEDE_POSSESSION:
        self._concede()
        return
    card = seat.find(action["card_id"])
    face = action["face"]

    if action["type"] == ACTIONS.SPECIAL:
        self._burn(seat, card)
        if face == "END_MATCH":
            self._end_match(seat_i)
        else:
            self._open_reshuffle(seat_i, action.get("swap", "deck"))
        return

    self._burn(seat, card)
    self.chain.append(face)
    self.owed -= 1
    self._emit(EVENTS.ATTACK_PLAYED, seat=seat_i, face=face)
    if face == "PENALTY":
        seat.fouled = False

    # A shot always closes the chain and is always defended.
    if face in SHOT_STAGE:
        self._burn_owed(seat_i, self.owed)
        self.owed = 0
        self.phase = self._open_defense()
        return

    if self._strategy() and self.owed > 0:
        self._emit(EVENTS.CHAIN_PASSED, face=face)   # middle cards go unanswered
        if not self._playable_attack_faces(seat, self.owed <= 1):
            self._burn_owed(seat_i, self.owed)
            self.owed = 0
            self.phase = self._open_defense()
        return

    self.phase = self._open_defense()


# ── defense ─────────────────────────────────────────────────────────

def _do_defense(self: Game, seat_i: int, action: dict) -> None:
    seat = self.seats[seat_i]
    card = seat.find(action["card_id"])
    face = action["face"]
    target = self.chain[-1]
    self._burn(seat, card)
    self.def_owed -= 1
    answers = target in COUNTERS.get(face, set())

    # Own Goal does NOT stop a scoring card, it flips it: the point goes to
    # the defender and the ball to the attacker. Same resolution as the
    # react_own_goal path, so playing it directly is no longer a trap.
    # (rulebook: Own Goal)
    if face == "OWN_GOAL" and answers:
        self._emit(EVENTS.DEFENSE_PLAYED, seat=seat_i, face=face, stopped=False)
        self._burn_owed(seat_i, self.def_owed)
        self.def_owed = 0
        self._emit(EVENTS.OWN_GOAL_PLAYED, seat=seat_i)
        self._score(seat_i, "OWN_GOAL", conceder=self.possession)
        return

    # VAR is a coin-flip review, never a duel: tails overturns, heads
    # confirms. One review per event, so a confirmed goal cannot be
    # reviewed a second time from react_var. (rulebook: VAR)
    if face == "VAR" and answers:
        self._burn_owed(seat_i, self.def_owed)
        self.def_owed = 0
        flip = self.rng.choice(["heads", "tails"])
        overturned = flip == "tails"
        self._emit(EVENTS.VAR, seat=seat_i, flip=flip, overturned=overturned, reviewing=target)
        self._emit(EVENTS.DEFENSE_PLAYED, seat=seat_i, face=face,
                   stopped=overturned)
        if overturned:
            self._resolve_stopped("VAR", seat_i)
            return
        self.no_var_review = True
        self._shot_succeeded(seat_i)
        return

    stopped = answers
    self._emit(EVENTS.DEFENSE_PLAYED, seat=seat_i, face=face, stopped=stopped)

    if stopped:
        self._resolve_stopped(face, seat_i)
        return

    if self.def_owed > 0:
        return          # keep trying with the next drawn card

    # every attempt failed
    if target in SHOT_STAGE:
        self._shot_succeeded(seat_i)
    else:
        self._emit(EVENTS.STAGE_PASSED, face=target)
        self._refill_all()
        self.phase = PHASES.ATTACK if not self._strategy() else "attack_draw"
        if not self._strategy():
            c = self._draw()
            if c:
                self.seats[self.possession].hand.append(c)
            self.owed = 1
            if not self._playable_attack_faces(
                    self.seats[self.possession], True):
                self._concede()


# ── reaction: own goal ──────────────────────────────────────────────

def _do_own_goal(self: Game, seat_i: int, action: dict) -> None:
    if action["type"] == ACTIONS.PASS:
        self.pending = None
        self._score(self.possession, self.chain[-1])
        return
    seat = self.seats[seat_i]
    self._burn(seat, seat.find(action["card_id"]))
    self._emit(EVENTS.OWN_GOAL_PLAYED, seat=seat_i)
    self.pending = None
    self._score(seat_i, "OWN_GOAL", conceder=self.possession)


# ── reaction: VAR ───────────────────────────────────────────────────

def _do_var(self: Game, seat_i: int, action: dict) -> None:
    p = self.pending
    if action["type"] == ACTIONS.PASS:
        self.pending = None
        self._after_goal(p["conceder"])
        return
    seat = self.seats[seat_i]
    self._burn(seat, seat.find(action["card_id"]))
    flip = self.rng.choice(["heads", "tails"])
    overturned = flip == "tails"
    self._emit(EVENTS.VAR, seat=seat_i, flip=flip, overturned=overturned)
    if overturned:
        self.score[self.team(p["scorer"])] -= 1
        self._emit(EVENTS.GOAL_OVERTURNED, scorer=p["scorer"], score=list(self.score))
    self.pending = None
    self._after_goal(p["conceder"])


# ── reaction: VAR on offside ────────────────────────────────────────

def _do_var_offside(self: Game, seat_i: int, action: dict) -> None:
    p = self.pending
    def_seat = p["def_seat"]
    self.pending = None
    if action.get("type") == ACTIONS.PASS:
        self.no_var_review = True
        self._resolve_stopped("OFFSIDE", def_seat)
        return
    seat = self.seats[seat_i]
    card = seat.find(action["card_id"])
    self._burn(seat, card)
    flip = self.rng.choice(["heads", "tails"])
    overturned = flip == "tails"
    self._emit(EVENTS.VAR, seat=seat_i, flip=flip, overturned=overturned, reviewing="OFFSIDE")
    if overturned:
        self.no_var_review = True
        self._resolve_stopped("OFFSIDE", def_seat)
    else:
        self.no_var_review = True
        self._emit(EVENTS.OFFSIDE_OVERTURNED, seat=seat_i)
        self._refill_all()
        if self._strategy():
            self.phase = PHASES.ATTACK_DRAW
        else:
            self.phase = PHASES.ATTACK
            c = self._draw()
            if c:
                self.seats[self.possession].hand.append(c)
            self.owed = 1


# ── reshuffle ───────────────────────────────────────────────────────

def _do_reshuffle_pick(self: Game, seat_i: int, action: dict) -> None:
    p = self.pending
    p["chosen"].append(action["card_id"])
    self._emit(EVENTS.RESHUFFLE_PICKED, seat=seat_i, count=len(p["chosen"]))
    self._maybe_finish_picking()
