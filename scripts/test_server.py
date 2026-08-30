#!/usr/bin/env python3
"""
Server integration tests, over real WebSocket connections.

Start the server first, ideally with the bot delay switched off:

    OG_BOT_DELAY=0 python scripts/server.py --port 8127
    python scripts/test_server.py --port 8127

Checks:
  1. A solo match against the bot plays to a finish in both modes.
  2. A dropped player rejoining with their token lands in the SAME seat.
  3. An action the engine never offered is rejected, not applied.
  4. A four-player 2v2 room plays to a finish with four separate connections.
  5. A client's state message never contains another player's cards.
"""

import argparse
import asyncio
import json

import websockets

PORT = 8127
FAILURES = []


def check(cond, msg):
    if not cond:
        FAILURES.append(msg)


def url():
    return f"ws://localhost:{PORT}/ws"


async def recv(ws, want=None, timeout=20):
    while True:
        m = json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout))
        if want is None or m["t"] == want:
            return m


def act_from(view):
    a = dict(view["legal"][0])
    a.pop("counters", None)
    return a


def audit_view(v):
    """The view must describe other seats by card COUNT only."""
    for s in v["seats"]:
        if s["index"] == v["you"]:
            continue
        check("hand" not in s and "cards" in s,
              "a state message exposed another seat's hand")


async def solo(fmt, mode):
    async with websockets.connect(url()) as ws:
        await ws.send(json.dumps({"t": "create", "name": "تجربة",
                                  "fmt": fmt, "mode": mode}))
        steps = 0
        while steps < 900:
            m = await recv(ws)
            if m["t"] == "error":
                FAILURES.append(f"{fmt}/{mode}: server error {m['msg']}")
                return
            if m["t"] != "state":
                continue
            v = m["view"]
            audit_view(v)
            if v["over"]:
                print(f"  {fmt}/{mode}: finished {v['score']} "
                      f"in {steps} client actions")
                return
            if v["legal"]:
                steps += 1
                await ws.send(json.dumps({"t": "action", "action": act_from(v)}))
        FAILURES.append(f"{fmt}/{mode}: match never finished")


async def reconnect():
    ws = await websockets.connect(url())
    await ws.send(json.dumps({"t": "create", "name": "أ",
                              "fmt": "1v1", "mode": "LUCK"}))
    j = await recv(ws, "joined")
    code, token, seat = j["code"], j["token"], j["seat"]
    await ws.close()
    await asyncio.sleep(0.4)

    ws2 = await websockets.connect(url())
    await ws2.send(json.dumps({"t": "join", "code": code,
                               "token": token, "name": "أ"}))
    r = await recv(ws2)
    check(r["t"] == "joined", f"reconnect refused: {r}")
    check(r.get("seat") == seat, "reconnect landed in a different seat")
    print(f"  reconnect: back into seat {r.get('seat')} of room {code}")
    await ws2.close()


async def illegal():
    async with websockets.connect(url()) as ws:
        await ws.send(json.dumps({"t": "create", "name": "ب",
                                  "fmt": "bot", "mode": "LUCK"}))
        await recv(ws, "state")
        await ws.send(json.dumps({"t": "action", "action": {
            "type": "play", "card_id": "not-a-real-card", "face": "PASS"}}))
        seen = []
        for _ in range(5):
            m = await recv(ws)
            seen.append(m["t"])
            if m["t"] == "error":
                break
        check("error" in seen, f"illegal action was not rejected: {seen}")
        print("  illegal action: rejected")


async def four_player():
    a = await websockets.connect(url())
    await a.send(json.dumps({"t": "create", "name": "A",
                             "fmt": "2v2", "mode": "LUCK"}))
    code = (await recv(a, "joined"))["code"]
    conns = [a]
    for nm in ("B", "C", "D"):
        w = await websockets.connect(url())
        await w.send(json.dumps({"t": "join", "code": code, "name": nm}))
        await recv(w, "joined")
        conns.append(w)

    steps = 0
    while steps < 900:
        for w in conns:
            try:
                m = json.loads(await asyncio.wait_for(w.recv(), timeout=0.4))
            except asyncio.TimeoutError:
                continue
            if m["t"] != "state":
                continue
            v = m["view"]
            audit_view(v)
            if v["over"]:
                print(f"  2v2: finished {v['score']} in {steps} actions")
                for c in conns:
                    await c.close()
                return
            if v["legal"]:
                steps += 1
                await w.send(json.dumps({"t": "action", "action": act_from(v)}))
    FAILURES.append("2v2: match never finished")
    for c in conns:
        await c.close()


async def main():
    print("\nserver tests")
    for mode in ("LUCK", "STRATEGY"):
        await solo("bot", mode)
    await reconnect()
    await illegal()
    await four_player()

    if FAILURES:
        print(f"\n{len(FAILURES)} FAILURES")
        for f in FAILURES:
            print(f"  • {f}")
        return 1
    print("\nall server checks passed.\n")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8127)
    a = ap.parse_args()
    PORT = a.port
    raise SystemExit(asyncio.run(main()))
