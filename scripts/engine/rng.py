"""
Seeded RNG wrapper and deck construction.

The game's randomness flows through a single ``random.Random`` instance so
matches are reproducible given a seed.  The deck builder reads physical-card
specs from rules.json and filters by mode and match type.
"""

import random

from .rules_loader import RULES
from .types import Card


def make_rng(seed: int | None = None) -> random.Random:
    """Create a seeded RNG instance."""
    return random.Random(seed)


def build_deck(
    rng: random.Random,
    match_type: str,
    mode: str,
) -> list[Card]:
    """Build and shuffle a deck for the given match type and mode."""
    removed = set(RULES["match_types_detail"][match_type]["removed_cards"])
    disabled = set(RULES["play_modes"][mode]["disabled_cards"])
    deck: list[Card] = []
    cid = 0
    for spec in RULES["physical_cards"]:
        if any(f in removed or f in disabled for f in spec["faces"]):
            continue
        for _ in range(spec["copies"]):
            kind = "split" if spec["type"] == "split" else "full"
            deck.append(Card(f"c{cid}", list(spec["faces"]), kind))
            cid += 1
    rng.shuffle(deck)
    return deck
