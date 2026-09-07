"""
OWN GOAL game engine package.

Public API::

    from engine import Game, bot_action, GOALS_TO_WIN, HAND

This package is a structural refactor of the original single-file engine.py.
No game logic has changed.
"""

from .bot import bot_action
from .game import Game
from .rules_loader import ACTIONS, EVENTS, GOALS_TO_WIN, HAND, PHASES

__all__ = ["ACTIONS", "EVENTS", "Game", "GOALS_TO_WIN", "HAND", "PHASES", "bot_action"]
