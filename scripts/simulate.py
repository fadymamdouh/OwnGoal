#!/usr/bin/env python3
"""
OWN GOAL match simulator.

Plays complete matches using the ruleset in references/rules.json — the counter
table, possession outcomes and deck quantities are all read from the file rather
than restated here, so the simulator can never quietly drift from the rules.

Usage:
    python scripts/simulate.py [--matches 10000] [--mode LUCK|STRATEGY|both]

Two attacking policies play head-to-head so the results answer a real question:

  SHOOTER  — shoots the moment a shot card is in hand.
  PATIENT  — plays one build-up card (Pass/Dribble) first to make the defender
             spend a card, then shoots on a later turn.

If Pass is worthless, SHOOTER wins clearly. If build-up play has value, PATIENT
does. That comparison is the point of the whole exercise.

Assumptions the rules don't cover (flagged in the report):
  A1 A player with no playable attack card concedes possession without drawing,
     so hand size cannot drift.
  A2 Reshuffle is played instead of conceding possession when the hand holds no
     attack card.
  A3 VAR is played against any conceded goal when held.

The shot-must-be-last rule and Chain's build-up-only restriction are both read
from rules.json, so they are rules here, not assumptions.
"""

import argparse
import json
import random
from collections import Counter, defaultdict
from pathlib import Path

RULES = json.load(open(Path(__file__).resolve().parent.parent /
                       "references" / "rules.json", encoding="utf-8"))

COUNTERS = {c["defense"]: set(c["stops"]) for c in RULES["counters"]}
SHOT_LAST = bool(RULES["play_modes"]["STRATEGY"].get("shot_must_be_last"))
POSSESSION = RULES["possession_after_successful_defense"]
CARDS = RULES["cards"]
GOALS_TO_WIN = RULES["match"]["goals_to_win"]
HAND = RULES["match"]["hand_size"]

SHOT_STAGE = {f for f, c in CARDS.items() if c.get("stage") == "shot"}
BUILD_UP = {f for f, c in CARDS.items()
            if c.get("class") == "attack" and c.get("stage") != "shot"}
# Preference order when attacking: finish if you can, cheapest build-up otherwise.
ATTACK_PRIORITY = ["SUPER_SHOT", "PENALTY", "SHOT_GOAL", "GOAL", "DRIBBLE", "PASS", "ASSIST"]
# What to throw away when forced to defend with nothing useful.
BURN_ORDER = ["BLOCK", "OFFSIDE", "FOUL", "PASS", "DRIBBLE", "RESHUFFLE",
              "BLOCK_SHOT", "SHOT_GOAL", "VAR", "OWN_GOAL", "SUPER_SHOT", "END_MATCH"]


class Card:
    __slots__ = ("attack", "defense", "special")

    def __init__(self, faces):
        self.attack = next((f for f in faces if CARDS[f].get("class") == "attack"), None)
        self.defense = next((f for f in faces if CARDS[f].get("class") == "defense"), None)
        self.special = next((f for f in faces if CARDS[f].get("class") == "special"), None)

    @property
    def faces(self):
        return [f for f in (self.attack, self.defense, self.special) if f]

    def __repr__(self):
        return "/".join(self.faces)


def build_deck(match_type, play_mode, stats):
    removed = set(RULES["match_types_detail"][match_type]["removed_cards"])
    disabled = set(RULES["play_modes"][play_mode]["disabled_cards"])
    deck = []
    for spec in RULES["physical_cards"]:
        faces = [f for f in spec["faces"] if f not in removed and f not in disabled]
        if len(faces) != len(spec["faces"]):
            continue  # a card losing any face is pulled from the deck entirely
        deck += [Card(spec["faces"]) for _ in range(spec["copies"])]
    stats["deck_size"] = len(deck)
    random.shuffle(deck)
    return deck


class Player:
    def __init__(self, name, policy):
        self.name = name
        self.policy = policy
        self.hand = []
        self.score = 0
        self.fouled = False       # may play PENALTY
        self.goal_unlocked = False  # a partner's Assist got through
        self.built_up = False     # PATIENT already made its build-up this possession

    def has(self, face):
        return any(face in c.faces for c in self.hand)

    def take(self, face):
        for c in self.hand:
            if face in c.faces:
                self.hand.remove(c)
                return c
        return None


class Match:
    """
    Seats are a fixed rotation. With 4 players the order is T1P1, T2P1, T1P2, T2P2,
    so seat i belongs to team i % 2, the next seat is always an opponent, and a
    player's partner is two seats along. The same arithmetic covers 1v1, where a
    player's "partner" resolves to himself — which is exactly right, since in 1v1
    whoever wins the ball attacks with it.
    """

    def __init__(self, mode, policies, stats, match_type="ONE_V_ONE"):
        self.mode = mode
        self.match_type = match_type
        self.stats = stats
        self.n = 2 if match_type == "ONE_V_ONE" else 4
        self.deck = build_deck(match_type, mode, stats)
        self.discard = []
        self.players = [Player(f"P{i}", policies[i % len(policies)]) for i in range(self.n)]
        for p in self.players:
            p.hand = [self.draw() for _ in range(HAND)]
        self.team_score = [0, 0]
        self.possession = random.randrange(self.n)
        self.actions = 0
        self.ended = None

    def team(self, i):
        return i % 2

    def partner(self, i):
        return (i + 2) % self.n

    def next_seat(self, i):
        return (i + 1) % self.n

    def next_with_attack(self, start):
        """Neutral ball: the next seat that can actually do something with it."""
        for k in range(self.n):
            i = (start + k) % self.n
            if self.pick_attack(self.players[i]) is not None:
                return i
        return start

    def next_of_team(self, start, team):
        for k in range(self.n):
            i = (start + k) % self.n
            if self.team(i) == team:
                return i
        return start

    # ---------------------------------------------------------------- deck

    def draw(self):
        if not self.deck:
            if not self.discard:
                return None
            self.deck, self.discard = self.discard, []
            random.shuffle(self.deck)
            self.stats["reshuffles"] += 1
        return self.deck.pop()

    def burn(self, card):
        if card:
            self.discard.append(card)

    # ---------------------------------------------------------------- choices

    def pick_attack(self, p):
        """Which attack face to play, honouring the player's policy."""
        options = [f for f in ATTACK_PRIORITY if p.has(f)]
        if "PENALTY" in options and not p.fouled:
            options.remove("PENALTY")
        if "GOAL" in options and not getattr(p, "goal_unlocked", False):
            options.remove("GOAL")
        if not options:
            return None
        if p.policy == "PATIENT" and not p.built_up:
            shots = [f for f in options if f in SHOT_STAGE]
            builds = [f for f in options if f in BUILD_UP]
            if shots and builds:
                p.built_up = True
                self.stats["voluntary_buildup"] += 1
                return builds[-1]
        return options[0]

    def pick_defense(self, p, attack):
        """A valid counter if one is held, preferring counters that win the ball."""
        valid = [d for d, stops in COUNTERS.items()
                 if attack in stops and p.has(d) and d != "VAR"]
        if not valid:
            return None
        valid.sort(key=lambda d: (POSSESSION.get(d, "neutral") != "defender",
                                  BURN_ORDER.index(d) if d in BURN_ORDER else 99))
        return valid[0]

    def pick_burn(self, p):
        for face in BURN_ORDER:
            if p.has(face):
                return face
        return p.hand[0].faces[0] if p.hand else None

    # ---------------------------------------------------------------- events

    def add_point(self, seat):
        self.team_score[self.team(seat)] += 1
        self.players[seat].score += 1

    def score_goal(self, scorer, conceder, kind):
        """Apply a goal, allowing the conceding side one VAR review (A4)."""
        if conceder.has("VAR"):
            self.burn(conceder.take("VAR"))
            self.stats["var_played"] += 1
            if random.random() < 0.5:
                self.stats["var_overturned"] += 1
                return False
        self.add_point(self.players.index(scorer))
        self.stats["goals_by_kind"][kind] += 1
        return True

    def resolve_shot(self, attacker, defender, face):
        """A shot got through. Own Goal can still convert it."""
        if defender.has("OWN_GOAL"):
            self.burn(defender.take("OWN_GOAL"))
            self.stats["own_goal_played"] += 1
            self.score_goal(defender, attacker, "own_goal")
            return "conceded_by_attacker"
        self.score_goal(attacker, defender, face)
        return "conceded_by_defender"

    # ---------------------------------------------------------------- turn

    def duel(self, attacker, defender, face):
        """One attack card against one defensive attempt. Returns new possession."""
        self.stats["attacks_played"][face] += 1
        defense = self.pick_defense(defender, face)
        if defense is None:
            burn = self.pick_burn(defender)
            self.burn(defender.take(burn))
            self.stats["burned"][burn] += 1
            self.stats["attack_succeeded"][face] += 1
            if face in SHOT_STAGE:
                return self.resolve_shot(attacker, defender, face)
            return "attacker"

        self.burn(defender.take(defense))
        self.stats["defenses_played"][defense] += 1
        self.stats["attack_stopped"][face] += 1
        if defense == "FOUL":
            attacker.fouled = True
            self.stats["fouls"] += 1
            return "attacker"
        return POSSESSION.get(defense, "neutral")

    def take_turn(self):
        self.actions += 1
        a_seat = self.possession
        d_seat = self.next_seat(a_seat)
        attacker = self.players[a_seat]
        defender = self.players[d_seat]

        # End Match is only ever correct when your team is ahead.
        for i, p in enumerate(self.players):
            if p.has("END_MATCH") and \
                    self.team_score[self.team(i)] > self.team_score[1 - self.team(i)]:
                self.burn(p.take("END_MATCH"))
                self.ended = ("end_match", i)
                return

        n = 1
        if self.mode == "STRATEGY":
            n = random.randint(1, 3)     # both sides may draw 1-3
        for _ in range(n):
            c = self.draw()
            if c:
                attacker.hand.append(c)

        played = 0
        possession = "attacker"
        while played < n:
            face = self.pick_attack(attacker)
            if face is None:
                break
            self.burn(attacker.take(face))
            played += 1
            if face == "PENALTY":
                attacker.fouled = False
                self.stats["penalties"] += 1
            # In Strategy mode only the LAST card of the chain is defended.
            if self.mode == "STRATEGY" and played < n and not (SHOT_LAST and face in SHOT_STAGE):
                self.stats["chain_passed_free"] += 1
                if face in SHOT_STAGE:
                    # an undefended shot mid-chain is a goal, and the chain closes.
                    self.stats["free_goals"] += 1
                    self.score_goal(attacker, defender, face + "_undefended")
                    possession = "conceded_by_defender"
                    break
                continue
            possession = self.duel(attacker, defender, face)
            if face == "ASSIST" and possession == "attacker":
                # the assist got through: the partner takes it and may play Goal
                self.stats["assists_completed"] += 1
                self.players[self.partner(a_seat)].goal_unlocked = True
                possession = "assist"
            if SHOT_LAST:
                for _ in range(n - played):
                    if attacker.hand:
                        self.burn(attacker.hand.pop(random.randrange(len(attacker.hand))))
                        self.stats["leftovers_burned"] += 1
            break

        if played == 0:
            # A1/A2: no attack available.
            if attacker.has("RESHUFFLE"):
                self.burn(attacker.take("RESHUFFLE"))
                self.stats["reshuffle_played"] += 1
                for _ in range(2):
                    c = self.draw()
                    if c:
                        attacker.hand.append(c)
                if attacker.hand:
                    self.burn(attacker.hand.pop(random.randrange(len(attacker.hand))))
            self.stats["turnovers"] += 1
            possession = "defender"

        # top both hands back up to 4 — parity is a hard rule
        for p in self.players:
            while len(p.hand) > HAND:
                self.burn(p.hand.pop())
            while len(p.hand) < HAND:
                c = self.draw()
                if not c:
                    break
                p.hand.append(c)

        if possession == "defender":
            # winning the ball hands it to your partner (in 1v1, to yourself)
            self.possession = self.partner(d_seat)
            attacker.built_up = False
        elif possession == "assist":
            self.possession = self.partner(a_seat)
        elif possession == "neutral":
            self.possession = self.next_with_attack(self.next_seat(d_seat))
            for p in self.players:
                p.built_up = False
        elif possession == "conceded_by_attacker":
            self.possession = self.next_of_team(self.next_seat(d_seat), self.team(a_seat))
        elif possession == "conceded_by_defender":
            self.possession = self.next_of_team(self.next_seat(d_seat), self.team(d_seat))

        for t in (0, 1):
            if self.team_score[t] >= GOALS_TO_WIN:
                self.ended = ("goals", t * 1)
                self.winning_team = t

    def play(self, cap=3000):
        while self.ended is None and self.actions < cap:
            self.take_turn()
        if self.ended is None:
            self.ended = ("stalled", None)
        return self.ended


def fresh_stats():
    return {
        "deck_size": 0, "reshuffles": 0, "turnovers": 0, "fouls": 0, "penalties": 0,
        "var_played": 0, "var_overturned": 0, "own_goal_played": 0,
        "reshuffle_played": 0, "free_goals": 0, "assists_completed": 0, "leftovers_burned": 0, "voluntary_buildup": 0, "chain_passed_free": 0,
        "attacks_played": Counter(), "attack_stopped": Counter(),
        "attack_succeeded": Counter(), "defenses_played": Counter(),
        "burned": Counter(), "goals_by_kind": Counter(),
    }


def run(mode, matches, match_type="ONE_V_ONE"):
    stats = fresh_stats()
    results = Counter()
    lengths, goal_totals = [], []
    wins = Counter()
    for i in range(matches):
        # alternate which seat each policy occupies so seat order can't bias it
        policies = ["SHOOTER", "PATIENT"] if i % 2 == 0 else ["PATIENT", "SHOOTER"]
        m = Match(mode, policies, stats, match_type)
        reason, winner = m.play()
        results[reason] += 1
        lengths.append(m.actions)
        goal_totals.append(sum(m.team_score))
        if reason == "goals":
            wins[m.players[getattr(m, "winning_team", 0)].policy] += 1
        elif reason == "end_match" and winner is not None:
            wins[m.players[winner].policy] += 1
    return stats, results, lengths, goal_totals, wins


def pct(n, d):
    return f"{(100.0 * n / d):.1f}%" if d else "—"


def report(mode, matches, match_type="ONE_V_ONE"):
    stats, results, lengths, goals, wins = run(mode, matches, match_type)
    n = matches
    label = "1v1" if match_type == "ONE_V_ONE" else "2v2"
    print(f"\n{'=' * 74}\n  {mode} MODE — {label} — {n:,} matches "
          f"(deck: {stats['deck_size']} cards)\n{'=' * 74}")

    print("\nHOW MATCHES END")
    for reason, c in results.most_common():
        label = {"goals": f"reached {GOALS_TO_WIN} goals",
                 "end_match": "End Match card",
                 "stalled": "never ended (hit the 3000-turn cap)"}[reason]
        print(f"  {label:<38} {pct(c, n):>7}")

    decided = sum(wins.values())
    print("\nWIN RATE BY ATTACKING POLICY")
    for policy in ("SHOOTER", "PATIENT"):
        print(f"  {policy:<38} {pct(wins[policy], decided):>7}")
    print("  (SHOOTER shoots on sight; PATIENT plays a build-up card first)")

    print("\nMATCH LENGTH (turns)")
    ls = sorted(lengths)
    print(f"  median {ls[len(ls) // 2]},  mean {sum(ls) / len(ls):.1f},  "
          f"90th pct {ls[int(len(ls) * 0.9)]},  longest {ls[-1]}")
    print(f"  goals per match: mean {sum(goals) / len(goals):.2f}")
    print(f"  deck reshuffled mid-match: {stats['reshuffles'] / n:.1f}x per match")

    print("\nATTACK CARDS — played, and how often they got through")
    print(f"  {'card':<14}{'played/match':>14}{'got through':>14}")
    for face, played in stats["attacks_played"].most_common():
        got = stats["attack_succeeded"][face]
        print(f"  {face:<14}{played / n:>14.2f}{pct(got, played):>14}")

    print("\nDEFENSE CARDS — how often each was actually used as a counter")
    for face, c in stats["defenses_played"].most_common():
        print(f"  {face:<14}{c / n:>8.2f} per match")

    print("\nCARDS THROWN AWAY (forced defense with no valid counter)")
    for face, c in stats["burned"].most_common(6):
        print(f"  {face:<14}{c / n:>8.2f} per match")

    print("\nKEY MECHANICS PER MATCH")
    for label, key in (("fouls", "fouls"), ("penalties converted", "penalties"),
                       ("VAR played", "var_played"), ("goals overturned by VAR", "var_overturned"),
                       ("Own Goal played", "own_goal_played"),
                       ("Reshuffle played", "reshuffle_played"),
                       ("possession conceded (no attack card)", "turnovers")):
        print(f"  {label:<38}{stats[key] / n:>8.2f}")
    if mode == "STRATEGY":
        print(f"  {'cards that passed undefended mid-chain':<38}{stats['chain_passed_free'] / n:>8.2f}")
        print(f"  {'UNDEFENDED GOALS from mid-chain shots':<38}{stats['free_goals'] / n:>8.2f}")
        print(f"  {'leftover cards burned after a shot':<38}{stats['leftovers_burned'] / n:>8.2f}")

    if match_type == "TWO_V_TWO":
        print("\n2v2 TEAMWORK")
        print(f"  {'Assist cards played':<38}{stats['attacks_played']['ASSIST'] / n:>8.2f}")
        print(f"  {'Assists that got through':<38}{stats['assists_completed'] / n:>8.2f}")
        print(f"  {'Goal cards played':<38}{stats['attacks_played']['GOAL'] / n:>8.2f}")
        print(f"  {'goals scored via the Goal card':<38}{stats['goals_by_kind']['GOAL'] / n:>8.2f}")

    print("\nGOALS BY SOURCE")
    tot = sum(stats["goals_by_kind"].values())
    for kind, c in stats["goals_by_kind"].most_common():
        print(f"  {kind:<14}{pct(c, tot):>8}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--matches", type=int, default=10000)
    ap.add_argument("--mode", default="both", choices=["LUCK", "STRATEGY", "both"])
    ap.add_argument("--players", default="both", choices=["1v1", "2v2", "both"])
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--no-shot-last", action="store_true",
                    help="Diagnostic: turn OFF the shot-must-be-last rule to re-measure the exploit.")
    a = ap.parse_args()
    random.seed(a.seed)
    if a.no_shot_last:
        globals()["SHOT_LAST"] = False
        print("\n[diagnostic] shot-must-be-last is OFF — expect undefended mid-chain goals.")
    types = {"1v1": ["ONE_V_ONE"], "2v2": ["TWO_V_TWO"],
             "both": ["ONE_V_ONE", "TWO_V_TWO"]}[a.players]
    for mt in types:
        for mode in (["LUCK", "STRATEGY"] if a.mode == "both" else [a.mode]):
            report(mode, a.matches, mt)
    print("\nAssumptions A1-A3 are listed at the top of this script — if any of them "
          "\nis wrong, the numbers change.\n")
