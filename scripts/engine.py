#!/usr/bin/env python3
"""
OWN GOAL — authoritative game engine.

The server owns the deck and every hand. A client never receives another
player's cards: it gets `view(seat)`, which strips hidden information, and it
never announces outcomes — it submits an action from `legal_actions(seat)` and
the engine decides what happened.

Rules come from references/rules.json. Nothing here restates them.

Public surface, which is all the server needs:

    g = Game(mode="LUCK", match_type="ONE_V_ONE", seed=7)
    g.view(seat)             -> dict, safe to send to that seat
    g.legal_actions(seat)    -> list of action dicts that seat may submit
    g.apply(seat, action)    -> list of event dicts (the match log)
    g.phase, g.over, g.winner

Phases
    attack_draw    possession seat picks how many cards to draw (Strategy only)
    attack         possession seat plays attack cards; a shot closes the chain
    defense_draw   defender picks how many cards to draw (Strategy only)
    defense        defender spends cards in order trying to break possession
    react_own_goal defender may convert a successful shot with Own Goal
    react_var      the conceding side may review the goal once
    over
"""

from __future__ import annotations

import json
import random
from pathlib import Path

RULES = json.loads((Path(__file__).resolve().parent.parent /
                    "references" / "rules.json").read_text(encoding="utf-8"))

COUNTERS = {c["defense"]: set(c["stops"]) for c in RULES["counters"]}
POSSESSION = RULES["possession_after_successful_defense"]
CARDS = RULES["cards"]
GOALS_TO_WIN = RULES["match"]["goals_to_win"]
HAND = RULES["match"]["hand_size"]
SHOT_STAGE = {f for f, c in CARDS.items() if c.get("stage") == "shot"}
ATTACK_FACES = {f for f, c in CARDS.items() if c.get("class") == "attack"}
# Chain is filed as a special but answers build-up like a defense.
DEFENSE_FACES = {f for f, c in CARDS.items() if c.get("class") == "defense"} | {"CHAIN"}


class Card:
    __slots__ = ("id", "faces", "kind")

    def __init__(self, cid, faces, kind):
        self.id, self.faces, self.kind = cid, faces, kind

    def face_of_class(self, klass):
        for f in self.faces:
            if CARDS[f].get("class") == klass:
                return f
        return None

    def as_dict(self):
        return {"id": self.id, "faces": self.faces, "kind": self.kind}


class Seat:
    def __init__(self, index, name):
        self.index, self.name = index, name
        self.hand: list[Card] = []
        self.fouled = False          # may play Penalty
        self.goal_unlocked = False   # partner's Assist landed
        self.var_used_on = -1        # last event id this seat reviewed

    def find(self, cid):
        return next((c for c in self.hand if c.id == cid), None)


class Game:
    # ---------------------------------------------------------------- setup

    def __init__(self, mode="LUCK", match_type="ONE_V_ONE", names=None, seed=None):
        if mode not in RULES["play_modes"]:
            raise ValueError(mode)
        self.mode, self.match_type = mode, match_type
        self.rng = random.Random(seed)
        self.n = 2 if match_type == "ONE_V_ONE" else 4
        names = names or [f"P{i+1}" for i in range(self.n)]
        self.seats = [Seat(i, names[i]) for i in range(self.n)]
        self.score = [0, 0]
        self.log: list[dict] = []
        self.event_id = 0

        self.deck = self._build_deck()
        self.discard: list[Card] = []
        for s in self.seats:
            for _ in range(HAND):
                s.hand.append(self._draw())

        self.possession = self.rng.randrange(self.n)
        self.defender = self._next(self.possession)
        self.chain: list[str] = []      # faces played this attack, in order
        self.owed = 0                   # cards still to be played this turn
        self.def_owed = 0
        self.no_var_review = False  # set when a goal already had its VAR review
        self.pending = None             # payload for a reaction phase
        self.over = False
        self.winner = None
        self.phase = self._open_attack()

    def _build_deck(self):
        removed = set(RULES["match_types_detail"][self.match_type]["removed_cards"])
        disabled = set(RULES["play_modes"][self.mode]["disabled_cards"])
        deck, cid = [], 0
        for spec in RULES["physical_cards"]:
            if any(f in removed or f in disabled for f in spec["faces"]):
                continue
            for _ in range(spec["copies"]):
                kind = "split" if spec["type"] == "split" else "full"
                deck.append(Card(f"c{cid}", list(spec["faces"]), kind))
                cid += 1
        self.rng.shuffle(deck)
        return deck

    # ---------------------------------------------------------------- helpers

    def team(self, i):
        return i % 2

    def _partner(self, i):
        return (i + 2) % self.n

    def _next(self, i):
        return (i + 1) % self.n

    def _draw(self):
        if not self.deck:
            if not self.discard:
                return None
            self.deck, self.discard = self.discard, []
            self.rng.shuffle(self.deck)
            self._emit("deck_recycled")
        return self.deck.pop()

    def _burn(self, seat, card):
        seat.hand.remove(card)
        self.discard.append(card)

    def _emit(self, kind, **kw):
        self.event_id += 1
        e = {"id": self.event_id, "kind": kind, **kw}
        self.log.append(e)
        return e

    def _refill(self, seat):
        while len(seat.hand) < HAND:
            c = self._draw()
            if not c:
                break
            seat.hand.append(c)

    def _strategy(self):
        return self.mode == "STRATEGY"

    def _playable_attack_faces(self, seat: Seat, last_of_chain: bool):
        """Attack faces this seat may legally play right now."""
        out = []
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

    # ---------------------------------------------------------------- phases

    def _open_attack(self):
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

    def _open_defense(self):
        if self._strategy():
            self.def_owed = 0
            return "defense_draw"
        self.def_owed = 1
        c = self._draw()
        if c:
            self.seats[self.defender].hand.append(c)
        return "defense"

    # ---------------------------------------------------------------- views

    def view(self, seat_i):
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

    # ---------------------------------------------------------------- legality

    def legal_actions(self, seat_i):
        if self.over:
            return []
        me = self.seats[seat_i]
        acts = []

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
                # VAR answers a Goal or a Penalty as a review, caller picks a side
                if "VAR" in c.faces and target in COUNTERS.get("VAR", set()):
                    for call in ("heads", "tails"):
                        acts.append({"type": "play", "card_id": c.id,
                                     "face": "VAR", "call": call,
                                     "counters": True})
                    continue
                f = c.face_of_class("defense") or ("CHAIN" if "CHAIN" in c.faces else None)
                if f and f in DEFENSE_FACES:
                    valid = target in COUNTERS.get(f, set())
                    acts.append({"type": "play", "card_id": c.id, "face": f,
                                 "counters": valid})
                else:
                    # mandatory attempt: any card may be burned
                    acts.append({"type": "play", "card_id": c.id,
                                 "face": c.faces[0], "counters": False})
            return acts

        # L33: each player picks the cards leaving their OWN hand, one at a
        # time. Exactly 2, and never chosen at random.
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
                    for call in ("heads", "tails"):
                        acts.append({"type": "play", "card_id": c.id,
                                     "face": "VAR", "call": call, "counters": True})
            acts.append({"type": "pass"})   # always offered — attacker can waive
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
                    acts.append({"type": "play", "card_id": c.id, "face": "VAR",
                                 "call": "heads"})
                    acts.append({"type": "play", "card_id": c.id, "face": "VAR",
                                 "call": "tails"})
            acts.append({"type": "pass"})
            return acts

        return acts

    def _check(self, seat_i, action):
        for a in self.legal_actions(seat_i):
            if all(a.get(k) == v for k, v in action.items()):
                return a
        raise ValueError(f"illegal action for seat {seat_i}: {action}")

    # ---------------------------------------------------------------- apply

    def apply(self, seat_i, action):
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

    def _do_draw(self, seat_i, action):
        n = action["n"]
        seat = self.seats[seat_i]
        for _ in range(n):
            c = self._draw()
            if c:
                seat.hand.append(c)
        self._emit("drew", seat=seat_i, n=n)
        if self.phase == "attack_draw":
            self.owed = n
            self.phase = "attack"
            if not self._playable_attack_faces(seat, self.owed <= 1):
                self._concede()
        else:
            self.def_owed = n
            self.phase = "defense"

    def _do_attack(self, seat_i, action):
        seat = self.seats[seat_i]
        if action["type"] == "concede_possession":
            self._concede()
            return
        card = seat.find(action["card_id"])
        face = action["face"]

        if action["type"] == "special":
            self._burn(seat, card)
            if face == "END_MATCH":
                self._end_match(seat_i)
            else:
                self._open_reshuffle(seat_i, action.get("swap", "deck"))
            return

        self._burn(seat, card)
        self.chain.append(face)
        self.owed -= 1
        self._emit("attack_played", seat=seat_i, face=face)
        if face == "PENALTY":
            seat.fouled = False

        # A shot always closes the chain and is always defended.
        if face in SHOT_STAGE:
            self._burn_owed(seat_i, self.owed)
            self.owed = 0
            self.phase = self._open_defense()
            return

        if self._strategy() and self.owed > 0:
            self._emit("chain_passed", face=face)   # middle cards go unanswered
            if not self._playable_attack_faces(seat, self.owed <= 1):
                self._burn_owed(seat_i, self.owed)
                self.owed = 0
                self.phase = self._open_defense()
            return

        self.phase = self._open_defense()

    def _do_defense(self, seat_i, action):
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
            self._emit("defense_played", seat=seat_i, face=face, stopped=False)
            self._burn_owed(seat_i, self.def_owed)
            self.def_owed = 0
            self._emit("own_goal_played", seat=seat_i)
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
            self._emit("var", seat=seat_i, call=action.get("call"), flip=flip,
                       overturned=overturned, confirmed=flip == action.get("call"),
                       reviewing=target)
            self._emit("defense_played", seat=seat_i, face=face,
                       stopped=overturned)
            if overturned:
                self._resolve_stopped("VAR", seat_i)
                return
            self.no_var_review = True
            self._shot_succeeded(seat_i)
            return

        stopped = answers
        self._emit("defense_played", seat=seat_i, face=face, stopped=stopped)

        if stopped:
            self._resolve_stopped(face, seat_i)
            return

        if self.def_owed > 0:
            return          # keep trying with the next drawn card

        # every attempt failed
        if target in SHOT_STAGE:
            self._shot_succeeded(seat_i)
        else:
            self._emit("stage_passed", face=target)
            self._refill_all()
            self.phase = "attack" if not self._strategy() else "attack_draw"
            if not self._strategy():
                c = self._draw()
                if c:
                    self.seats[self.possession].hand.append(c)
                self.owed = 1
                if not self._playable_attack_faces(
                        self.seats[self.possession], True):
                    self._concede()

    def _resolve_stopped(self, face, def_seat):
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

    def _shot_succeeded(self, def_seat):
        self._burn_owed(def_seat, self.def_owed)
        self.def_owed = 0
        if any("OWN_GOAL" in c.faces for c in self.seats[def_seat].hand):
            self.pending = {"seat": def_seat, "reason": "shot", "face": self.chain[-1]}
            self.phase = "react_own_goal"
            return
        self._score(self.possession, self.chain[-1])

    def _do_var_offside(self, seat_i, action):
        p = self.pending
        def_seat = p["def_seat"]
        self.pending = None
        if action.get("type") == "pass":
            self.no_var_review = True
            self._resolve_stopped("OFFSIDE", def_seat)
            return
        seat = self.seats[seat_i]
        card = seat.find(action["card_id"])
        self._burn(seat, card)
        flip = self.rng.choice(["heads", "tails"])
        overturned = flip == "tails"
        self._emit("var", seat=seat_i, call=action.get("call"), flip=flip,
                   overturned=overturned, confirmed=flip == action.get("call"),
                   reviewing="OFFSIDE")
        if overturned:
            self.no_var_review = True
            self._resolve_stopped("OFFSIDE", def_seat)
        else:
            self.no_var_review = True
            self._emit("offside_overturned", seat=seat_i)
            self._refill_all()
            if self._strategy():
                self.phase = "attack_draw"
            else:
                self.phase = "attack"
                c = self._draw()
                if c:
                    self.seats[self.possession].hand.append(c)
                self.owed = 1

    def _do_own_goal(self, seat_i, action):
        if action["type"] == "pass":
            self.pending = None
            self._score(self.possession, self.chain[-1])
            return
        seat = self.seats[seat_i]
        self._burn(seat, seat.find(action["card_id"]))
        self._emit("own_goal_played", seat=seat_i)
        self.pending = None
        self._score(seat_i, "OWN_GOAL", conceder=self.possession)

    def _score(self, scorer, face, conceder=None):
        conceder = self._next(scorer) if conceder is None else conceder
        self.score[self.team(scorer)] += 1
        ev = self._emit("goal", scorer=scorer, face=face, conceder=conceder,
                        score=list(self.score))
        victim = self._next_of_team(self._next(scorer), self.team(conceder))
        reviewed = self.no_var_review      # already reviewed during the defense
        self.no_var_review = False
        if not reviewed and any("VAR" in c.faces for c in self.seats[victim].hand):
            self.pending = {"seat": victim, "reason": "goal", "event": ev["id"],
                            "scorer": scorer, "conceder": conceder}
            self.phase = "react_var"
            return
        self._after_goal(conceder)

    def _do_var(self, seat_i, action):
        p = self.pending
        if action["type"] == "pass":
            self.pending = None
            self._after_goal(p["conceder"])
            return
        seat = self.seats[seat_i]
        self._burn(seat, seat.find(action["card_id"]))
        flip = self.rng.choice(["heads", "tails"])
        confirmed = flip == action["call"]
        # the caller wins the flip only if it lands on the side they called;
        # heads confirms the decision, tails overturns it
        overturned = flip == "tails"
        self._emit("var", seat=seat_i, call=action["call"], flip=flip,
                   overturned=overturned, confirmed=confirmed)
        if overturned:
            self.score[self.team(p["scorer"])] -= 1
            self._emit("goal_overturned", scorer=p["scorer"], score=list(self.score))
        self.pending = None
        self._after_goal(p["conceder"])

    def _after_goal(self, conceder):
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

    # ---------------------------------------------------------------- misc

    def _next_with_attack(self, start):
        for k in range(self.n):
            i = (start + k) % self.n
            if self._playable_attack_faces(self.seats[i], True):
                return i
        return start

    def _next_of_team(self, start, team):
        for k in range(self.n):
            i = (start + k) % self.n
            if self.team(i) == team:
                return i
        return start

    def _burn_owed(self, seat_i, n, why="leftover_burned"):
        """L18: cards drawn but never played are burned, so a hand never grows."""
        seat = self.seats[seat_i]
        for _ in range(n):
            if seat.hand:
                self._burn(seat, seat.hand[self.rng.randrange(len(seat.hand))])
                self._emit(why, seat=seat_i)

    def _refill_all(self):
        for s in self.seats:
            self._refill(s)

    def _concede(self):
        self._emit("possession_conceded", seat=self.possession)
        self._burn_owed(self.possession, self.owed)
        self.owed = self.def_owed = 0
        self._refill_all()
        self.possession = self._next(self.possession)
        self.phase = self._open_attack()

    # ---------------------------------------------------------- reshuffle
    # L33: the player picks which cards leave their own hand. Playing the card
    # already discarded it, so the hand is at 3 here and exactly 2 more go.
    #
    # A partner trade needs BOTH players to choose, each from their own hand,
    # so the phase runs twice: whoever played the card picks first, then the
    # partner. Nobody reaches into anyone else's hand.
    #
    # Reshuffle does not consume the attack, so `owed` is left alone and play
    # returns to the attack phase once the picking is done.

    def _open_reshuffle(self, seat_i, swap):
        partner = self._partner(seat_i)
        with_partner = swap == "partner" and self.n > 2 and partner != seat_i
        self.pending = {
            "kind": "reshuffle",
            "swap": "partner" if with_partner else "deck",
            "seat": seat_i,        # whose turn it is to pick, right now
            "owner": seat_i,       # who played the card
            "partner": partner if with_partner else None,
            "chosen": [],          # ids picked by the seat currently choosing
            "taken": {},           # seat -> cards lifted out of that hand
        }
        self.phase = "reshuffle_pick"
        self._emit("reshuffle_opened", seat=seat_i,
                   swap=self.pending["swap"],
                   partner=partner if with_partner else None)
        self._maybe_finish_picking()

    def _do_reshuffle_pick(self, seat_i, action):
        p = self.pending
        p["chosen"].append(action["card_id"])
        self._emit("reshuffle_picked", seat=seat_i, count=len(p["chosen"]))
        self._maybe_finish_picking()

    def _maybe_finish_picking(self):
        p = self.pending
        seat = self.seats[p["seat"]]
        want = min(2, len(seat.hand))
        if len(p["chosen"]) < want:
            return                              # still choosing

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
        self.phase = "attack"        # Reshuffle never consumed the attack
        if not self._playable_attack_faces(
                self.seats[self.possession], self.owed <= 1):
            self._concede()

    def _end_match(self, seat_i):
        mine, theirs = self.team(seat_i), 1 - self.team(seat_i)
        # level scores hand the win to the opponent
        self.winner = mine if self.score[mine] > self.score[theirs] else theirs
        self.over, self.phase = True, "over"
        self._emit("match_over", winner=self.winner, reason="end_match",
                   played_by=seat_i, score=list(self.score))


# -------------------------------------------------------------------- bot

PRIORITY = ["SUPER_SHOT", "PENALTY", "SHOT_GOAL", "GOAL", "DRIBBLE", "PASS", "ASSIST"]


def bot_action(game: Game, seat_i, policy="SHOOTER"):
    """A serviceable opponent, reusing the policies the simulator validated."""
    acts = game.legal_actions(seat_i)
    if not acts:
        return None
    kinds = {a["type"] for a in acts}

    if "draw" in kinds:
        return {"type": "draw", "n": 1}

    if game.phase == "react_own_goal":
        og = [a for a in acts if a.get("face") == "OWN_GOAL"]
        return og[0] if og else {"type": "pass"}

    if game.phase == "react_var":
        v = [a for a in acts if a.get("face") == "VAR" and a.get("call") == "heads"]
        return v[0] if v else {"type": "pass"}

    # Picking cards to swap away. A human dumps their least useful cards, so the
    # bot does the same: keep shots and split cards, spend spares first.
    if game.phase == "react_var_offside":
        va = next((a for a in acts if a.get("face") == "VAR" and a.get("call") == "heads"), None)
        return va or {"type": "pass"}

    if game.phase == "reshuffle_pick":
        hand = {c.id: c for c in game.seats[seat_i].hand}

        def worth(a):
            c = hand.get(a["card_id"])
            if c is None:
                return 0
            if c.kind == "split":
                return 3                      # two uses in one card
            if c.faces[0] in SHOT_STAGE:
                return 3
            if c.faces[0] in DEFENSE_FACES:
                return 2
            if c.faces[0] == "RESHUFFLE":
                return 0                      # dump spares first
            return 1

        return sorted(acts, key=worth)[0]

    if game.phase == "defense":
        good = [a for a in acts if a.get("counters")]
        if good:
            good.sort(key=lambda a: POSSESSION.get(a["face"], "neutral") != "defender")
            return good[0]
        junk = sorted(acts, key=lambda a: a["face"] in PRIORITY)
        return junk[0]

    plays = [a for a in acts if a["type"] == "play"]
    if not plays:
        em = [a for a in acts if a.get("face") == "END_MATCH"]
        if em and game.score[game.team(seat_i)] > game.score[1 - game.team(seat_i)]:
            return em[0]
        # dead hand: reshuffle rather than concede. Deck swap, not a partner
        # trade — dragging a partner in needs judgement a bot does not have.
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
