#!/usr/bin/env python3
"""
OWN GOAL — game server.

Rooms live in memory and are addressed by a 5-character code. No accounts: a
player is a name plus a token kept in their browser, which is what lets them
reconnect into the same seat after a dropped connection.

The server is authoritative. A client may only submit an action the engine
already listed as legal for its own seat, and only ever receives `view(seat)`.

    python scripts/server.py            # http://localhost:8000
    python scripts/server.py --port 9000
"""

from __future__ import annotations

import argparse
import asyncio
import os
import random
import uuid
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from engine import Game, bot_action

STATIC = Path(__file__).resolve().parent.parent / "static"
CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"   # no O/0, no I/1/L
FORMATS = {"1v1": ("ONE_V_ONE", 2), "bot": ("ONE_V_ONE", 2), "2v2": ("TWO_V_TWO", 4)}
BOT_DELAY = float(__import__("os").environ.get("OG_BOT_DELAY", "0.9"))
ABANDON_GRACE = 180   # seconds a room survives with nobody connected


class Player:
    def __init__(self, token, name, seat, ws=None, is_bot=False):
        self.token, self.name, self.seat = token, name, seat
        self.ws, self.is_bot = ws, is_bot
        self.online = ws is not None


class Room:
    def __init__(self, code, mode, fmt):
        self.code, self.mode, self.fmt = code, mode, fmt
        self.match_type, self.size = FORMATS[fmt]
        self.players: list[Player] = []
        self.game: Game | None = None
        self.lock = asyncio.Lock()

    @property
    def full(self):
        return len(self.players) >= self.size

    def by_token(self, token):
        return next((p for p in self.players if p.token == token), None)

    def by_seat(self, seat):
        return next((p for p in self.players if p.seat == seat), None)

    def add(self, name, ws, token=None, is_bot=False):
        p = Player(token or uuid.uuid4().hex, name, len(self.players), ws, is_bot)
        self.players.append(p)
        return p

    def start(self):
        if self.fmt == "bot" and len(self.players) == 1:
            self.add("البوت", None, is_bot=True)
        if not self.full:
            return False
        self.game = Game(mode=self.mode, match_type=self.match_type,
                         names=[p.name for p in self.players])
        return True

    def lobby(self):
        return {"t": "room", "code": self.code, "mode": self.mode, "fmt": self.fmt,
                "size": self.size, "started": self.game is not None,
                "players": [{"seat": p.seat, "name": p.name, "online": p.online,
                             "bot": p.is_bot} for p in self.players]}


ROOMS: dict[str, Room] = {}


def new_code():
    while True:
        code = "".join(random.choice(CODE_CHARS) for _ in range(5))
        if code not in ROOMS:
            return code


async def send(ws, payload):
    if ws is None:
        return
    try:
        await ws.send_json(payload)
    except Exception:
        pass


async def broadcast_state(room: Room):
    """Every human gets their own view; nobody gets anybody else's cards."""
    if room.game is None:
        for p in room.players:
            await send(p.ws, room.lobby())
        return
    for p in room.players:
        if p.ws:
            await send(p.ws, {"t": "state", "room": room.lobby(),
                              "view": room.game.view(p.seat)})


async def run_bots(room: Room):
    """Let any bot seat act until the turn comes back to a human."""
    g = room.game
    guard = 0
    while g and not g.over and guard < 200:
        guard += 1
        actor = next((s.index for s in g.seats if g.legal_actions(s.index)), None)
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


async def reap_if_abandoned(room: Room):
    """Keep an empty room alive for a while so a dropped player can come back."""
    await asyncio.sleep(ABANDON_GRACE)
    humans = [p for p in room.players if not p.is_bot]
    if humans and not any(p.online for p in humans):
        ROOMS.pop(room.code, None)


app = FastAPI(title="OWN GOAL")


@app.get("/")
async def index():
    return FileResponse(STATIC / "index.html")


@app.get("/health")
async def health():
    return {"rooms": len(ROOMS),
            "players": sum(len(r.players) for r in ROOMS.values())}


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    room: Room | None = None
    me: Player | None = None
    try:
        while True:
            msg = await ws.receive_json()
            t = msg.get("t")

            if t == "create":
                fmt = msg.get("fmt", "1v1")
                if fmt not in FORMATS:
                    await send(ws, {"t": "error", "msg": "وضع لعب غير معروف"})
                    continue
                mode = "STRATEGY" if msg.get("mode") == "STRATEGY" else "LUCK"
                room = Room(new_code(), mode, fmt)
                ROOMS[room.code] = room
                me = room.add(msg.get("name") or "لاعب", ws)
                await send(ws, {"t": "joined", "token": me.token, "seat": me.seat,
                                "code": room.code})
                if room.start():
                    await broadcast_state(room)
                    asyncio.create_task(run_bots(room))
                else:
                    await send(ws, room.lobby())

            elif t == "join":
                room = ROOMS.get((msg.get("code") or "").strip().upper())
                if room is None:
                    await send(ws, {"t": "error", "msg": "الكود مش موجود"})
                    continue
                token = msg.get("token")
                existing = room.by_token(token) if token else None
                if existing:                      # reconnect into the same seat
                    me = existing
                    me.ws, me.online = ws, True
                elif room.full:
                    await send(ws, {"t": "error", "msg": "الأوضة كاملة"})
                    room = None
                    continue
                else:
                    me = room.add(msg.get("name") or "لاعب", ws)
                await send(ws, {"t": "joined", "token": me.token, "seat": me.seat,
                                "code": room.code})
                if room.game is None and room.start():
                    pass
                await broadcast_state(room)
                asyncio.create_task(run_bots(room))

            elif t == "action":
                if not room or not me or room.game is None:
                    await send(ws, {"t": "error", "msg": "مفيش ماتش شغال"})
                    continue
                async with room.lock:
                    try:
                        room.game.apply(me.seat, msg.get("action") or {})
                    except ValueError as exc:
                        await send(ws, {"t": "error", "msg": "حركة مرفوضة"})
                        await send(ws, {"t": "state", "room": room.lobby(),
                                        "view": room.game.view(me.seat)})
                        print(f"[reject] {room.code} seat {me.seat}: {exc}")
                        continue
                await broadcast_state(room)
                asyncio.create_task(run_bots(room))

            elif t == "rematch":
                if room and room.full:
                    async with room.lock:
                        room.game = Game(mode=room.mode, match_type=room.match_type,
                                         names=[p.name for p in room.players])
                    await broadcast_state(room)
                    asyncio.create_task(run_bots(room))

            elif t == "ping":
                await send(ws, {"t": "pong"})

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        print(f"[ws error] {exc}")
    finally:
        if me:
            me.ws, me.online = None, False
        if room:
            await broadcast_state(room)
            asyncio.create_task(reap_if_abandoned(room))


if STATIC.exists():
    app.mount("/static", StaticFiles(directory=STATIC), name="static")


if __name__ == "__main__":
    import uvicorn
    ap = argparse.ArgumentParser()
    # hosts such as Render inject the port they want the app to listen on
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))
    ap.add_argument("--host", default="0.0.0.0")
    a = ap.parse_args()
    uvicorn.run(app, host=a.host, port=a.port, log_level="warning")
