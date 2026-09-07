"""
OWN GOAL game engine package.

Public API::

    from engine import Game, bot_action, GOALS_TO_WIN, HAND

This package is a structural refactor of the original single-file engine.py.
No game logic has changed.
"""

from .bot import bot_action
from .game import Game
from .rules_loader import GOALS_TO_WIN, HAND

__all__ = ["Game", "bot_action", "GOALS_TO_WIN", "HAND"]
