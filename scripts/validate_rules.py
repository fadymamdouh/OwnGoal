#!/usr/bin/env python3
"""
OWN GOAL rules validator.

Reads references/rules.json and checks it for the classes of problem that
actually hurt a card game: unanswerable attacks, dead cards nobody would ever
play, duplicate cards doing the same job, and counters so rare they may as well
not exist.

Usage:
    python scripts/validate_rules.py [path/to/rules.json]

Exit codes: 0 = clean or warnings only, 1 = errors found.
"""

import json
import sys
from math import comb
from pathlib import Path

ERRORS, WARNINGS, INFO = [], [], []
POSSESSION_RANK = {"defender": 2, "neutral": 1, "attacker": 0}


def err(m):
    ERRORS.append(m)


def warn(m):
    WARNINGS.append(m)


def info(m):
    INFO.append(m)


# ---------------------------------------------------------------- loading

def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def counter_map(rules):
    """defense_id -> set(attack ids it stops)"""
    return {c["defense"]: set(c["stops"]) for c in rules["counters"]}


def cards_of_class(rules, klass):
    return {cid for cid, c in rules["cards"].items() if c.get("class") == klass}


def active_cards(rules, match_type=None, play_mode=None):
    """Card ids legal in a given match type / play mode."""
    out = set()
    removed = set(rules["match_types_detail"].get(match_type, {}).get("removed_cards", []))
    disabled = set(rules["play_modes"].get(play_mode, {}).get("disabled_cards", []))
    for cid, c in rules["cards"].items():
        if cid in removed or cid in disabled:
            continue
        if match_type and "match_types" in c and match_type not in c["match_types"]:
            continue
        if play_mode and "play_modes" in c and play_mode not in c["play_modes"]:
            continue
        out.add(cid)
    return out


# ---------------------------------------------------------------- checks

def check_integrity(rules):
    """Every printed face is a defined card, and every card gets printed."""
    faces = {f for p in rules["physical_cards"] for f in p["faces"]}
    defined = set(rules["cards"])

    for f in sorted(faces - defined):
        err(f"Face '{f}' is printed on a physical card but not defined in cards{{}}.")
    for c in sorted(defined - faces):
        err(f"Card '{c}' is defined but appears on no physical card — it cannot exist in play.")

    for c in rules["counters"]:
        if c["defense"] not in defined:
            err(f"Counter table references unknown defense '{c['defense']}'.")
        for a in c["stops"]:
            if a not in defined:
                err(f"Counter table references unknown attack '{a}'.")

    for d in counter_map(rules):
        if d not in rules["possession_after_successful_defense"] and d != "VAR":
            err(f"'{d}' can stop attacks but has no entry in possession_after_successful_defense.")


def check_every_attack_answerable(rules):
    """An attack with no counter is an auto-goal; that breaks the game."""
    cmap = counter_map(rules)
    for match_type in rules["match"]["match_types"]:
        for play_mode in rules["match"]["play_modes"]:
            live = active_cards(rules, match_type, play_mode)
            for atk in sorted(cards_of_class(rules, "attack") & live):
                answers = [d for d, stops in cmap.items() if atk in stops and d in live]
                if not answers:
                    err(f"[{match_type}/{play_mode}] '{atk}' has no legal counter — it always scores.")
                elif len(answers) == 1 and answers[0] != "FOUL":
                    info(f"[{match_type}/{play_mode}] '{atk}' has exactly one counter: {answers[0]}.")


def check_dead_defenses(rules):
    """A defense that stops nothing, or is beaten at its own job, is a dead card."""
    cmap = counter_map(rules)
    for d in sorted(cards_of_class(rules, "defense")):
        if not cmap.get(d):
            err(f"Defense '{d}' stops nothing — players have no reason to hold it.")

    copies = {}
    for spec in rules["physical_cards"]:
        for f in spec["faces"]:
            copies[f] = copies.get(f, 0) + spec["copies"]

    poss = rules["possession_after_successful_defense"]
    # Only compare true duel defenses. Cards like VAR sit in the counter table
    # but resolve as reviews, so dominance comparison is meaningless for them.
    names = sorted(d for d in cmap if rules["cards"][d].get("class") == "defense")
    for a in names:
        for b in names:
            if a >= b:
                continue
            sa, sb = cmap[a], cmap[b]
            pa = POSSESSION_RANK.get(poss.get(a, "neutral"), 1)
            pb = POSSESSION_RANK.get(poss.get(b, "neutral"), 1)
            notes = " ".join(str(c.get("note", "")) for c in rules["counters"]
                             if c["defense"] in (a, b))
            if sa == sb and pa == pb and "ACCEPTED_BY_DESIGNER" in notes:
                info(f"'{a}' and '{b}' are functionally identical — intentional, per designer ruling.")
            elif sa == sb and pa == pb:
                warn(f"'{a}' and '{b}' are functionally identical (same targets, same possession). "
                     f"Merge them or differentiate — your own design notes say merge duplicates.")
            elif sa >= sb and pa >= pb and (sa > sb or pa > pb) and \
                    copies.get(a, 0) * 2 <= copies.get(b, 0):
                info(f"'{a}' outclasses '{b}' but is far rarer ({copies.get(a)} vs {copies.get(b)} "
                     f"copies) — a premium card, balanced by scarcity.")
            elif sa >= sb and pa >= pb and (sa > sb or pa > pb) and "ACCEPTED_BY_DESIGNER" in notes:
                info(f"'{b}' is dominated by '{a}' — accepted by designer ruling.")
            elif sa >= sb and pa >= pb and (sa > sb or pa > pb):
                warn(f"'{b}' is strictly dominated by '{a}' (same or fewer targets, same or worse "
                     f"possession). Nobody will ever choose '{b}' on purpose.")


def check_stage_relevance(rules):
    """If a shot can open a chain, the build-up cards need a reason to exist."""
    if "any Attack card may open" not in rules["resolution"]["chain_opening"]:
        return
    stages = {}
    for cid, c in rules["cards"].items():
        if c.get("class") == "attack":
            stages.setdefault(c.get("stage"), []).append(cid)
    early = [c for s, cs in stages.items() if s != "shot" for c in cs]
    counts = {p["id"]: p["copies"] for p in rules["physical_cards"]}
    early_copies = sum(
        p["copies"] for p in rules["physical_cards"] if any(f in early for f in p["faces"])
    )
    total = sum(counts[p["id"]] for p in rules["physical_cards"] if p["type"] != "token")
    if rules["play_modes"].get("STRATEGY", {}).get("shot_must_be_last"):
        info(f"Build-up cards ({', '.join(sorted(early))}) sit on {early_copies} of {total} physical "
             f"cards. In STRATEGY mode the shot-must-be-last rule makes them mandatory for any multi-card "
             f"chain. In LUCK mode their value is attrition — measured at 61% vs 39% in favour of "
             f"shooting on sight, so they are the fallback play rather than a tactic.")
        return
    warn(f"Any Attack card may open a chain, so build-up cards ({', '.join(sorted(early))}) are "
         f"never *required* to score. They sit on {early_copies} of {total} physical cards "
         f"({early_copies / total:.0%} of the deck). Their only value is attrition — forcing the "
         f"defender to burn a card while you wait to draw a shot. Confirm that is the intent.")


def check_strategy_combo(rules):
    """Strategy mode: does a longer combo actually buy anything?"""
    s = rules["play_modes"].get("STRATEGY", {})
    if "LAST card" not in s.get("defense_answers", "") and "last" not in s.get("defense_answers", ""):
        return
    if "ACCEPTED_BY_DESIGNER" in str(s.get("combo_reward", "")):
        info("STRATEGY mode: no combo reward, by designer ruling. The 1-3 draw is a hand-churn tool "
             "rather than an offensive one — a 3-card combo costs two extra cards for the same outcome "
             "as a lone Shot. Accepted risk; recheck after playtesting.")
        return
    if not s.get("combo_reward"):
        warn("STRATEGY mode: the defender answers only the last card, so drawing 3 and playing "
             "Pass→Dribble→Shot achieves exactly what drawing 1 and playing Shot achieves — while "
             "spending two extra cards. Drawing 1 is always optimal and the mode collapses into "
             "Luck mode. Add a 'combo_reward' rule (e.g. a 3-card chain cannot be answered by Foul, "
             "or a completed combo scores 2) or drop the mode.")


def check_availability(rules):
    """
    Hypergeometric reality check: how often does the defender actually hold an answer?
    Split cards matter here — one physical card can carry two different answers.
    """
    cmap = counter_map(rules)
    hand = rules["match"]["hand_size"]
    for match_type in rules["match"]["match_types"]:
        live = active_cards(rules, match_type, "LUCK")
        deck = [p for p in rules["physical_cards"]
                if p["type"] != "token" and any(f in live for f in p["faces"])]
        N = sum(p["copies"] for p in deck)
        info(f"[{match_type}] draw deck = {N} physical cards.")
        for atk in sorted(cards_of_class(rules, "attack") & live):
            answers = {d for d, stops in cmap.items() if atk in stops and d in live}
            carriers = sum(p["copies"] for p in deck if answers & set(p["faces"]))
            if carriers == 0 or N - carriers < hand:
                p_hit = 1.0
            else:
                p_hit = 1 - comb(N - carriers, hand) / comb(N, hand)
            line = (f"[{match_type}] '{atk}': {carriers}/{N} cards can answer it → "
                    f"{p_hit:.0%} chance a 4-card hand holds an answer.")
            accepted = any("ACCEPTED_BY_DESIGNER" in str(c.get("note", ""))
                           for c in rules["counters"] if atk in c["stops"])
            if p_hit < 0.15 and accepted:
                info(line + " Accepted by designer as a rare finisher rather than a duel.")
            elif p_hit < 0.15:
                warn(line + " Practically unstoppable — this is a guaranteed goal, not a duel.")
            elif p_hit > 0.90:
                warn(line + " Almost always answered — this attack is near-worthless.")
            else:
                info(line)


def check_var_scope(rules):
    """VAR sits in the counter table but resolves as a review — keep the two lists in step."""
    var = next((c for c in rules["counters"] if c["defense"] == "VAR"), None)
    declared = set(rules["resolution"].get("var", {}).get("reviewable", []))
    if var and declared and set(var["stops"]) != declared:
        err(f"VAR's counter-table targets {sorted(var['stops'])} do not match "
            f"resolution.var.reviewable {sorted(declared)}.")


def check_endless_deck(rules):
    """If the deck recycles forever, something else has to be able to end the match."""
    if "exhaustion" in " ".join(rules["match"]["ends_when"]).lower():
        return
    if "ACCEPTED_BY_DESIGNER" in str(rules["match"].get("turn_limit_ruling", "")):
        info("No turn limit, by designer ruling. Matches end only at goals_to_win or on the single "
             "END_MATCH card. Mandatory attacking makes stalling illegal, so this is survivable — but "
             "measure match length in playtesting.")
        return
    if "never run" in rules["resolution"].get("deck_refill", "") or \
       "shuffle the discard" in rules["resolution"].get("deck_refill", ""):
        ends = [e for e in rules["match"]["ends_when"] if "END_MATCH" not in e]
        warn(f"The deck recycles forever, so a match can only end by {ends[0]} or the single "
             f"END_MATCH card. Two cagey players who both refuse to shoot have no exit. Consider a "
             f"turn limit, or a second copy of END_MATCH.")


def check_provisional(rules):
    """Surface everything still marked unresolved so nothing gets printed by accident."""
    found = []

    def walk(node, path):
        if isinstance(node, dict):
            for k, v in node.items():
                walk(v, f"{path}.{k}")
        elif isinstance(node, list):
            for i, v in enumerate(node):
                walk(v, f"{path}[{i}]")
        elif isinstance(node, str) and ("PROVISIONAL" in node or "open question" in node.lower()):
            found.append((path.lstrip("."), node))

    walk(rules, "")
    for path, text in found:
        warn(f"UNRESOLVED at {path}: {text}")
    if found:
        warn(f"{len(found)} rule(s) still provisional — do not send art to print until these close.")


def check_parity(rules):
    """The designer's stated priority: neither side gains a card-count advantage."""

    def balanced(draw, play):
        # "exactly the number drawn" is self-balancing whatever the range.
        if isinstance(play, str) and "number drawn" in play:
            return True
        return draw == play

    for mode, m in rules["play_modes"].items():
        d_draw, d_play = m.get("draw_per_defense_action"), m.get("play_per_defense_action")
        if not balanced(d_draw, d_play):
            err(f"[{mode}] defender draws {d_draw} but plays {d_play} — hand size will drift.")
        a_draw, a_play = m.get("draw_per_attack_action"), m.get("play_per_attack_action")
        if not balanced(a_draw, a_play):
            err(f"[{mode}] attacker draws {a_draw} but plays {a_play} — hand size will drift.")
    if not rules["resolution"].get("mandatory_defense_attempt"):
        err("No mandatory defense attempt rule — hands will desynchronise.")


# ---------------------------------------------------------------- report

def main():
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else \
        Path(__file__).resolve().parent.parent / "references" / "rules.json"
    rules = load(path)

    for fn in (check_integrity, check_every_attack_answerable, check_dead_defenses,
               check_stage_relevance, check_strategy_combo, check_availability,
               check_var_scope, check_endless_deck, check_provisional, check_parity):
        fn(rules)

    print(f"\nOWN GOAL rules validator — {rules['game']} v{rules['version']}")
    print("=" * 72)
    for label, bucket in (("ERRORS", ERRORS), ("WARNINGS", WARNINGS), ("NOTES", INFO)):
        if not bucket:
            continue
        print(f"\n{label} ({len(bucket)})")
        print("-" * 72)
        for m in bucket:
            print(f"  • {m}")
    print("\n" + "=" * 72)
    print(f"{len(ERRORS)} errors, {len(WARNINGS)} warnings, {len(INFO)} notes.")
    print("Errors break the game and must be fixed. Warnings are design debt —"
          "\nresolve them before committing anything to print.\n")
    return 1 if ERRORS else 0


if __name__ == "__main__":
    sys.exit(main())
