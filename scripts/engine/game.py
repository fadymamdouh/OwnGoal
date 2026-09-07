"""
The Game class — authoritative game engine for OWN GOAL.

The server owns the deck and every hand. A client never receives another
player's cards: it gets ``view(seat)``, which strips hidden information, and it
never announces outcomes — it submits an action from ``legal_actions(seat)`` and
the engine decides what happened.

Public surface (all the server needs)::

    g = Game(mode="LUCK", match_type="ONE_V_ONE", seed=7)
    g.view(seat)             -> dict, safe to send to that seat
    g.legal_actions(seat)    -> list of action dicts that seat may submit
    g.apply(seat, action)    -> list of event dicts (the match log)
    g.phase, g.over, g.winner
"""

from __future__ import annotations

from .phases import (
    _do_attack,
    _do_defense,
    _do_draw,
    _do_own_goal,
    _do_reshuffle_pick,
    _do_var,
    _do_var_offside,
)
from .rng import build_deck, make_rng
from .rules_loader import (
    ATTACK_FACES,
    CARDS,
    COUNTERS,
    DEFENSE_FACES,
    GOALS_TO_WIN,
    HAND,
    POSSESSION,
    RULES,
    SHOT_STAGE,
)
from .types import Card, Seat


class Game:
    """A single OWN GOAL match."""

    # ── phase handlers (bound as methods from phases.py) ────────────
    _do_draw = _do_draw
    _do_attack = _do_attack
    _do_defense = _do_defense
    _do_own_goal = _do_own_goal
    _do_var = _do_var
    _do_var_offside = _do_var_offside
    _do_reshuffle_pick = _do_reshuffle_pick

    # ── setup ───────────────────────────────────────────────────────

    def __init__(
        self,
        mode: str = "LUCK",
        match_type: str = "ONE_V_ONE",
        names: list[str] | None = None,
        seed: int | None = None,
    ) -> None:
        if mode not in RULES["play_modes"]:
            raise ValueError(mode)
        self.mode = mode
        self.match_type = match_type
        self.rng = make_rng(seed)
        self.n: int = 2 if match_type == "ONE_V_ONE" else 4
        names = names or [f"P{i+1}" for i in range(self.n)]
        self.seats: list[Seat] = [Seat(i, names[i]) for i in range(self.n)]
        self.score: list[int] = [0, 0]
        self.log: list[dict] = []
        self.event_id: int = 0

        self.deck: list[Card] = build_deck(self.rng, match_type, mode)
        self.discard: list[Card] = []
        for s in self.seats:
            for _ in range(HAND):
                s.hand.append(self._draw())

        self.possession: int = self.rng.randrange(self.n)
        self.defender: int = self._next(self.possession)
        self.chain: list[str] = []
        self.owed: int = 0
        self.def_owed: int = 0
        self.no_var_review: bool = False
        self.pending: dict | None = None
        self.over: bool = False
        self.winner: int | None = None
        self.phase: str = self._open_attack()

    # ── helpers ─────────────────────────────────────────────────────

    def team(self, i: int) -> int:
        """Return team index (0 or 1) for seat *i*."""
        return i % 2

    def _partner(self, i: int) -> int:
        return (i + 2) % self.n

    def _next(self, i: int) -> int:
        return (i + 1) % self.n

    def _draw(self) -> Card | None:
        if not self.deck:
            if not self.discard:
                return None
            self.deck, self.discard = self.discard, []
            self.rng.shuffle(self.deck)
            self._emit("deck_recycled")
        return self.deck.pop()

    def _burn(self, seat: Seat, card: Card) -> None:
        seat.hand.remove(card)
        self.discard.append(card)

    def _emit(self, kind: str, **kw: object) -> dict:
        self.event_id += 1
        e = {"id": self.event_id, "kind": kind, **kw}
        self.log.append(e)
        return e

    def _refill(self, seat: Seat) -> None:
        while len(seat.hand) < HAND:
            c = self._draw()
            if not c:
                break
            seat.hand.append(c)

    def _strategy(self) -> bool:
        return self.mode == "STRATEGY"

    def _playable_attack_faces(self, seat: Seat, last_of_chain: bool) -> list[tuple[Card, str]]:
        """Attack faces this seat may legally play right now."""
        out: list[tuple[Card, str]] = []
        for c in seat.hand:
            f = c.face_of_class("attack")
            if not f:
                continue
            if f == "PENALTY" and not seat.fouled:
                continue
            if f == "GOAL" and not seat.goal_unlocked:
                continue
            # a shot closes the chain, so it may only be the final card
            if f in SHOT_STAGE and not last_of_chain and self._strategy():
                continue
            out.append((c, f))
        return out

    # ── phases ──────────────────────────────────────────────────────

    def _open_attack(self) -> str:
        self.chain = []
        self.defender = self._next(self.possession)
        if self._strategy():
            self.owed = 0
            return "attack_draw"
        self.owed = 1
        c = self._draw()
        if c:
            self.seats[self.possession].hand.append(c)
        return "attack"

    def _open_defense(self) -> str:
        if self._strategy():
            self.def_owed = 0
            return "defense_draw"
        self.def_owed = 1
        c = self._draw()
        if c:
            self.seats[self.defender].hand.append(c)
        return "defense"

    # ── views ───────────────────────────────────────────────────────

    def view(self, seat_i: int) -> dict:
        """Return game state visible to seat *seat_i*."""
        me = self.seats[seat_i]
        return {
            "you": seat_i,
            "mode": self.mode,
            "match_type": self.match_type,
            "phase": self.phase,
            "possession": self.possession,
            "defender": self.defender,
            "chain": list(self.chain),
            "score": list(self.score),
            "goals_to_win": GOALS_TO_WIN,
            "deck_left": len(self.deck),
            "discard": len(self.discard),
            "over": self.over,
            "winner": self.winner,
            "owed": self.owed if seat_i == self.possession else self.def_owed,
            "pending": self.pending,
            "hand": [c.as_dict() for c in me.hand],
            "flags": {"fouled": me.fouled, "goal_unlocked": me.goal_unlocked},
            "seats": [
                {"index": s.index, "name": s.name, "team": self.team(s.index),
                 "cards": len(s.hand)}
                for s in self.seats
            ],
            "legal": self.legal_actions(seat_i),
            "log": self.log[-12:],
        }

    # ── legality ────────────────────────────────────────────────────

    def legal_actions(self, seat_i: int) -> list[dict]:
        """Return all legal actions for seat *seat_i* in the current phase."""
        if self.over:
            return []
        me = self.seats[seat_i]
        acts: list[dict] = []

        if self.phase == "attack_draw" and seat_i == self.possession:
            top = min(3, max(1, len(self.deck) + len(self.discard)))
            return [{"type": "draw", "n": k} for k in range(1, top + 1)]

        if self.phase == "defense_draw" and seat_i == self.defender:
            top = min(3, max(1, len(self.deck) + len(self.discard)))
            return [{"type": "draw", "n": k} for k in range(1, top + 1)]

        if self.phase == "attack" and seat_i == self.possession:
            last = self.owed <= 1
            for c, f in self._playable_attack_faces(me, last):
                acts.append({"type": "play", "card_id": c.id, "face": f})
            for f in ("RESHUFFLE", "END_MATCH"):
                for c in me.hand:
                    if f not in c.faces:
                        continue
                    if f == "END_MATCH":
                        acts.append({"type": "special", "card_id": c.id, "face": f})
                    else:
                        # swap with the deck, or in 2v2 trade with your partner
                        acts.append({"type": "special", "card_id": c.id,
                                     "face": f, "swap": "deck"})
                        if self.n > 2:
                            acts.append({"type": "special", "card_id": c.id,
                                         "face": f, "swap": "partner"})
                    break
            if not any(a["type"] == "play" for a in acts):
                acts.append({"type": "concede_possession"})
            return acts

        if self.phase == "defense" and seat_i == self.defender:
            target = self.chain[-1]
            for c in me.hand:
                # VAR answers a Goal or a Penalty as a review — pure luck flip
                if "VAR" in c.faces and target in COUNTERS.get("VAR", set()):
                    acts.append({"type": "play", "card_id": c.id,
                                 "face": "VAR", "counters": True})
                    continue
                f = c.face_of_class("defense") or ("CHAIN" if "CHAIN" in c.faces else None)
                if f and f in DEFENSE_FACES:
                    valid = target in COUNTERS.get(f, set())
                    acts.append({"type": "play", "card_id": c.id, "face": f,
                                 "counters": valid})
                else:
                    # L35: END_MATCH cannot be activated while defending
                    if c.faces[0] == "END_MATCH":
                        continue
                    # mandatory attempt: any card may be burned
                    acts.append({"type": "play", "card_id": c.id,
                                 "face": c.faces[0], "counters": False})
            return acts

        # L33: each player picks the cards leaving their OWN hand
        if self.phase == "reshuffle_pick" and seat_i == self.pending["seat"]:
            chosen = self.pending["chosen"]
            for c in me.hand:
                if c.id not in chosen:
                    acts.append({"type": "pick", "card_id": c.id})
            return acts

        # L34: after OFFSIDE stops an attack, the attacker can contest with VAR
        if self.phase == "react_var_offside" and seat_i == self.pending["seat"]:
            for c in me.hand:
                if "VAR" in c.faces:
                    acts.append({"type": "play", "card_id": c.id, "face": "VAR", "counters": True})
            acts.append({"type": "pass"})
            return acts

        if self.phase == "react_own_goal" and seat_i == self.pending["seat"]:
            for c in me.hand:
                if "OWN_GOAL" in c.faces:
                    acts.append({"type": "play", "card_id": c.id, "face": "OWN_GOAL"})
            acts.append({"type": "pass"})
            return acts

        if self.phase == "react_var" and seat_i == self.pending["seat"]:
            for c in me.hand:
                if "VAR" in c.faces:
                    acts.append({"type": "play", "card_id": c.id, "face": "VAR"})
            acts.append({"type": "pass"})
            return acts

        return acts

    def _check(self, seat_i: int, action: dict) -> dict:
        for a in self.legal_actions(seat_i):
            if all(a.get(k) == v for k, v in action.items()):
                return a
        raise ValueError(f"illegal action for seat {seat_i}: {action}")

    # ── apply ───────────────────────────────────────────────────────

    def apply(self, seat_i: int, action: dict) -> list[dict]:
        """Validate and apply *action* for *seat_i*. Returns new log entries."""
        self._check(seat_i, action)
        before = len(self.log)
        handler = {
            "attack_draw": self._do_draw,
            "defense_draw": self._do_draw,
            "attack": self._do_attack,
            "defense": self._do_defense,
            "react_own_goal": self._do_own_goal,
            "react_var": self._do_var,
            "react_var_offside": self._do_var_offside,
            "reshuffle_pick": self._do_reshuffle_pick,
        }[self.phase]
        handler(seat_i, action)
        return self.log[before:]

    # ── scoring / resolution ────────────────────────────────────────

    def _resolve_stopped(self, face: str, def_seat: int) -> None:
        outcome = POSSESSION.get(face, "neutral")
        if face == "FOUL":
            self.seats[self.possession].fouled = True

        # L34: after OFFSIDE stops an attack, the attacker may contest with VAR
        if face == "OFFSIDE":
            atk = self.possession
            attacker = self._next_of_team(atk, self.team(atk))
            if not self.no_var_review and any("VAR" in c.faces for c in self.seats[attacker].hand):
                self.no_var_review = False
                self.pending = {"seat": attacker, "reason": "offside", "def_seat": def_seat}
                self.phase = "react_var_offside"
                return

        if outcome == "defender":
            self.possession = self._partner(def_seat)
            # Strategy: whatever the defender has left becomes a counter-attack
            if self._strategy() and self.def_owed > 0 and self.n == 2:
                self._refill_all()
                self.owed = self.def_owed
                self.def_owed = 0
                self.chain = []
                self.defender = self._next(self.possession)
                self._emit("counter_attack", seat=self.possession, cards=self.owed)
                self.phase = "attack"
                if not self._playable_attack_faces(
                        self.seats[self.possession], self.owed <= 1):
                    self._concede()
                return
        elif outcome == "attacker":
            pass
        else:
            self.possession = self._next_with_attack(self._next(def_seat))
        self._burn_owed(def_seat, self.def_owed)
        self.def_owed = 0
        self._refill_all()
        self.phase = self._open_attack()

    def _shot_succeeded(self, def_seat: int) -> None:
        self._burn_owed(def_seat, self.def_owed)
        self.def_owed = 0
        if any("OWN_GOAL" in c.faces for c in self.seats[def_seat].hand):
            self.pending = {"seat": def_seat, "reason": "shot", "face": self.chain[-1]}
            self.phase = "react_own_goal"
            return
        self._score(self.possession, self.chain[-1])

    def _score(self, scorer: int, face: str, conceder: int | None = None) -> None:
        conceder = self._next(scorer) if conceder is None else conceder
        self.score[self.team(scorer)] += 1
        ev = self._emit("goal", scorer=scorer, face=face, conceder=conceder,
                        score=list(self.score))
        victim = self._next_of_team(self._next(scorer), self.team(conceder))
        reviewed = self.no_var_review
        self.no_var_review = False
        if not reviewed and any("VAR" in c.faces for c in self.seats[victim].hand):
            self.pending = {"seat": victim, "reason": "goal", "event": ev["id"],
                            "scorer": scorer, "conceder": conceder}
            self.phase = "react_var"
            return
        self._after_goal(conceder)

    def _after_goal(self, conceder: int) -> None:
        self._refill_all()
        for t in (0, 1):
            if self.score[t] >= GOALS_TO_WIN:
                self.over, self.winner, self.phase = True, t, "over"
                self._emit("match_over", winner=t, reason="goals",
                           score=list(self.score))
                return
        self.possession = self._next_of_team(self._next(self.defender),
                                             self.team(conceder))
        self.phase = self._open_attack()

    # ── misc helpers ────────────────────────────────────────────────

    def _next_with_attack(self, start: int) -> int:
        for k in range(self.n):
            i = (start + k) % self.n
            if self._playable_attack_faces(self.seats[i], True):
                return i
        return start

    def _next_of_team(self, start: int, team: int) -> int:
        for k in range(self.n):
            i = (start + k) % self.n
            if self.team(i) == team:
                return i
        return start

    def _burn_owed(self, seat_i: int, n: int, why: str = "leftover_burned") -> None:
        """L18: cards drawn but never played are burned, so a hand never grows."""
        seat = self.seats[seat_i]
        for _ in range(n):
            if seat.hand:
                self._burn(seat, seat.hand[self.rng.randrange(len(seat.hand))])
                self._emit(why, seat=seat_i)

    def _refill_all(self) -> None:
        for s in self.seats:
            self._refill(s)

    def _concede(self) -> None:
        self._emit("possession_conceded", seat=self.possession)
        self._burn_owed(self.possession, self.owed)
        self.owed = self.def_owed = 0
        self._refill_all()
        self.possession = self._next(self.possession)
        self.phase = self._open_attack()

    # ── reshuffle ───────────────────────────────────────────────────

    def _open_reshuffle(self, seat_i: int, swap: str) -> None:
        partner = self._partner(seat_i)
        with_partner = swap == "partner" and self.n > 2 and partner != seat_i
        self.pending = {
            "kind": "reshuffle",
            "swap": "partner" if with_partner else "deck",
            "seat": seat_i,
            "owner": seat_i,
            "partner": partner if with_partner else None,
            "chosen": [],
            "taken": {},
        }
        self.phase = "reshuffle_pick"
        self._emit("reshuffle_opened", seat=seat_i,
                   swap=self.pending["swap"],
                   partner=partner if with_partner else None)
        self._maybe_finish_picking()

    def _maybe_finish_picking(self) -> None:
        p = self.pending
        seat = self.seats[p["seat"]]
        want = min(2, len(seat.hand))
        if len(p["chosen"]) < want:
            return

        picked = [seat.find(i) for i in p["chosen"]]
        picked = [c for c in picked if c is not None]
        p["taken"][p["seat"]] = picked
        for c in picked:
            seat.hand.remove(c)

        # partner trade: hand over so the partner picks from their own hand
        if (p["swap"] == "partner" and p["partner"] is not None
                and p["partner"] not in p["taken"]):
            p["seat"] = p["partner"]
            p["chosen"] = []
            self._emit("reshuffle_turn", seat=p["partner"])
            self._maybe_finish_picking()
            return

        if p["swap"] == "partner" and p["partner"] is not None:
            a, b = p["owner"], p["partner"]
            self.seats[a].hand.extend(p["taken"][b])
            self.seats[b].hand.extend(p["taken"][a])
            self._emit("reshuffled", seat=a, swap="partner", partner=b,
                       n=len(p["taken"][a]))
        else:
            self.discard.extend(p["taken"][p["owner"]])
            self._emit("reshuffled", seat=p["owner"], swap="deck",
                       n=len(p["taken"][p["owner"]]))

        self.pending = None
        self._refill_all()
        self.phase = "attack"
        if not self._playable_attack_faces(
                self.seats[self.possession], self.owed <= 1):
            self._concede()

    def _end_match(self, seat_i: int) -> None:
        mine, theirs = self.team(seat_i), 1 - self.team(seat_i)
        self.winner = mine if self.score[mine] > self.score[theirs] else theirs
        self.over, self.phase = True, "over"
        self._emit("match_over", winner=self.winner, reason="end_match",
                   played_by=seat_i, score=list(self.score))
