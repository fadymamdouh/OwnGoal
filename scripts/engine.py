"""
Backward-compatibility shim.

server.py and test_engine.py do ``from engine import Game, bot_action``.
This file re-exports everything from the engine package so those imports
continue to work without changes.
"""

from engine import *  # noqa: F401,F403
