"""
Card and Seat classes used by the game engine.

These are plain data holders with minimal logic. Card knows how to find a face
by class; Seat knows how to find a card by id. Neither imports game logic.
"""

from .rules_loader import CARDS


class Card:
    """A single physical card in the game, which may have one or two faces."""

    __slots__ = ("id", "faces", "kind")

    def __init__(self, cid: str, faces: list[str], kind: str) -> None:
        self.id = cid
        self.faces = faces
        self.kind = kind

    def face_of_class(self, klass: str) -> str | None:
        """Return the first face whose class matches *klass*, or None."""
        for f in self.faces:
            if CARDS[f].get("class") == klass:
                return f
        return None

    def as_dict(self) -> dict:
        """Serialise for JSON transport (view payloads)."""
        return {"id": self.id, "faces": self.faces, "kind": self.kind}


class Seat:
    """One player seat. Tracks hand, flags, and VAR usage."""

    def __init__(self, index: int, name: str) -> None:
        self.index = index
        self.name = name
        self.hand: list[Card] = []
        self.fouled: bool = False          # may play Penalty
        self.goal_unlocked: bool = False   # partner's Assist landed
        self.var_used_on: int = -1         # last event id this seat reviewed

    def find(self, cid: str) -> Card | None:
        """Find a card in hand by id."""
        return next((c for c in self.hand if c.id == cid), None)
