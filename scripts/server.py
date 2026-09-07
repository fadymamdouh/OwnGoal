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
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from room_manager import FORMATS, RoomManager

STATIC = Path(__file__).resolve().parent.parent / "static"

app = FastAPI(title="OWN GOAL")
mgr = RoomManager()


@app.get("/")
async def index():
    return FileResponse(STATIC / "index.html")


@app.get("/health")
async def health():
    return {
        "rooms": len(mgr.rooms),
        "players": sum(len(r.players) for r in mgr.rooms.values()),
    }


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    room = None
    me = None
    try:
        while True:
            msg = await ws.receive_json()
            t = msg.get("t")

            if t == "create":
                fmt = msg.get("fmt", "1v1")
                if fmt not in FORMATS:
                    await mgr._send(ws, {"t": "error", "msg": "وضع لعب غير معروف"})
                    continue
                mode = "STRATEGY" if msg.get("mode") == "STRATEGY" else "LUCK"
                room = mgr.create_room(mode, fmt)
                me = room.add(msg.get("name") or "لاعب", ws)
                await mgr._send(
                    ws,
                    {"t": "joined", "token": me.token, "seat": me.seat, "code": room.code},
                )
                if room.start():
                    await mgr.broadcast_state(room)
                    asyncio.create_task(mgr.run_bots(room))
                else:
                    await mgr._send(ws, room.lobby())

            elif t == "join":
                room = mgr.get_room(msg.get("code"))
                if room is None:
                    await mgr._send(ws, {"t": "error", "msg": "الكود مش موجود"})
                    continue
                token = msg.get("token")
                existing = room.by_token(token) if token else None
                if existing:  # reconnect into the same seat
                    me = existing
                    me.ws, me.online = ws, True
                elif room.full:
                    await mgr._send(ws, {"t": "error", "msg": "الأوضة كاملة"})
                    room = None
                    continue
                else:
                    me = room.add(msg.get("name") or "لاعب", ws)
                await mgr._send(
                    ws,
                    {"t": "joined", "token": me.token, "seat": me.seat, "code": room.code},
                )
                if room.game is None and room.start():
                    pass
                await mgr.broadcast_state(room)
                asyncio.create_task(mgr.run_bots(room))

            elif t == "action":
                if not room or not me or room.game is None:
                    await mgr._send(ws, {"t": "error", "msg": "مفيش ماتش شغال"})
                    continue
                ok = await mgr.apply_action(room, me, msg.get("action") or {})
                if ok:
                    await mgr.broadcast_state(room)
                    asyncio.create_task(mgr.run_bots(room))

            elif t == "rematch":
                if room and room.full:
                    await mgr.rematch(room)
                    await mgr.broadcast_state(room)
                    asyncio.create_task(mgr.run_bots(room))

            elif t == "ping":
                await mgr._send(ws, {"t": "pong"})

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        print(f"[ws error] {exc}")
    finally:
        if me:
            me.ws, me.online = None, False
        if room:
            await mgr.broadcast_state(room)
            asyncio.create_task(mgr.reap_if_abandoned(room))


if STATIC.exists():
    app.mount("/static", StaticFiles(directory=STATIC), name="static")


if __name__ == "__main__":
    import uvicorn

    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))
    ap.add_argument("--host", default="0.0.0.0")
    a = ap.parse_args()
    uvicorn.run(app, host=a.host, port=a.port, log_level="warning")
