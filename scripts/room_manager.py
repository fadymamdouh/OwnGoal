"""
Room management for OWN GOAL server.

Contains the Player, Room, and RoomManager classes. All mutable game state
lives inside RoomManager — the server module never touches rooms directly.
"""

from __future__ import annotations

import asyncio
import random
import uuid

from fastapi import WebSocket

from engine import Game, bot_action

CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no O/0, no I/1/L
FORMATS: dict[str, tuple[str, int]] = {
    "1v1": ("ONE_V_ONE", 2),
    "bot": ("ONE_V_ONE", 2),
    "2v2": ("TWO_V_TWO", 4),
}
BOT_DELAY: float = float(__import__("os").environ.get("OG_BOT_DELAY", "1.1"))
ABANDON_GRACE: int = 180  # seconds a room survives with nobody connected


class Player:
    """A single connection in a room."""

    def __init__(
        self,
        token: str,
        name: str,
        seat: int,
        ws: WebSocket | None = None,
        is_bot: bool = False,
    ) -> None:
        self.token = token
        self.name = name
        self.seat = seat
        self.ws = ws
        self.is_bot = is_bot
        self.online: bool = ws is not None


class Room:
    """One match lobby (and, once started, the running game)."""

    def __init__(self, code: str, mode: str, fmt: str) -> None:
        self.code = code
        self.mode = mode
        self.fmt = fmt
        self.match_type, self.size = FORMATS[fmt]
        self.players: list[Player] = []
        self.game: Game | None = None
        self.lock = asyncio.Lock()

    @property
    def full(self) -> bool:
        """True once enough players have joined."""
        return len(self.players) >= self.size

    def by_token(self, token: str) -> Player | None:
        """Find a player by reconnect token."""
        return next((p for p in self.players if p.token == token), None)

    def by_seat(self, seat: int) -> Player | None:
        """Find a player by seat index."""
        return next((p for p in self.players if p.seat == seat), None)

    def add(
        self,
        name: str,
        ws: WebSocket | None,
        token: str | None = None,
        is_bot: bool = False,
    ) -> Player:
        """Add a player to the room and return them."""
        p = Player(token or uuid.uuid4().hex, name, len(self.players), ws, is_bot)
        self.players.append(p)
        return p

    def start(self) -> bool:
        """Create the Game if the room is ready. Returns True on success."""
        if self.fmt == "bot" and len(self.players) == 1:
            self.add("البوت", None, is_bot=True)
        if not self.full:
            return False
        self.game = Game(
            mode=self.mode,
            match_type=self.match_type,
            names=[p.name for p in self.players],
        )
        return True

    def lobby(self) -> dict:
        """Lobby snapshot safe to send to any client."""
        return {
            "t": "room",
            "code": self.code,
            "mode": self.mode,
            "fmt": self.fmt,
            "size": self.size,
            "started": self.game is not None,
            "players": [
                {"seat": p.seat, "name": p.name, "online": p.online, "bot": p.is_bot}
                for p in self.players
            ],
        }


class RoomManager:
    """Owns every Room and exposes the operations the WebSocket handler needs."""

    def __init__(self) -> None:
        self.rooms: dict[str, Room] = {}

    # ── room lifecycle ──────────────────────────────────────────────

    def _new_code(self) -> str:
        """Generate a unique 5-char room code."""
        while True:
            code = "".join(random.choice(CODE_CHARS) for _ in range(5))
            if code not in self.rooms:
                return code

    def create_room(self, mode: str, fmt: str) -> Room:
        """Create and register a new room."""
        room = Room(self._new_code(), mode, fmt)
        self.rooms[room.code] = room
        return room

    def get_room(self, code: str) -> Room | None:
        """Look up a room by code (case-insensitive)."""
        return self.rooms.get((code or "").strip().upper())

    def remove_room(self, code: str) -> None:
        """Remove a room from the registry."""
        self.rooms.pop(code, None)

    # ── messaging ───────────────────────────────────────────────────

    @staticmethod
    async def _send(ws: WebSocket | None, payload: dict) -> None:
        """Send JSON to a websocket, swallowing errors on dead connections."""
        if ws is None:
            return
        try:
            await ws.send_json(payload)
        except Exception:
            pass

    async def broadcast_state(self, room: Room) -> None:
        """Send each human player their own view (nobody sees another's cards)."""
        if room.game is None:
            for p in room.players:
                await self._send(p.ws, room.lobby())
            return
        for p in room.players:
            if p.ws:
                await self._send(
                    p.ws,
                    {"t": "state", "room": room.lobby(), "view": room.game.view(p.seat)},
                )

    # ── bot loop ────────────────────────────────────────────────────

    async def run_bots(self, room: Room) -> None:
        """Let any bot seat act until the turn comes back to a human."""
        g = room.game
        guard = 0
        while g and not g.over and guard < 200:
            guard += 1
            actor = next(
                (s.index for s in g.seats if g.legal_actions(s.index)), None
            )
            if actor is None:
                break
            p = room.by_seat(actor)
            if not p or not p.is_bot:
                break
            await asyncio.sleep(BOT_DELAY)
            action = bot_action(g, actor)
            if action is None:
                break
            g.apply(actor, action)
            await broadcast_state(room)

    # ── action dispatch ─────────────────────────────────────────────

    async def apply_action(
        self, room: Room, player: Player, action: dict
    ) -> bool:
        """Apply a player action under the room lock. Returns True on success."""
        async with room.lock:
            try:
                room.game.apply(player.seat, action)
                return True
            except (ValueError, Exception) as exc:
                await self._send(
                    player.ws, {"t": "error", "msg": "حركة مرفوضة"}
                )
                await self._send(
                    player.ws,
                    {
                        "t": "state",
                        "room": room.lobby(),
                        "view": room.game.view(player.seat),
                    },
                )
                print(f"[reject] {room.code} seat {player.seat}: {exc}")
                return False

    async def rematch(self, room: Room) -> None:
        """Start a new game in an existing room."""
        async with room.lock:
            room.game = Game(
                mode=room.mode,
                match_type=room.match_type,
                names=[p.name for p in room.players],
            )

    # ── cleanup ─────────────────────────────────────────────────────

    async def reap_if_abandoned(self, room: Room) -> None:
        """Remove a room after ABANDON_GRACE seconds if all humans disconnected."""
        await asyncio.sleep(ABANDON_GRACE)
        humans = [p for p in room.players if not p.is_bot]
        if humans and not any(p.online for p in humans):
            self.remove_room(room.code)
