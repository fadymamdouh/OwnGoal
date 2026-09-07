"""
Rules constants loaded once at import time from references/rules.json.

Contains all card metadata, counter tables, possession outcomes, and mode
definitions. Nothing else in the engine package reads rules.json directly.
"""

import json
from pathlib import Path

RULES: dict = json.loads(
    (Path(__file__).resolve().parent.parent.parent / "references" / "rules.json")
    .read_text(encoding="utf-8")
)

COUNTERS: dict[str, set[str]] = {
    c["defense"]: set(c["stops"]) for c in RULES["counters"]
}
POSSESSION: dict[str, str] = RULES["possession_after_successful_defense"]
CARDS: dict[str, dict] = RULES["cards"]
GOALS_TO_WIN: int = RULES["match"]["goals_to_win"]
HAND: int = RULES["match"]["hand_size"]
SHOT_STAGE: set[str] = {f for f, c in CARDS.items() if c.get("stage") == "shot"}
ATTACK_FACES: set[str] = {f for f, c in CARDS.items() if c.get("class") == "attack"}
# Chain is filed as a special but answers build-up like a defense.
DEFENSE_FACES: set[str] = (
    {f for f, c in CARDS.items() if c.get("class") == "defense"} | {"CHAIN"}
)


class PHASES:
    """Phase identifiers — every value the ``phase`` field can hold."""

    ATTACK_DRAW: str = "attack_draw"
    ATTACK: str = "attack"
    DEFENSE_DRAW: str = "defense_draw"
    DEFENSE: str = "defense"
    REACT_OWN_GOAL: str = "react_own_goal"
    REACT_VAR: str = "react_var"
    REACT_VAR_OFFSIDE: str = "react_var_offside"
    RESHUFFLE_PICK: str = "reshuffle_pick"
    OVER: str = "over"


class EVENTS:
    """Event kind identifiers — every value the ``kind`` field in a log entry can hold."""

    ATTACK_PLAYED: str = "attack_played"
    CHAIN_PASSED: str = "chain_passed"
    COUNTER_ATTACK: str = "counter_attack"
    DECK_RECYCLED: str = "deck_recycled"
    DEFENSE_PLAYED: str = "defense_played"
    DREW: str = "drew"
    GOAL: str = "goal"
    GOAL_OVERTURNED: str = "goal_overturned"
    LEFTOVER_BURNED: str = "leftover_burned"
    MATCH_OVER: str = "match_over"
    OFFSIDE_OVERTURNED: str = "offside_overturned"
    OWN_GOAL_PLAYED: str = "own_goal_played"
    POSSESSION_CONCEDED: str = "possession_conceded"
    RESHUFFLE_OPENED: str = "reshuffle_opened"
    RESHUFFLE_PICKED: str = "reshuffle_picked"
    RESHUFFLE_TURN: str = "reshuffle_turn"
    RESHUFFLED: str = "reshuffled"
    STAGE_PASSED: str = "stage_passed"
    VAR: str = "var"


class ACTIONS:
    """Action type identifiers."""

    PLAY: str = "play"
    SPECIAL: str = "special"
    DRAW: str = "draw"
    PICK: str = "pick"
    PASS: str = "pass"
    CONCEDE_POSSESSION: str = "concede_possession"
