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
